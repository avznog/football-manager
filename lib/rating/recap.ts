/**
 * The post-match recap, turned into something a page can render.
 *
 * `lib/match/reducer.ts` derives *what happened* — score, minutes, timeline — and deliberately
 * never sees a name (invariant 2: it is pure, and names are a presentation concern). This module is
 * the other half: it takes a `MatchState` and the squad's names and produces the French view model
 * the recap screen renders, with nothing left to compute in JSX.
 *
 * Also pure, for the same reason: `buildRecap` is a function of its arguments, so the whole
 * celebratory screen can be tested against fixtures without a database or a browser.
 *
 * ## Presentation decisions taken here
 *
 * - **Pauses and half-times are not events a player cares about.** `PAUSE` / `RESUME` are hidden;
 *   kick-offs, ends of period and the final whistle stay, as thin markers, because they are what
 *   makes the timeline readable as a story.
 * - **`VOID` rows are hidden, the voided row is struck through.** A correction must stay visible
 *   (decision 003) — and it is, as « But 27’ — annulé ». Adding a second line saying "annulation
 *   d'un but" would be the same information twice, in the wrong order.
 * - **The initial eleven is not a timeline entry.** A `LINEUP_APPLIED` at 0’ would read as seven
 *   substitutions in the first second. A composition applied *during* the match is real news and is
 *   kept.
 * - **Own goals are listed with the scorers, marked `(csc)`.** They are part of how the score came
 *   about; hiding them would make the timeline disagree with the scoreline.
 * - **Passers get their own line.** « Buts : Julien ×2 » then « Passes : Karim » — mixing a passer
 *   into the scorers' list would read as if he had scored.
 *
 * One thing the reducer cannot give us: a **voided** event carries no actors (it never reaches the
 * payload-reading branch), so an annulled goal shows as « But 27’ — annulé » with no name. That is
 * both unavoidable here and defensible: a goal that was not a goal has no scorer.
 *
 * A goal that *was* a goal but whose scorer nobody could name is a different case (decision 036) and
 * says so: « But 27’ · buteur non renseigné ». A bare « But » reads as a bug in the app rather than
 * as a gap in what was recorded on the touchline.
 */

import type { SquadRole } from "@/db/schema";
import { pluralize, resultLabel, scoreLineFr } from "@/lib/calendar/labels";
import { VOIDED_SUFFIX_FR } from "@/lib/match/events";
import { noteDetailFr } from "@/lib/match/presenter";
import type { MatchState, PlayerMatchState, TimelineEntry } from "@/lib/match/reducer";

/** What this module needs to know about a person: how to write their name. */
export type RecapMember = {
  memberId: string;
  displayName: string;
  jerseyNumber?: number | null;
};

/** Shown where a name is missing — a member deleted, or an id the squad does not mention. */
export const UNKNOWN_MEMBER_NAME = "Joueur inconnu";

export type RecapTimelineTone =
  /** Something good: a goal for us. */
  | "for"
  /** A goal conceded, ours or theirs. */
  | "against"
  /** Kick-off, end of period, final whistle. */
  | "clock"
  | "neutral";

export type RecapTimelineEntry = {
  eventId: string;
  /** « 27’ », « 45’+2 » — continuous minutes, as `formatMinuteLabelFr` writes them. */
  minuteLabel: string;
  /** « But », « Changement »… plus « — annulé » when the event was voided. */
  label: string;
  /** « Julien Marchal, passe de Karim Benali » — null when there is nobody to name. */
  detail: string | null;
  voided: boolean;
  /** « 2 – 1 » after a goal, null otherwise — `scoreLineFr`, like every other score. */
  scoreAfter: string | null;
  tone: RecapTimelineTone;
};

export type RecapScorer = {
  memberId: string;
  name: string;
  goals: number;
  /** Goals scored into our own net. Counted apart: they are not a contribution. */
  ownGoals: number;
  assists: number;
  /** « Julien Marchal ×2 », « Nico Perrin (csc) » — the scorer line, ready to print. */
  label: string;
};

