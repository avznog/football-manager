"use client";

/**
 * « Compétitions » on `/equipe` — where the coach defines the championship, the cups and the
 * tournaments his team plays in (decision 107).
 *
 * A Client Component for the same reason as the other two cards on this page: `useActionState` is
 * what puts « Cette compétition existe déjà dans l'équipe. » next to the field that produced it. Each
 * row carries its own form and its own state, so a rejected rename on one line says nothing about
 * the others; the markup is plain `<form action={…}>` throughout, so everything here also works
 * without JavaScript.
 *
 * Every sentence comes from `lib/competition/labels.ts`, and the destructive one is counted: the row
 * says how many matches point at a competition **before** offering to delete it, and offers archiving
 * instead when the answer is not zero (decisions 098 and 100).
 */

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createCompetition,
  deleteCompetition,
  renameCompetition,
  setCompetitionArchived,
} from "@/lib/competition/actions";
import {
  competitionArchiveActionFr,
  competitionDeletionFr,
  competitionStateFr,
  competitionsCardFr,
  noCompetitionYetFr,
} from "@/lib/competition/labels";
import type { CompetitionSummary } from "@/lib/competition/options";

export function CompetitionManager({
  teamId,
  competitions,
}: {
  teamId: string;
  competitions: CompetitionSummary[];
}) {
  const card = competitionsCardFr();
  const [state, action, pending] = useActionState(createCompetition, undefined);

  return (
    <Card title={card.titleFr} description={card.descriptionFr}>
      {competitions.length === 0 ? (
        <p className="text-sm text-ink-muted">{noCompetitionYetFr()}</p>
      ) : (
        <ul className="divide-y divide-border/60 border-b border-border/60">
          {competitions.map((competition) => (
            <CompetitionRow key={competition.id} teamId={teamId} competition={competition} />
          ))}
        </ul>
      )}

      <form action={action} className="mt-4 space-y-2">
        <input type="hidden" name="teamId" value={teamId} />
        <label
          htmlFor="new-competition"
          className="block text-sm font-medium text-ink"
        >
          Ajouter une compétition
        </label>
        <div className="flex gap-2">
          <Input
            id="new-competition"
            name="labelFr"
            defaultValue=""
            placeholder="Coupe du Crédit Mutuel"
            autoComplete="off"
            required
            maxLength={40}
            invalid={state?.fieldErrors?.labelFr !== undefined}
          />
          <Button type="submit" size="md" pending={pending}>
            Ajouter
          </Button>
        </div>
        {state?.fieldErrors?.labelFr ? (
          <p role="alert" className="text-sm text-danger">
            {state.fieldErrors.labelFr[0]}
          </p>
        ) : null}
        {state?.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function CompetitionRow({
  teamId,
  competition,
}: {
  teamId: string;
  competition: CompetitionSummary;
}) {
  const [renameState, rename, renaming] = useActionState(renameCompetition, undefined);
  const [deleteState, remove, removing] = useActionState(deleteCompetition, undefined);

  const deletion = competitionDeletionFr(competition.labelFr, competition.matchCount);
  const archive = competitionArchiveActionFr(competition.archived);
  const fieldId = `competition-${competition.id}`;

  return (
    <li className="space-y-2 py-3">
      <form action={rename} className="space-y-2">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="competitionId" value={competition.id} />
        <label htmlFor={fieldId} className="sr-only">
          Nom de la compétition
        </label>
        <div className="flex gap-2">
          <Input
            id={fieldId}
            name="labelFr"
            defaultValue={competition.labelFr}
            autoComplete="off"
            required
            maxLength={40}
            invalid={renameState?.fieldErrors?.labelFr !== undefined}
          />
          <Button type="submit" variant="secondary" size="md" pending={renaming}>
            Renommer
          </Button>
        </div>
        {renameState?.fieldErrors?.labelFr ? (
          <p role="alert" className="text-sm text-danger">
            {renameState.fieldErrors.labelFr[0]}
          </p>
        ) : null}
        {renameState?.error ? (
          <p role="alert" className="text-sm text-danger">
            {renameState.error}
          </p>
        ) : null}
      </form>

      <p className="text-xs text-ink-subtle">{competitionStateFr(competition)}</p>

      {/* The sentence sits above the controls on purpose: with no confirmation dialog it *is* the
          confirmation step, and it is the same sentence `deleteCompetition` answers with if a stale
          tab asks anyway (decision 098). */}
      <p className="text-sm text-ink-muted">{deletion.warningFr}</p>

      <div className="flex flex-wrap gap-2">
        <form action={setCompetitionArchived}>
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="competitionId" value={competition.id} />
          <input type="hidden" name="archived" value={competition.archived ? "false" : "true"} />
          <Button type="submit" variant="ghost" size="sm">
            {archive.labelFr}
          </Button>
        </form>

        {deletion.allowed ? (
          <form action={remove}>
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="competitionId" value={competition.id} />
            <Button type="submit" variant="danger" size="sm" pending={removing}>
              Supprimer
            </Button>
          </form>
        ) : null}
      </div>

      {/* What « Archiver » does, which is the one control here whose effect is invisible: the row
          stays, the matches stay, and only the match form loses an option. */}
      <p className="text-xs text-ink-subtle">{archive.hintFr}</p>

      {deleteState?.error ? (
        <p role="alert" className="text-sm text-danger">
          {deleteState.error}
        </p>
      ) : null}
    </li>
  );
}
