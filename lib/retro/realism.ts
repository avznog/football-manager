/**
 * Whether a correction leaves a match that could have happened (decision 170).
 *
 * `submitAmendment` reduces the corrected log before writing it and compares the reducer's anomalies
 * with those of the log as it stands. Two rules make that comparison honest:
 *
 * - **an anomaly is identified by `(code, eventId)`, not by its code.** It used to be the code alone,
 *   so a match whose log already held one `scorer-off-pitch` accepted any number of new ones: the code
 *   was « already there ». Keyed on the event, a second goal by somebody off the pitch is new, and a
 *   change that strands a goal scored twenty minutes later is caught on *that goal's* event;
 * - **only the anomalies that mean « this could not have happened » refuse**, the list below. The
 *   others are about the frame of the log (a `PERIOD_END` with no period running, an unknown
 *   catalogue) and are nothing a correction of a goal or a change is responsible for.
 *
 * Pure. Every message tutoie and names the problem, the player and the minute.
 */

import type { MatchAnomaly, MatchAnomalyCode, MatchState } from "@/lib/match/reducer";

/** The anomalies a correction may not introduce. */
export const REFUSED_ANOMALY_CODES: readonly MatchAnomalyCode[] = [
  "scorer-off-pitch",
  "substitute-in-already-on",
  "substitute-out-not-on",
  "position-change-off-pitch",
  "too-many-on-pitch",
  "lineup-slot-conflict",
  "no-goalkeeper-on-pitch",
  "event-after-final-whistle",
];

const keyOf = (anomaly: Pick<MatchAnomaly, "code" | "eventId">) =>
  `${anomaly.code}|${anomaly.eventId ?? ""}`;

/** The refusable anomalies `after` has and `before` did not, compared by `(code, eventId)`. */
export function introducedAnomalies(
  before: readonly MatchAnomaly[],
  after: readonly MatchAnomaly[],
): MatchAnomaly[] {
  const known = new Set(before.map(keyOf));
  return after.filter(
    (anomaly) => REFUSED_ANOMALY_CODES.includes(anomaly.code) && !known.has(keyOf(anomaly)),
  );
}

/**
 * The French refusal for the first introduced anomaly, read off the corrected log's own timeline so
 * it can say which player and which minute. `null` when nothing was introduced.
 */
export function realismRefusalFr(
  introduced: readonly MatchAnomaly[],
  preview: Pick<MatchState, "timeline">,
  nameOf: (memberId: string) => string,
): string | null {
  const anomaly = introduced[0];
  if (!anomaly) return null;

  const entry = anomaly.eventId
    ? preview.timeline.find((line) => line.eventId === anomaly.eventId)
    : undefined;
  const at = entry ? `à la ${entry.minuteLabel}` : "à cette minute";
  const actor = (...roles: string[]) => {
    const found = entry?.actors.find((candidate) => roles.includes(candidate.role));
    return found ? nameOf(found.memberId) : "Ce joueur";
  };

  switch (anomaly.code) {
    case "scorer-off-pitch":
      return `${actor("scorer", "penalty", "own-goal")} n’était pas sur le terrain ${at} : il ne peut pas y avoir marqué.`;
    case "substitute-in-already-on":
      return `${actor("in")} était déjà sur le terrain ${at}.`;
    case "substitute-out-not-on":
      return `${actor("out")} n’était pas sur le terrain ${at} : il ne peut pas en sortir.`;
    case "position-change-off-pitch":
      return `${actor("moved")} n’était pas sur le terrain ${at} : il ne peut pas y changer de poste.`;
    case "too-many-on-pitch":
      return `Il y aurait plus de sept joueurs sur le terrain ${at}.`;
    case "lineup-slot-conflict":
      return `Un joueur serait placé à deux postes, ou deux joueurs au même poste, ${at}.`;
    case "no-goalkeeper-on-pitch":
      return `Personne ne serait dans les buts ${at}.`;
    case "event-after-final-whistle":
      return "Cette minute est postérieure à la fin du match.";
    default:
      return "Cette correction rendrait le match impossible.";
  }
}