export type RecapAssister = {
  memberId: string;
  name: string;
  assists: number;
  /** « Karim Benali ×2 ». */
  label: string;
};

export type RecapPlayerLine = {
  memberId: string;
  name: string;
  jerseyNumber: number | null;
  /**
   * How he was listed on the match sheet. Kept so the minutes table can tell a supporter — who was
   * never going to come on — apart from a substitute who stayed on the bench: both show 0’, and
   * calling the supporter « non entré » reads as a reproach he does not deserve.
   */
  squadRole: SquadRole | null;
  minutes: number;
  goals: number;
  assists: number;
  ownGoals: number;
  fouls: number;
  startedMatch: boolean;
  playedMatch: boolean;
  wasGoalkeeper: boolean;
  /** Minutes spent in goal without conceding — the clean-sheet figure of a 7-a-side keeper. */
  gkCleanMinutes: number;
  /** « 60’ », or « 0’ » for an unused substitute. */
  minutesLabel: string;
};

export type MatchRecap = {
  goalsFor: number;
  goalsAgainst: number;
  /** « 3 – 2 », ours first, as `scoreLineFr` writes every score in the app. */
  scoreLabel: string;
  /**
   * At least one event was logged. A match can be over with an empty log — nobody opened game mode,
   * nobody backfilled it — and « 0 – 0 » would then be a lie, not a scoreline (decision 013, and
   * rule 7 of `lib/stats/aggregate.ts`, which already counts such a match apart).
   */
  recorded: boolean;
  finished: boolean;
  result: "win" | "draw" | "loss" | null;
  /** « Victoire » / « Match nul » / « Défaite », or null before the final whistle. */
  resultLabel: string | null;
  /** Anybody who put the ball in a net, ours or theirs. */
  scorers: readonly RecapScorer[];
  /** Anybody credited with an assist. */
  assisters: readonly RecapAssister[];
  timeline: readonly RecapTimelineEntry[];
  /** Everybody who played, most minutes first, then the unused substitutes. */
  players: readonly RecapPlayerLine[];
  /** « 9 joueurs utilisés » and friends, for the sober line under the celebration. */
  playersUsed: number;
  playersUsedLabel: string;
  /** Nothing conceded, and the match is over — the other thing worth celebrating. */
  cleanSheet: boolean;
};

/** Events that say nothing to a player reading the recap. */
const HIDDEN_EVENT_TYPES = new Set(["PAUSE", "RESUME", "VOID"]);

const CLOCK_TONE_TYPES = new Set(["KICKOFF", "PERIOD_END", "FINAL_WHISTLE"]);

export function buildRecap(
  state: MatchState,
  members: readonly RecapMember[],
  options: { unknownName?: string } = {},
): MatchRecap {
  const directory = new Map(members.map((member) => [member.memberId, member]));
  const unknownName = options.unknownName ?? UNKNOWN_MEMBER_NAME;
  const nameOf = (memberId: string): string => directory.get(memberId)?.displayName ?? unknownName;

  return {
    goalsFor: state.goalsFor,
    goalsAgainst: state.goalsAgainst,
    scoreLabel: state.scoreLabel,
    // The whole log, not the filtered timeline: a match whose only event is a kick-off *was*
    // followed, even though the recap shows that kick-off and nothing else.
    recorded: state.timeline.length > 0,
    finished: state.finished,
    result: state.result,
    resultLabel: state.finished ? resultLabel(state.goalsFor, state.goalsAgainst) : null,
    scorers: buildScorers(state.players, nameOf),
    assisters: buildAssisters(state.players, nameOf),
    timeline: buildTimeline(state.timeline, nameOf),
    players: buildPlayerLines(state.players, directory, unknownName),
    playersUsed: state.players.filter((player) => player.playedMatch).length,
    playersUsedLabel: pluralize(
      state.players.filter((player) => player.playedMatch).length,
      "joueur utilisé",
      "joueurs utilisés",
    ),
    cleanSheet: state.finished && state.goalsAgainst === 0,
  };
}

