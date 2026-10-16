"use server";

/**
 * Asking for an équipe type — the cache, then the model, then the algorithm (decision 204).
 *
 * This is the one place that chooses between the three paths, which is deliberate: `seven-llm.ts` never
 * calls `solveSeven` and `sevens.ts` knows nothing about a model, so neither of them can decide, and
 * only the screen knows what it is allowed to show. The order is:
 *
 * 1. **the cache**, on `(team_id, fingerprint)`. A hit is re-validated against *today's* candidates and
 *    a failure there is a miss, not an error (`restoreSeven` argues why);
 * 2. **the model**, on a miss, with the answer written back;
 * 3. **the algorithm**, whenever the model could not answer — and the caller is told *which*, because
 *    the screen has to say so out loud rather than pass off one for the other.
 *
 * ## Permission
 *
 * `team:read` (decision 002), through `assertCan` like every other mutation (invariant 4). The screen
 * is read-only and this action invents no new reach: it writes one cache row for a question the same
 * reader could already ask by loading the page. No permission is created for it, because a seven a
 * player may read is a seven a player may have computed.
 *
 * ## Why a Server Action for a read
 *
 * Two callers, one code path. The page awaits it inside a `<Suspense>`, so the model's seconds stream
 * instead of blocking the header; and `askWithContext` is the context field's `action`, which runs the
 * very same resolution after putting the typed sentence in the URL — so « submitting re-asks » is one
 * navigation and the answer stays shareable and reloadable, exactly like the two selects next to it.
 *
 * Everything returned is plain and serialisable, and **no raw API error ever crosses this boundary**:
 * a status code and a provider's body are not copy, so the failure leaves here as one of five typed
 * words and `sevenSourceFr` is what the reader sees.
 */

import { redirect } from "next/navigation";

import { assertCan } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { statsFilterOptions } from "@/lib/competition/options";
import { getTeamCompetitions } from "@/lib/competition/queries";
import { getTheFormation } from "@/lib/formation/queries";
import {
  CONTEXT_PARAM,
  CRITERION_PARAM,
  equipeTypeHref,
  parseCompetitionId,
  parseSeven,
  parseSevenContext,
  type SevenSource,
} from "@/lib/stats/best-seven-copy";
import { toBestSevenSlots, toBestSevenSquad } from "@/lib/stats/best-seven-input";
import { getSeasonStats } from "@/lib/stats/queries";
import {
  readSevenSuggestion,
  writeSevenSuggestion,
} from "@/lib/stats/seven-cache-queries";
import { restoreSeven, sevenFingerprint } from "@/lib/stats/seven-cache";
import { solveSevenWithModel } from "@/lib/stats/seven-llm";
import { solveSeven, type SevenKind, type SevenResult } from "@/lib/stats/sevens";
import { getSquad } from "@/lib/team/queries";

export type SevenAsk = {
  seven: SevenKind;
  competitionId: string | null;
  /** Already parsed and clipped by `parseSevenContext`; `""` means « nothing to add ». */
  context: string;
};

/** Everything the screen draws below its header, from one resolution. */
export type SevenAnswerView = {
  /**
   * Which path answered — or `null` on the one database with no formation at all, where there is no
   * seven to attribute to anybody and the page prints its own empty state instead.
   */
  source: SevenSource | null;
  /** ISO 8601 when the shown answer was computed, for a cache hit. `lib/calendar/time.ts` formats it. */
  computedAt: string | null;
  /** The model's few sentences on the seven as a whole, or null when the algorithm answered. */
  summary: string | null;
  /** One sentence per chosen man, by `team_members.id` — the key the pitch already indexes on. */
  whyByCandidateId: Record<string, string>;
  result: SevenResult;
  /** `toBestSevenSquad`'s counts, which the caveats under the pitch are worded from. */
  squad: {
    departedWithData: number;
    nonPlayers: number;
    withoutMinutes: number;
    eligible: number;
  };
  /** `formation_slots`, as the pitch wants them. Null when the database has no formation at all. */
  slots: { slotId: string; positionCode: string; x: number; y: number }[] | null;
};

/**
 * The whole resolution: load, cache, model, fallback.
 *
 * Returns `slots: null` on the one database that never loaded the formation — the page already has an
 * empty state for it and says so rather than drawing seven invented posts.
 */
