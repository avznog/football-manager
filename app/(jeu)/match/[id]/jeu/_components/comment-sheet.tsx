"use client";

import { useState } from "react";

import { Button, Field, Select, Sheet, Textarea } from "@/components/ui";
import type { PlayerOption } from "@/lib/match/presenter";

/** Mirrors `noteSchema` in `lib/match/events.ts`: the server refuses anything longer. */
const MAX_NOTE = 280;

export type CommentSheetProps = {
  open: boolean;
  onClose: () => void;
  /** « 58’ · 2e période » — the minute the note will carry, which is the minute of the tap. */
  stampLabel: string;
  /** Everyone the note can be attached to: on the pitch first, then the bench. */
  options: readonly PlayerOption[];
  onConfirm: (note: string, memberId: string | null) => void;
};

/**
 * « Commentaire » — the one action in game mode that is not a fact about the football (decision 114).
 *
 * Everything else the menu records is derivable and countable: a goal moves the score, a
 * substitution moves a player. A note is none of those things, which is exactly why it was asked
 * for — « mur mal placé sur le coup franc », « arbitre a laissé jouer », the sentence that explains
 * a scoreline three weeks later and that no schema will ever anticipate.
 *
 * The sheet is the only place in game mode with a keyboard, so it is also the only place that is a
 * form rather than a chain of taps. Two consequences, both deliberate: the note is stamped with the
 * minute the coach *tapped* ACTION, printed at the top so it is not a surprise, and the player is a
 * native `<select>` rather than another full-screen picker — a second sheet would have to destroy
 * this one and take the half-typed sentence with it.
 *
 * Attaching a player is optional and unset by default. « À propos de… » is not « qui », because a
 * note about a player is not a note blaming one.
 */
export function CommentSheet({ open, onClose, stampLabel, options, onConfirm }: CommentSheetProps) {
  const [note, setNote] = useState("");
  const [memberId, setMemberId] = useState("");

  const trimmed = note.trim();
  const remaining = MAX_NOTE - note.length;

  function submit() {
    if (trimmed.length === 0 || trimmed.length > MAX_NOTE) return;
    onConfirm(trimmed, memberId === "" ? null : memberId);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Commentaire"
      description={stampLabel}
      footer={
        <Button fullWidth size="lg" disabled={trimmed.length === 0} onClick={submit}>
          Enregistrer
        </Button>
      }
    >
      <div className="space-y-4">
        {/* `maxLength`, not a validation error: the field simply stops accepting characters at the
            length the server accepts, so there is no state in which the sheet holds a sentence it
            would refuse. The count appears only once it is close enough to matter. */}
        <Field
          htmlFor="comment-note"
          label="Ce qui s’est passé"
          hint={remaining <= 40 ? `${remaining} caractères restants` : undefined}
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={note}
              autoFocus
              maxLength={MAX_NOTE}
              placeholder="Coup franc dangereux, mur mal placé."
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>

        {options.length > 0 ? (
          <Field htmlFor="comment-member" label="À propos de…" optional>
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
              >
                <option value="">Personne en particulier</option>
                {options.map((option) => (
                  <option key={option.memberId} value={option.memberId}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </div>
    </Sheet>
  );
}