/** Who scored, most goals first. `assists` travels along for a UI that wants both on one line. */
export function buildScorers(
  players: readonly PlayerMatchState[],
  nameOf: (memberId: string) => string,
): RecapScorer[] {
  return players
    .filter((player) => player.goals > 0 || player.ownGoals > 0)
    .map((player) => {
      const name = nameOf(player.memberId);
      return {
        memberId: player.memberId,
        name,
        // `goals` already includes converted penalties (the reducer counts them as goals).
        goals: player.goals,
        ownGoals: player.ownGoals,
        assists: player.assists,
        label: scorerLabel(name, player.goals, player.ownGoals),
      };
    })
    .sort(
      (a, b) =>
        b.goals - a.goals ||
        b.assists - a.assists ||
        a.name.localeCompare(b.name, "fr") ||
        (a.memberId < b.memberId ? -1 : 1),
    );
}

/**
 * The passers, most assists first. A separate list because « but de Julien, passe de Karim » is how
 * the team talks about the match afterwards, and a passer who never scores would otherwise vanish
 * from the recap entirely.
 */
export function buildAssisters(
  players: readonly PlayerMatchState[],
  nameOf: (memberId: string) => string,
): RecapAssister[] {
  return players
    .filter((player) => player.assists > 0)
    .map((player) => {
      const name = nameOf(player.memberId);
      return {
        memberId: player.memberId,
        name,
        assists: player.assists,
        label: player.assists > 1 ? `${name} ×${player.assists}` : name,
      };
    })
    .sort(
      (a, b) =>
        b.assists - a.assists ||
        a.name.localeCompare(b.name, "fr") ||
        (a.memberId < b.memberId ? -1 : 1),
    );
}

function scorerLabel(name: string, goals: number, ownGoals: number): string {
  const parts: string[] = [];
  if (goals > 0) parts.push(goals > 1 ? `${name} ×${goals}` : name);
  if (ownGoals > 0) {
    parts.push(ownGoals > 1 ? `${name} ×${ownGoals} (csc)` : `${name} (csc)`);
  }
  return parts.join(", ");
}

/** The minute-by-minute story, oldest first — which is how you retell a match. */
export function buildTimeline(
  entries: readonly TimelineEntry[],
  nameOf: (memberId: string) => string,
): RecapTimelineEntry[] {
  // `detail` asks `noteDetailFr` first: a note is the whole point of the event that carries it, and
  // that formatter is shared with game mode's timeline — see its comment for why the *rest* of this
  // description is deliberately phrased differently on the two screens.
  const detailOf = (entry: TimelineEntry): string | null =>
    noteDetailFr(entry, nameOf) ?? describeActors(entry, nameOf) ?? missingScorerNote(entry);

  return (
    entries
      .filter((entry) => !HIDDEN_EVENT_TYPES.has(entry.type))
      // The starting eleven, applied at 0’, is the composition — not seven changes.
      .filter((entry) => !(entry.type === "LINEUP_APPLIED" && entry.clockMs === 0))
      .map((entry) => ({
        eventId: entry.eventId,
        minuteLabel: entry.minuteLabel,
        label: entry.voided ? `${entry.labelFr} — ${VOIDED_SUFFIX_FR}` : entry.labelFr,
        detail: detailOf(entry),
        voided: entry.voided,
        scoreAfter: entry.scoreAfter
          ? scoreLineFr(entry.scoreAfter.goalsFor, entry.scoreAfter.goalsAgainst)
          : null,
        tone: toneOf(entry),
      }))
  );
}

/** Types of our goals: the ones where a missing name is worth stating rather than leaving blank. */
const SCORING_EVENT_TYPES = new Set(["GOAL_FOR", "PENALTY_SCORED"]);

