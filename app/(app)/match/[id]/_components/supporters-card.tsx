"use client";

/**
 * « Supporters » on a match that is over — naming somebody who did not play, so he can note it.
 *
 * The vote belongs to whoever the sheet names (decision 159), and before decision 211 the sheet could
 * only be written with the starting composition, at minute 0, by a form that refuses a finished match.
 * So the man who turned up, watched, and is asked for his notes afterwards could not be named
 * afterwards. This card is that one write, and nothing else: no minute, no score, no position.
 *
 * Two forms rather than one with a mode, because they are two different acts and one of them can be
 * refused for a reason the other cannot (« il a déjà donné ses notes »). Each keeps its own error, so
 * a refused removal does not blank the add list.
 *
 * No confirmation on the removal: it is reversible by the form directly above it, and a reversible
 * action is a better answer to a mis-tap than a dialog (`FinishMatchCard` reasons the same way). No
 * `title` anywhere — there is no hover on a phone (decision 072).
 */

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { addSupporter, removeSupporter } from "@/lib/composition/actions";

export type SupportersCardProps = {
  teamId: string;
  matchId: string;
  /** Who the sheet already calls supporter, in squad order. */
  supporters: readonly { memberId: string; name: string }[];
  /** Who may still be named: on no sheet row, and with no minute played. */
  addable: readonly { memberId: string; name: string }[];
};

export function SupportersCard({ teamId, matchId, supporters, addable }: SupportersCardProps) {
  const [addState, add, adding] = useActionState(addSupporter, undefined);
  const [removeState, remove, removing] = useActionState(removeSupporter, undefined);

  return (
    <Card title="Supporters" as="h2">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Quelqu’un est venu voir le match sans jouer ? Nomme-le supporter : il pourra donner ses
          notes. Ça ne change ni le score, ni les minutes.
        </p>

        {supporters.length > 0 ? (
          <ul className="divide-y divide-border/60">
            {supporters.map((supporter) => (
              <li key={supporter.memberId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm font-medium text-ink">
                  {supporter.name}
                </span>
                <form action={remove}>
                  <input type="hidden" name="teamId" value={teamId} />
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="memberId" value={supporter.memberId} />
                  <Button type="submit" variant="ghost" disabled={removing}>
                    {removing ? "…" : "Retirer"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">Personne n’est supporter de ce match.</p>
        )}

        {removeState?.error ? (
          <p role="alert" className="text-sm text-danger">
            {removeState.error}
          </p>
        ) : null}

        {/*
          Nobody left to offer is a real state and it has its own sentence: every member of the team
          either played this match or is already on its sheet. An empty select with an « Ajouter »
          button beside it would look broken.
        */}
        {addable.length > 0 ? (
          <form action={add} className="flex flex-wrap items-end gap-3 border-t border-border/60 pt-4">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="matchId" value={matchId} />

            <Field
              htmlFor="memberId"
              label="Ajouter un supporter"
              error={addState?.fieldErrors?.memberId}
              className="min-w-48 flex-1"
            >
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  name="memberId"
                  defaultValue=""
                  aria-describedby={describedBy}
                  invalid={invalid}
                  required
                >
                  <option value="" disabled>
                    Choisis quelqu’un…
                  </option>
                  {addable.map((candidate) => (
                    <option key={candidate.memberId} value={candidate.memberId}>
                      {candidate.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Button type="submit" variant="secondary" disabled={adding}>
              {adding ? "Ajout…" : "Ajouter"}
            </Button>

            {addState?.error ? (
              <p role="alert" className="w-full text-sm text-danger">
                {addState.error}
              </p>
            ) : null}
          </form>
        ) : (
          <p className="border-t border-border/60 pt-4 text-sm text-ink-muted">
            Tout le monde a joué ce match ou est déjà sur sa feuille.
          </p>
        )}
      </div>
    </Card>
  );
}
