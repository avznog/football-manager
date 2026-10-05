"use client";

/**
 * The coach's présent/absent list, marked on the day.
 *
 * **One `<form>`, two submit buttons, and the marks in client state.** All three are the fix for
 * `D1`, which was this screen losing a pointage the coach had just taken. It used to be a Server
 * Component with two *separate* forms and uncontrolled radios, and that combination is exactly how
 * the data went:
 *
 * 1. « Tout le monde est là » submitted its own little form; the action wrote thirteen rows and
 *    revalidated;
 * 2. the card re-rendered and said « 13 présents sur 13 pointés » — and the thirteen radios below it
 *    still read « — », because React re-renders onto the same keys and **does not reset an
 *    uncontrolled input**, and the only form React does reset on submit is the one that was
 *    submitted, which was the other one;
 * 3. the coach flipped the two who were missing and tapped « Enregistrer les présences »;
 * 4. that form posted `unset` for the eleven he had never touched, and the action deleted their
 *    eleven rows — because « the coach cleared this » and « the DOM is stale » are the same word on
 *    the wire.
 *
 * So the marks are state, every radio is controlled from it, and the figures in the card are counted
 * from the same value the radios show. The card and the radios can no longer describe two different
 * evenings, and no submit can carry a mark the coach cannot see. The four taps are a unit test in
 * `lib/training/attendance.test.ts`.
 *
 * **It is still a form that works with no JavaScript**, which is the whole point of this screen —
 * it gets filled in standing on the touchline, and the touchline is where the connection is worst.
 * The `action` and the `formAction` below are real server references (`…NoScript`, whose docblock
 * says why they are a separate pair), so with JS off the browser posts the form the old-fashioned
 * way; the handlers intercept only once React has taken over, and then call the `FormState` half of
 * the same actions directly so there is a message to show. Without JS the shortcut is a full page
 * POST and the DOM is rebuilt from the server, which is why `D1` was a JavaScript-only failure.
 *
 * `SegmentedControl` is not used here: this needs three options per player, dense, with the field
 * name `presence:<membershipId>` that `readAttendanceMarks` expects.
 */

import { useRef, useState, useTransition } from "react";

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
import {
  markEveryonePresent,
  markEveryonePresentNoScript,
  markTrainingAttendance,
  markTrainingAttendanceNoScript,
} from "@/lib/training/actions";
import {
  allPresent,
  ATTENDANCE_SAVE_FAILED_FR,
  attendanceTally,
  markOf,
  marksSignature,
  unsavedCount,
  unsavedMarksNoteFr,
  withMark,
  type Mark,
  type MarkMap,
} from "@/lib/training/attendance";

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

