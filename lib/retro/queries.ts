import "server-only";

/**
 * What the « Saisie rétroactive » screen reads.
 *
 * One load, two shapes of screen. A match with an empty log is *entered*; a match that already has
 * one is *corrected*. Both need the same things — the roster, a formation to place the seven in, the
 * period configuration — so they are loaded together and the page picks its mode from `hasLog`.
 *
 * Almost all of it comes from `getLiveMatch`, deliberately: retro entry writes the same log game
 * mode writes, so it reads the same inputs and derives its preview through the same `reduceLive`.
 * The only thing added is `matches.entry_mode` and the competition, which `LiveMatchRow` drops at the
 * client boundary — game mode has no use for either. The screens that only need to *say* how the log
 * came to exist read `MatchRow.entryMode` instead (`entryModeBadgeFr`).
 *
 * Everything returned is plain and serialisable — the timeline crosses into a client component.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { matches, type EntryMode } from "@/db/schema";
import { getLiveMatch, type LiveMatch } from "@/lib/match/live";
import { reduceLive } from "@/lib/match/presenter";
import type { TimelineEntry } from "@/lib/match/reducer";

import { isAmendableEventType } from "./amend";
import { RETRO_FACT_TYPES, type RetroFactType } from "./log";

export type { EntryMode };

/** A player the coach can name on the sheet. */
export type RetroRosterPlayer = {
  memberId: string;
  displayName: string;
  jerseyNumber: number | null;
  isInjured: boolean;
  /** From `match_squad` when a sheet was drawn: the convocated players sort first. */
  inSquad: boolean;
  positionCodes: readonly string[];
};

/** A slot of the formation the starting seven is placed in. */
export type RetroSlotView = {
  id: string;
  positionCode: string;
  /** French label of the post, for the field caption. */
  labelFr: string;
  sort: number;
};

/** One line of an existing log, as the corrections screen shows it. */
export type RetroTimelineLine = {
  eventId: string;
  type: TimelineEntry["type"];
  period: number;
  clockMs: number;
  minute: number;
  minuteLabel: string;
  labelFr: string;
  voided: boolean;
  actors: TimelineEntry["actors"];
  /** True when this line is one of the football facts a coach may correct from this screen. */
  amendable: boolean;
  /** The fact type to pre-select in the correction sheet, when it is one. */
  factType: RetroFactType | null;
};

export type RetroView = {
  match: LiveMatch["match"] & { entryMode: EntryMode; competition: string };
  /** False when `match_events` is empty: the screen is an entry form rather than a corrections list. */
  hasLog: boolean;
  /** Milliseconds of the final whistle in the existing log, 0 when there is none. */
  finalWhistleMs: number;
  scoreLabel: string | null;
  players: readonly RetroRosterPlayer[];
  /** The formation the form opens on, and its slots in `sort` order. */
  formationId: string | null;
  formationLabel: string | null;
  slots: readonly RetroSlotView[];
  /**
   * The planned initial composition, if the coach drew one before the match: the form opens
   * pre-filled with it. Invariant 3 is about game mode applying a composition by itself, and this is
   * the coach retyping a match he played — but the same courtesy applies, so it is only a default.
   */
  plannedStarters: readonly { slotId: string; memberId: string }[];
  plannedLineupId: string | null;
  timeline: readonly RetroTimelineLine[];
};

/** French names of the posts. Same vocabulary as the composition editor. */
const POSITION_LABELS_FR: Record<string, string> = {
  GB: "Gardien",
  DG: "Arrière gauche",
  DC: "Défenseur central",
  DD: "Arrière droit",
  MC: "Milieu",
  MG: "Milieu gauche",
  MD: "Milieu droit",
  AT: "Attaquant",
};

/**
 * Load the retro-entry screen, scoped to the team.
 *
 * `null` means no such match in this team — the scoping is `getLiveMatch`'s, so nothing leaks.
 */
