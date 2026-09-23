/**
 * The coach's présent/absent list, marked on the day.
 *
 * A **Server Component**: three native radios per player inside one plain `<form>` bound to
 * `markTrainingAttendance`. No JavaScript is involved at any point, which is the point — this gets
 * filled in standing on the touchline. The whole squad travels in a single submit rather than one
 * request per tap, so a dropped connection costs one retry instead of thirteen.
 *
 * Three states, not two. A player with no row in `training_attendance` has not been judged yet,
 * which is different from being marked absent — and the attendance rate in M5 depends on the
 * difference (`docs/DATA_MODEL.md`). « — » is that third state, and it is the default.
 *
 * `SegmentedControl` is not used here: it attaches an `onChange` to its radios, which a Server
 * Component cannot serialise. The markup below is the same idea, denser, with the per-player field
 * name `presence:<membershipId>` that `readAttendanceMarks` expects.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import {
  attendanceCountFr,
  AVAILABILITY_LABELS,
  departedMarksNoteFr,
} from "@/lib/calendar/labels";
import type { AvailabilityStatus } from "@/db/schema";
import { markEveryonePresent, markTrainingAttendance } from "@/lib/training/actions";

type Mark = "present" | "absent" | "unset";

const OPTIONS: readonly {
  value: Mark;
  label: string;
  /** Only where the visible label is a symbol a screen reader cannot announce. */
  screenReader?: string;
  checked: string;
}[] = [
  {
    value: "present",
    label: "Présent",
    checked: "peer-checked:bg-success peer-checked:text-accent-ink",
  },
  {
    value: "absent",
    label: "Absent",
    checked: "peer-checked:bg-danger peer-checked:text-accent-ink",
  },
  {
    value: "unset",
    label: "—",
    screenReader: "Non pointé",
    checked: "peer-checked:bg-ink-muted peer-checked:text-surface",
  },
];

export type AttendancePlayer = {
  membershipId: string;
  displayName: string;
  jerseyNumber: number | null;
  /** What the player said they would do, shown next to what they actually did. */
  declared: AvailabilityStatus | null;
};

export type AttendanceListProps = {
  teamId: string;
  trainingId: string;
  players: readonly AttendancePlayer[];
  /** `true` present, `false` absent, missing means not judged yet. */
  marks: ReadonlyMap<string, boolean>;
};

export function AttendanceList({ teamId, trainingId, players, marks }: AttendanceListProps) {
  // Counted over the marks, not over `players`: the coach pointed fourteen men on 29 August and one
  // of them had left the club by September, so filtering by the current squad would make this line
  // disagree with the calendar row — and with the evening itself — about a session already played.
  // It is also why the denominator can be larger than the number of rows below it.
  const present = [...marks.values()].filter(Boolean).length;
  const judged = marks.size;
  // The list below can only offer a radio to a player who is still here, so it can be shorter than
  // the number pointed. Said out loud rather than left as an arithmetic puzzle.
  const departed = departedMarksNoteFr(
    judged - players.filter((player) => marks.has(player.membershipId)).length,
  );

  return (
    <Card
      title="Présences"
      description={
        judged === 0
          ? "Personne n’est encore pointé."
          : [`${attendanceCountFr(present, judged)}.`, departed].filter(Boolean).join(" ")
      }
      flush
    >
      {/* Separate form: one tap for the common case, then flip the two who are missing. */}
      <form action={markEveryonePresent} className="px-4 pb-3">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="trainingId" value={trainingId} />
        <Button type="submit" variant="secondary" size="sm" fullWidth>
          Tout le monde est là
        </Button>
      </form>

      <form action={markTrainingAttendance}>
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="trainingId" value={trainingId} />

        <ul className="divide-y divide-border/60 border-y border-border/60">
          {players.map((player) => {
            const mark: Mark = marks.has(player.membershipId)
              ? marks.get(player.membershipId)
                ? "present"
                : "absent"
              : "unset";
            const field = `presence:${player.membershipId}`;

            return (
              <li key={player.membershipId} className="flex items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">
                    {player.jerseyNumber !== null ? (
                      <span className="mr-1.5 font-mono text-sm text-ink-subtle tabular-nums">
                        {player.jerseyNumber}
                      </span>
                    ) : null}
                    {player.displayName}
                  </span>
                  {player.declared ? (
                    <span className="block text-xs text-ink-subtle">
                      Annoncé {AVAILABILITY_LABELS[player.declared].toLocaleLowerCase("fr-FR")}
                    </span>
                  ) : null}
                </span>

                <fieldset className="flex shrink-0 gap-1 rounded-xl border border-border bg-surface-2 p-1">
                  <legend className="sr-only">Présence de {player.displayName}</legend>
                  {OPTIONS.map((option) => {
                    const id = `${field}-${option.value}`;
                    return (
                      <div key={option.value}>
                        <input
                          type="radio"
                          id={id}
                          name={field}
                          value={option.value}
                          defaultChecked={mark === option.value}
                          className="peer sr-only"
                        />
                        <label
                          htmlFor={id}
                          className={cn(
                            "flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-2 text-xs font-medium text-ink-muted transition-colors select-none",
                            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                            option.checked,
                          )}
                        >
                          {option.screenReader ? (
                            <>
                              <span aria-hidden>{option.label}</span>
                              <span className="sr-only">{option.screenReader}</span>
                            </>
                          ) : (
                            option.label
                          )}
                        </label>
                      </div>
                    );
                  })}
                </fieldset>
              </li>
            );
          })}
        </ul>

        <div className="px-4 py-3">
          <Button type="submit" fullWidth>
            Enregistrer les présences
          </Button>
        </div>
      </form>

      {players.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-muted">
          <Badge variant="neutral">effectif vide</Badge> Ajoute des joueurs à l’équipe pour pointer
          les présences.
        </p>
      ) : null}
    </Card>
  );
}