export async function askSeven(ask: SevenAsk): Promise<SevenAnswerView> {
  const { actor, team } = await requireTeamContext();
  assertCan(actor, "team:read", { teamId: team.id });

  const [stats, formation, squadMembers] = await Promise.all([
    // `cache()`d, so this is the page's own read and not a second round trip.
    getSeasonStats(team.id, { competitionId: ask.competitionId }),
    getTheFormation(),
    getSquad(team.id),
  ]);

  const empty: SevenAnswerView["squad"] = {
    departedWithData: 0,
    nonPlayers: 0,
    withoutMinutes: 0,
    eligible: 0,
  };

  // Unreachable from the page, which has loaded the same (`cache()`d) formation and drawn « Aucune
  // formation disponible » before it ever got here. Kept because this is an exported Server Action and
  // the type has to hold for any caller.
  if (formation === null) {
    return {
      source: null,
      computedAt: null,
      summary: null,
      whyByCandidateId: {},
      result: solveSeven(ask.seven, { candidates: [], slots: [] }),
      squad: empty,
      slots: null,
    };
  }

  const slots = toBestSevenSlots(formation.slots);
  const { candidates, departedWithData, nonPlayers, withoutMinutes, eligible } = toBestSevenSquad(
    stats.players,
    squadMembers,
  );
  const squad = { departedWithData, nonPlayers, withoutMinutes, eligible };
  const slotViews = formation.slots.map((slot) => ({
    slotId: slot.id,
    positionCode: slot.positionCode,
    x: slot.x,
    y: slot.y,
  }));

  type ModelFailure = "rateLimited" | "httpError" | "timedOut" | "invalidAnswer" | "noKey";
  const fallback = (failure: ModelFailure) =>
    ({
      source: { path: "algorithm", failure } as const,
      computedAt: null,
      summary: null,
      whyByCandidateId: {},
      result: solveSeven(ask.seven, { candidates, slots }),
      squad,
      slots: slotViews,
    }) satisfies SevenAnswerView;

  const fingerprint = sevenFingerprint(ask.seven, ask.competitionId, ask.context, candidates);

  /* ---- 1. the cache ------------------------------------------------------- */

  const stored = await readSevenSuggestion(team.id, fingerprint);
  if (stored !== null) {
    const restored = restoreSeven(
      ask.seven,
      { candidates, slots },
      { shirts: stored.shirts, reasons: stored.reasons },
    );
    if (restored !== null) {
      return {
        source: { path: "cache", model: stored.model, computedAt: stored.createdAt },
        computedAt: stored.createdAt,
        summary: stored.summaryFr === "" ? null : stored.summaryFr,
        whyByCandidateId: whyByCandidateId(restored.result, restored.reasons),
        result: restored.result,
        squad,
        slots: slotViews,
      };
    }
    // A row that no longer validates is a stale row: fall through and ask again. The upsert overwrites
    // it, so nothing accumulates.
  }

  /* ---- 2. the model ------------------------------------------------------- */

  const outcome = await solveSevenWithModel(ask.seven, { candidates, slots }, ask.context);
  if (!outcome.ok) {
    // The status and the provider's body stop here on purpose: they are diagnostics, not copy.
    if (outcome.failure !== "noKey") {
      console.error("[equipe-type] the model did not answer", {
        failure: outcome.failure,
        status: "status" in outcome ? outcome.status : null,
      });
    }
    return fallback(outcome.failure);
  }

  await writeSevenSuggestion({
    teamId: team.id,
    kind: ask.seven,
    competitionId: ask.competitionId,
    fingerprint,
    context: ask.context,
    // **Shirt numbers, never candidate indices**: an index only means something inside one ordering of
    // one squad, and the row outlives both.
    shirts: shirtSetsOf(outcome.result),
    reasons: outcome.reasons,
    summaryFr: outcome.summary,
    model: outcome.model,
  });

  return {
    source: { path: "model", model: outcome.model },
    computedAt: null,
    summary: outcome.summary === "" ? null : outcome.summary,
    whyByCandidateId: whyByCandidateId(outcome.result, outcome.reasons),
    result: outcome.result,
    squad,
    slots: slotViews,
  };
}

/**
 * The context field's `action`: put the sentence in the URL and let the screen resolve it.
 *
 * A redirect rather than a returned state, for the same reason the selects are a `method="get"` form —
 * the question is a view of the URL, so the answer to « et si Karim est absent ? » is shareable and
 * survives a reload. It also means this works with no JavaScript at all.
 */
export async function askWithContext(formData: FormData): Promise<void> {
  const { actor, team } = await requireTeamContext();
  assertCan(actor, "team:read", { teamId: team.id });

  const seven = parseSeven(readField(formData, CRITERION_PARAM));
  // The competition is checked against the team's own list, exactly as the page does it: a forged id
  // must not become a filter.
  const competitions = statsFilterOptions(await getTeamCompetitions(team.id));
  const competitionId = parseCompetitionId(readField(formData, "competition"), competitions);
  const context = parseSevenContext(readField(formData, CONTEXT_PARAM));

  const href = equipeTypeHref({ seven, competitionId });
  const separator = href.includes("?") ? "&" : "?";
  redirect(context === "" ? href : `${href}${separator}${CONTEXT_PARAM}=${encodeURIComponent(context)}`);
}

function readField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

/* -------------------------------------------------------------------------- */
/* Shirts in, shirts out                                                      */
/* -------------------------------------------------------------------------- */

/** The chosen seven as the shirt sets the row stores: post code → shirt numbers. */
function shirtSetsOf(result: SevenResult): Record<string, number[]> {
  const sets: Record<string, number[]> = {};
  for (const pick of result.picks) {
    const shirt = pick.player?.jerseyNumber;
    if (shirt === null || shirt === undefined) continue;
    (sets[pick.positionCode] ??= []).push(shirt);
  }
  return sets;
}

/**
 * The model's sentences, re-keyed from shirt numbers onto `team_members.id`.
 *
 * Only the men actually on the pitch: a sentence about somebody the answer did not pick has nowhere to
 * go, and a shirt the squad no longer has is dropped rather than drawn on a disc belonging to whoever
 * inherited the number.
 */
function whyByCandidateId(
  result: SevenResult,
  reasons: readonly { shirt: number; why: string }[],
): Record<string, string> {
  const byShirt = new Map<number, string>();
  for (const reason of reasons) if (!byShirt.has(reason.shirt)) byShirt.set(reason.shirt, reason.why);

  const out: Record<string, string> = {};
  for (const pick of result.picks) {
    const player = pick.player;
    if (player === null || player.jerseyNumber === null) continue;
    const why = byShirt.get(player.jerseyNumber);
    if (why !== undefined && why.trim() !== "") out[player.id] = why.trim();
  }
  return out;
}