export async function getRetroView(teamId: string, matchId: string): Promise<RetroView | null> {
  const live = await getLiveMatch(teamId, matchId);
  if (!live) return null;

  const [row] = await db
    .select({ entryMode: matches.entryMode, competition: matches.competition })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  // As of the last event, never as of now: this screen is about a match that is over (`finalize.ts`).
  const state = reduceLive(live, [], null);

  const formation =
    live.formations.find((candidate) => candidate.id === live.defaultFormationId) ?? null;

  const initial =
    live.lineups.find((lineup) => lineup.isInitial) ??
    [...live.lineups].sort((a, b) => a.fromMinute - b.fromMinute)[0] ??
    null;
  // Only pre-fill from a composition drawn for the formation the form is showing; otherwise the
  // slot ids would not match and the seven would land nowhere.
  const planned = initial && formation && initial.formationId === formation.id ? initial : null;

  return {
    match: {
      ...live.match,
      entryMode: row?.entryMode ?? "live",
      competition: row?.competition ?? "friendly",
    },
    hasLog: live.events.length > 0,
    // The whistle as the log stamped it, not as regulation would have it: a match that ran three
    // minutes over ended at 63′, and a correction may not be stamped after that.
    finalWhistleMs:
      state.timeline.find((line) => line.type === "FINAL_WHISTLE" && !line.voided)?.clockMs ?? 0,
    scoreLabel: live.events.length > 0 ? state.scoreLabel : null,
    players: live.players
      .filter((player) => player.isPlayer)
      .map((player) => ({
        memberId: player.memberId,
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber,
        isInjured: player.isInjured,
        inSquad: player.squadRole !== null,
        positionCodes: player.positionCodes,
      }))
      .sort(byConvocatedThenName),
    formationId: formation?.id ?? null,
    formationLabel: formation?.label ?? null,
    slots: (formation?.slots ?? [])
      .map((slot) => ({
        id: slot.id,
        positionCode: slot.positionCode,
        labelFr: POSITION_LABELS_FR[slot.positionCode] ?? slot.positionCode,
        sort: slot.sort,
      }))
      .sort((a, b) => a.sort - b.sort),
    plannedStarters: planned?.slots ?? [],
    plannedLineupId: planned?.id ?? null,
    /*
     * The `VOID`s themselves are left out. They are in the log, they are what makes a correction a
     * correction, and the reducer reads them — but as a *line* an annulment says nothing the struck-
     * through line above it does not already say, and a corrected match would read « 11′ Annulation /
     * 11′ But (annulé) / 11′ But — Léo » where two lines suffice. What the coach needs to see is the
     * wrong action crossed out and the right one next to it (decision 003).
     */
    timeline: state.timeline
      .filter((entry) => entry.type !== "VOID")
      .map(toTimelineLine)
      .reverse(),
  };
}

/** Newest first is how a coach scans a match he is correcting, as in game mode. */
function toTimelineLine(entry: TimelineEntry): RetroTimelineLine {
  const factType = RETRO_FACT_TYPES.find((candidate) => candidate === entry.type) ?? null;
  return {
    eventId: entry.eventId,
    type: entry.type,
    period: entry.period,
    clockMs: entry.clockMs,
    minute: entry.minute,
    minuteLabel: entry.minuteLabel,
    labelFr: entry.labelFr,
    voided: entry.voided,
    actors: entry.actors,
    // A correction may touch what happened, never the frame of the match — `isAmendableEventType`
    // says which is which, and `lib/retro/actions.ts` asks it the same question of a posted target.
    amendable: !entry.voided && isAmendableEventType(entry.type),
    factType,
  };
}

function byConvocatedThenName(a: RetroRosterPlayer, b: RetroRosterPlayer): number {
  if (a.inSquad !== b.inSquad) return a.inSquad ? -1 : 1;
  return a.displayName.localeCompare(b.displayName, "fr-FR");
}
