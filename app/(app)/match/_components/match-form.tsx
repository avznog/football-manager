"use client";

/**
 * The coach's match form, shared by « nouveau match » and « modifier ».
 *
 * A Client Component for one reason: `useActionState` is what shows the French validation messages
 * from `lib/match/validation.ts` next to the field that produced them. The markup is still a plain
 * `<form>` bound to a Server Action, so it also posts without JavaScript — the messages then come
 * back with the re-rendered page instead of in place.
 *
 * `kickoffAt` is a `datetime-local`: it submits a bare wall clock, which the action reads as
 * Europe/Paris (`lib/calendar/time.ts`). Never as the browser's zone.
 */

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { matchLengthHintFr, venueFieldHintFr } from "@/lib/calendar/labels";
import { noCompetitionFr } from "@/lib/competition/labels";
import type { CompetitionOption } from "@/lib/competition/options";
import { createMatch, updateMatch } from "@/lib/match/actions";

export type MatchFormDefaults = {
  opponentName: string;
  /** `YYYY-MM-DDTHH:mm`, already converted to Paris wall clock by the page. */
  kickoffAt: string;
  isHome: boolean;
  venue: string;
  /**
   * The row of the team's own `competitions` table this match is filed under (decision 107), or
   * null when the team has none — the form then says so instead of showing an empty dropdown.
   */
  competitionId: string | null;
  periodsCount: number;
  periodMinutes: number;
};

export type MatchFormProps = {
  teamId: string;
  /** Present when editing. Absent means creating. */
  matchId?: string;
  defaults: MatchFormDefaults;
  /** What the « Compétition » select may offer, already ordered by `competitionOptions`. */
  competitions: readonly CompetitionOption[];
};

export function MatchForm({ teamId, matchId, defaults, competitions }: MatchFormProps) {
  const editing = matchId !== undefined;
  const [state, action, pending] = useActionState(editing ? updateMatch : createMatch, undefined);

  // The two fields stay uncontrolled — `defaultValue`, so the no-JavaScript post still carries what
  // was typed — and this mirror exists only to write the sentence under them. `Number("")` is 0 and
  // `Number("x")` is NaN; `matchLengthHintFr` refuses both rather than compute a duration from them.
  // Same trick for the side, and for the same reason: the radio stays uncontrolled so the
  // no-JavaScript post still carries it, and this mirror only writes the hint on « Terrain » —
  // which pitch the field is asking for depends on the answer above it.
  const [isHome, setIsHome] = useState(defaults.isHome);
  const [periodsCount, setPeriodsCount] = useState(defaults.periodsCount);
  const [periodMinutes, setPeriodMinutes] = useState(defaults.periodMinutes);
  const lengthHint = matchLengthHintFr(periodsCount, periodMinutes);
  const lengthHintId = "match-length";

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="teamId" value={teamId} />
      {editing ? <input type="hidden" name="matchId" value={matchId} /> : null}

      <Field htmlFor="opponentName" label="Adversaire" error={state?.fieldErrors?.opponentName}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="opponentName"
            defaultValue={defaults.opponentName}
            placeholder="Étoile du Parc"
            autoComplete="off"
            required
            maxLength={60}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <Field
        htmlFor="kickoffAt"
        label="Coup d’envoi"
        hint="Heure française."
        error={state?.fieldErrors?.kickoffAt}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="kickoffAt"
            type="datetime-local"
            defaultValue={defaults.kickoffAt}
            required
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      <div className="space-y-1.5">
        <SegmentedControl
          name="isHome"
          legend="Lieu"
          hideLegend={false}
          options={[
            { value: "home", label: "À domicile" },
            { value: "away", label: "À l’extérieur" },
          ]}
          defaultValue={defaults.isHome ? "home" : "away"}
          onChange={(value) => setIsHome(value === "home")}
        />
      </div>

      {competitions.length === 0 ? (
        <p role="alert" className="text-sm text-ink-muted">
          {noCompetitionFr()}
        </p>
      ) : (
        <Field
          htmlFor="competitionId"
          label="Compétition"
          error={state?.fieldErrors?.competitionId}
        >
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              name="competitionId"
              defaultValue={defaults.competitionId ?? competitions[0]?.id}
              aria-describedby={describedBy}
              invalid={invalid}
            >
              {competitions.map((competition) => (
                <option key={competition.id} value={competition.id}>
                  {competition.labelFr}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {/* The hint follows the side chosen above: a venue and a side that tell different stories is
          the one contradiction this pair can produce, and the form cannot check a free-text pitch
          name — it can only say which pitch it is asking for. */}
      <Field
        htmlFor="venue"
        label="Terrain"
        optional
        hint={venueFieldHintFr(isHome)}
        error={state?.fieldErrors?.venue}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="venue"
            defaultValue={defaults.venue}
            placeholder="Stade des Tilleuls"
            autoComplete="off"
            maxLength={80}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>

      {/* The pair, then one sentence saying what the pair comes to. Both fields point at it with
          `aria-describedby`, which is why the hint is not simply rendered after the grid: whichever
          number you are editing, the consequence is read out with it. */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor="periodsCount" label="Périodes" error={state?.fieldErrors?.periodsCount}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="periodsCount"
                type="number"
                min={1}
                max={4}
                step={1}
                inputMode="numeric"
                defaultValue={defaults.periodsCount}
                onChange={(event) => setPeriodsCount(Number(event.target.value))}
                aria-describedby={[describedBy, lengthHintId].filter(Boolean).join(" ")}
                invalid={invalid}
                className="tabular-nums"
              />
            )}
          </Field>

          <Field
            htmlFor="periodMinutes"
            label="Minutes par période"
            error={state?.fieldErrors?.periodMinutes}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="periodMinutes"
                type="number"
                min={5}
                max={60}
                step={1}
                inputMode="numeric"
                defaultValue={defaults.periodMinutes}
                onChange={(event) => setPeriodMinutes(Number(event.target.value))}
                aria-describedby={[describedBy, lengthHintId].filter(Boolean).join(" ")}
                invalid={invalid}
                className="tabular-nums"
              />
            )}
          </Field>
        </div>

        <p id={lengthHintId} aria-live="polite" className="text-sm text-ink-muted">
          {lengthHint}
        </p>
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      {/* Nothing to file the match under, so there is nothing to submit: the sentence above says
          where to go, and a button that would only come back refused is worse than a disabled one. */}
      <Button
        type="submit"
        fullWidth
        size="lg"
        pending={pending}
        disabled={competitions.length === 0}
      >
        {editing ? "Enregistrer" : "Créer le match"}
      </Button>
    </form>
  );
}
