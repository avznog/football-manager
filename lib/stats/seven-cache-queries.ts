import "server-only";

/**
 * The two database calls behind the équipe type's cache (decision 204): read a stored answer by its
 * fingerprint, and write one back.
 *
 * Same contract as `lib/stats/queries.ts`: the `teamId` is inside the predicate, and what comes back is
 * plain and serialisable — `createdAt` leaves as an ISO string, never as a live `Date` crossing the RSC
 * boundary (`CLAUDE.md`).
 *
 * The rules are next door in `seven-cache.ts`, which is pure and tested: this module fetches and
 * decides nothing. In particular it does **not** judge whether a stored answer is still usable — that
 * is `restoreSeven`'s job, against today's candidates.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { sevenSuggestions } from "@/db/schema";
import type { SevenKind } from "./sevens";
import type { SevenShirtSets } from "./seven-cache";

export type SevenSuggestionRow = {
  /** Keyed by post code (`GB`, `DC`, `AIL`, `MC`, `AT`), shirt numbers inside. */
  shirts: SevenShirtSets;
  reasons: { shirt: number; why: string }[];
  summaryFr: string;
  /** The model that actually answered, which is not always the one asked for. */
  model: string;
  /** ISO 8601; `lib/calendar/time.ts` is what turns it into Paris time on screen. */
  createdAt: string;
};

/** `jsonb` comes back as `unknown`: nothing from the column is believed without being checked. */
function readShirts(value: unknown): SevenShirtSets | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const out: Record<string, number[]> = {};
  for (const [code, list] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(list) || !list.every((entry) => Number.isInteger(entry))) return null;
    out[code] = list as number[];
  }
  return out;
}

function readReasons(value: unknown): { shirt: number; why: string }[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is { shirt: number; why: string } =>
      typeof entry === "object" &&
      entry !== null &&
      Number.isInteger((entry as { shirt?: unknown }).shirt) &&
      typeof (entry as { why?: unknown }).why === "string",
  );
}

export async function readSevenSuggestion(
  teamId: string,
  fingerprint: string,
): Promise<SevenSuggestionRow | null> {
  const [row] = await db
    .select({
      shirts: sevenSuggestions.slots,
      reasons: sevenSuggestions.reasons,
      summaryFr: sevenSuggestions.summaryFr,
      model: sevenSuggestions.model,
      createdAt: sevenSuggestions.createdAt,
    })
    .from(sevenSuggestions)
    .where(
      and(eq(sevenSuggestions.teamId, teamId), eq(sevenSuggestions.fingerprint, fingerprint)),
    )
    .limit(1);

  if (!row) return null;
  const shirts = readShirts(row.shirts);
  // A row whose `slots` column is not a map of integer lists is a row nothing wrote on purpose. It is a
  // miss, like any other unusable row, and the next ask overwrites it.
  if (shirts === null) return null;

  return {
    shirts,
    reasons: readReasons(row.reasons),
    summaryFr: row.summaryFr ?? "",
    model: row.model,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The answer, written on `(team_id, fingerprint)`.
 *
 * An upsert rather than an insert because the same question can be asked twice at once — two tabs, or a
 * reader who submits the context field while the first call is still out — and the second writer must
 * not raise. The later answer wins, which is what the screen will then show.
 */
export async function writeSevenSuggestion(input: {
  teamId: string;
  kind: SevenKind;
  competitionId: string | null;
  fingerprint: string;
  context: string;
  shirts: SevenShirtSets;
  reasons: { shirt: number; why: string }[];
  summaryFr: string;
  model: string;
}): Promise<void> {
  const values = {
    teamId: input.teamId,
    kind: input.kind,
    competitionId: input.competitionId,
    fingerprint: input.fingerprint,
    context: input.context,
    slots: input.shirts,
    reasons: input.reasons,
    summaryFr: input.summaryFr,
    model: input.model,
  };
  await db
    .insert(sevenSuggestions)
    .values(values)
    .onConflictDoUpdate({
      target: [sevenSuggestions.teamId, sevenSuggestions.fingerprint],
      set: {
        kind: values.kind,
        competitionId: values.competitionId,
        context: values.context,
        slots: values.slots,
        reasons: values.reasons,
        summaryFr: values.summaryFr,
        model: values.model,
        createdAt: new Date(),
      },
    });
}