/**
 * « buteur non renseigné », for a goal of ours that names nobody.
 *
 * Decision 036 allows it: in a 7-a-side game nobody always sees who touched it last, and refusing the
 * goal or inventing a scorer would both be worse. A **voided** goal gets nothing — it carries no
 * actors by construction, and « annulé · buteur non renseigné » would be noise.
 */
function missingScorerNote(entry: TimelineEntry): string | null {
  if (entry.voided || !SCORING_EVENT_TYPES.has(entry.type)) return null;
  return "buteur non renseigné";
}

function toneOf(entry: TimelineEntry): RecapTimelineTone {
  if (entry.voided) return "neutral";
  if (CLOCK_TONE_TYPES.has(entry.type)) return "clock";
  if (entry.type === "GOAL_FOR" || entry.type === "PENALTY_SCORED") return "for";
  if (entry.type === "GOAL_AGAINST" || entry.type === "OWN_GOAL") return "against";
  return "neutral";
}

/**
 * Names the people involved in an event, in the order French puts them.
 *
 * Built from the reducer's `actors` rather than from the raw payload, so there is one definition of
 * "who was involved in this event" in the repository.
 *
 * It does **not** handle a `COMMENT`: an event carrying free text is described by `noteDetailFr`,
 * which the recap and game mode share, and `buildTimeline` calls that first.
 */
export function describeActors(
  entry: TimelineEntry,
  nameOf: (memberId: string) => string,
): string | null {
  const named = (role: string): string[] =>
    entry.actors.filter((actor) => actor.role === role).map((actor) => nameOf(actor.memberId));

  const scorers = [...named("scorer"), ...named("penalty")];
  const assists = named("assist");
  const ownGoals = named("own-goal");
  const cameOn = named("in");
  const wentOff = named("out");
  const moved = named("moved");
  const fouls = named("foul");
  const injured = named("injured");

  const parts: string[] = [];

  if (scorers.length > 0) parts.push(scorers.join(", "));
  if (ownGoals.length > 0) parts.push(`${ownGoals.join(", ")} (csc)`);
  if (assists.length > 0) parts.push(`passe de ${assists.join(", ")}`);
  if (cameOn.length > 0) parts.push(`${cameOn.join(", ")} entre`);
  if (wentOff.length > 0) parts.push(`${wentOff.join(", ")} sort`);
  if (moved.length > 0) parts.push(`${moved.join(", ")} change de poste`);
  if (fouls.length > 0) parts.push(fouls.join(", "));
  if (injured.length > 0) parts.push(injured.join(", "));

  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * The minutes table. Sorted the way a team sheet reads: the players who were on the pitch first,
 * most minutes at the top, then whoever never came on.
 */
export function buildPlayerLines(
  players: readonly PlayerMatchState[],
  directory: ReadonlyMap<string, RecapMember>,
  unknownName: string,
): RecapPlayerLine[] {
  return players
    .map((player) => {
      const member = directory.get(player.memberId);
      return {
        memberId: player.memberId,
        name: member?.displayName ?? unknownName,
        jerseyNumber: member?.jerseyNumber ?? null,
        squadRole: player.squadRole,
        minutes: player.minutes,
        goals: player.goals,
        assists: player.assists,
        ownGoals: player.ownGoals,
        fouls: player.fouls,
        startedMatch: player.startedMatch,
        playedMatch: player.playedMatch,
        wasGoalkeeper: player.wasGoalkeeper,
        gkCleanMinutes: player.gkCleanMinutes,
        minutesLabel: `${player.minutes}’`,
      };
    })
    .sort(
      (a, b) =>
        Number(b.playedMatch) - Number(a.playedMatch) ||
        // Among those who never came on, the bench first and the supporters last: one was an option
        // the coach did not use, the other was never an option.
        Number(a.squadRole === "supporter") - Number(b.squadRole === "supporter") ||
        b.minutes - a.minutes ||
        b.goals - a.goals ||
        a.name.localeCompare(b.name, "fr"),
    );
}