export function AttendanceList({
  teamId,
  trainingId,
  players,
  marks: serverMarks,
}: AttendanceListProps) {
  const serverSignature = marksSignature(serverMarks);
  const [savedSignature, setSavedSignature] = useState(serverSignature);
  const [marks, setMarks] = useState<MarkMap>(serverMarks);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"save" | "everyone" | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Adjusting state during render rather than in an effect, which is React's own answer to « the
  // props changed and the state derived from them must follow »: no second paint, and no flash of
  // the previous pointage. It fires when the server's marks differ from the ones this screen last
  // recorded as saved — another coach pointing the same séance from his own phone, or this page
  // being revalidated by something else. The server wins, deliberately: it is the only reader that
  // knows what is in the table. What it must never do is fire on a **failed** save, and it cannot,
  // because a failure changes nothing on the server, so the marks stay on screen (`D4`).
  if (savedSignature !== serverSignature) {
    setSavedSignature(serverSignature);
    setMarks(serverMarks);
    setError(null);
  }

  const playerIds = players.map((player) => player.membershipId);
  const { present, judged, departed } = attendanceTally(marks, playerIds);
  const departedNote = departedMarksNoteFr(departed);
  const unsavedNote = unsavedMarksNoteFr(unsavedCount(savedMarksOf(savedSignature), marks));
  const pending = isPending ? submitting : null;

  /**
   * Runs one of the two actions and keeps the marks whatever happens.
   *
   * The `FormData` is read from the live form, so the no-JS path and this one post byte-identical
   * bodies — there is one source of truth for what travels, and it is the markup. `catch` is the
   * half that matters on a touchline: an action that throws (offline, a 500, the tunnel between the
   * dressing room and the pitch) used to reach the error boundary and take the whole screen, rows
   * and all, offering a « Réessayer » that re-renders a segment rather than resubmitting anything.
   * Now it becomes a sentence above the list, with the thirteen marks still under it.
   */
  function run(
    which: "save" | "everyone",
    action: (formData: FormData) => Promise<{ error?: string } | undefined>,
    optimistic: MarkMap,
  ): void {
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    setSubmitting(which);
    startTransition(async () => {
      try {
        const state = await action(formData);
        // A refused action returns *why* now instead of returning in silence, which is the other
        // half of `D4`: thirty-five minutes before the séance this tap did nothing at all, with
        // nothing on screen to say the pointage was not open yet.
        if (state) {
          setError(state.error ?? ATTENDANCE_SAVE_FAILED_FR);
          return;
        }
        setError(null);
        setMarks(optimistic);
        setSavedSignature(marksSignature(optimistic));
      } catch {
        setError(ATTENDANCE_SAVE_FAILED_FR);
      }
    });
  }

  return (
    <Card
      title="Présences"
      description={
        judged === 0
          ? "Personne n’est encore pointé."
          : // Counted over the marks, not over `players`: the coach pointed fourteen men on 29
            // August and one of them had left the club by September, so filtering by the current
            // squad would make this line disagree with the calendar row — and with the evening
            // itself — about a session already played. It is also why the denominator can be larger
            // than the number of rows below it.
            [`${attendanceCountFr(present, judged)}.`, departedNote].filter(Boolean).join(" ")
      }
      flush
    >
      <form ref={formRef} action={markTrainingAttendanceNoScript} onSubmit={onSave}>
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="trainingId" value={trainingId} />

        {error ? (
          // Above the list, where it is read before the retry is tapped — and inside the form, so
          // the marks it is talking about are on the same screen as the sentence.
          <p
            role="alert"
            className="mx-4 mb-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-ink"
          >
            {error}
          </p>
        ) : null}

        {/* One tap for the common case, then flip the two who are missing. Same form as the save
            now: a second form is what let the two halves of this card disagree (`D1`). */}
        <div className="px-4 pb-3">
          <Button
            type="submit"
            formAction={markEveryonePresentNoScript}
            onClick={onEveryonePresent}
            variant="secondary"
            size="sm"
            fullWidth
            pending={pending === "everyone"}
          >
            Tout le monde est là
          </Button>
        </div>

        <ul className="divide-y divide-border/60 border-y border-border/60">
          {players.map((player) => {
            const mark = markOf(marks, player.membershipId);
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
                          checked={mark === option.value}
                          onChange={() => {
                            setMarks((current) =>
                              withMark(current, player.membershipId, option.value),
                            );
                          }}
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

        <div className="space-y-2 px-4 py-3">
          {/* Next to the button that would settle it, rather than up in the card: this is what the
              coach needs to know at the moment he decides whether he is done. */}
          <p aria-live="polite" className="min-h-5 text-xs text-ink-subtle">
            {unsavedNote}
          </p>
          <Button type="submit" fullWidth pending={pending === "save"}>
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

  function onSave(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    run("save", markTrainingAttendance, marks);
  }

  function onEveryonePresent(event: React.MouseEvent<HTMLButtonElement>): void {
    // Stops the native submit this button would otherwise do through `formAction`, which is the
    // no-JS path and the wrong one here: it would navigate rather than keep the marks on screen.
    event.preventDefault();
    run("everyone", markEveryonePresent, allPresent(marks, playerIds));
  }
}

/**
 * The marks the database is known to hold, read back out of the signature.
 *
 * Holding a second map would mean two values to keep in step, and the signature already says
 * everything « what is saved » needs to say — it exists to be compared, and this is the comparison.
 */
function savedMarksOf(signature: string): MarkMap {
  const saved = new Map<string, boolean>();
  if (signature === "") return saved;
  for (const entry of signature.split("|")) {
    const cut = entry.lastIndexOf(":");
    saved.set(entry.slice(0, cut), entry.slice(cut + 1) === "P");
  }
  return saved;
}
