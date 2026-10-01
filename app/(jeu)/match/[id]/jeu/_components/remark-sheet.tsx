"use client";

import { useState } from "react";

import { Button, Field, Select, Sheet } from "@/components/ui";
import { remarkLabelFr, type RemarkKind } from "@/lib/match/events";
import type { PlayerOption } from "@/lib/match/presenter";

export type RemarkSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Which of the six was tapped. It is the title of the sheet: the question left is only « qui ». */
  kind: RemarkKind;
  /** « 58’ · 2e période » — the minute the remark will carry, which is the minute of the tap. */
  stampLabel: string;
  /** Who the remark can be about: on the pitch first, then the bench. */
  options: readonly PlayerOption[];
  onConfirm: (memberId: string) => void;
};

/**
 * The second half of « Remarque »: the remark is chosen, and a remark is always about somebody.
 *
 * `memberId` is **required** in the `REMARK` payload, and that is the whole difference between a
 * remark and a `COMMENT`: « bel effort » about nobody in particular is a note, not a remark. So the
 * player is unset to begin with and « Enregistrer » is disabled until one is picked, rather than the
 * sheet guessing — the man on the pitch the coach happened to look at last is not a default.
 *
 * A native `<select>` and not another `PlayerPicker`, for the same reason `comment-sheet.tsx` uses
 * one: on a phone it opens the OS picker, which is one thumb and no scrolling inside a sheet, and it
 * keeps the whole of the step — the remark's name, the minute, and who — on one screen.
 */
export function RemarkSheet({
  open,
  onClose,
  kind,
  stampLabel,
  options,
  onConfirm,
}: RemarkSheetProps) {
  const [memberId, setMemberId] = useState("");

  function submit() {
    if (memberId === "") return;
    onConfirm(memberId);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={remarkLabelFr(kind)}
      description={stampLabel}
      footer={
        <Button fullWidth size="lg" disabled={memberId === ""} onClick={submit}>
          Enregistrer
        </Button>
      }
    >
      {/* The hint says why the button is dead, and it says it where the eye already is — under the
          label, above the control. Not on the disabled button, which nothing can hover on a phone
          (decision 072). It disappears the moment the answer makes it untrue. */}
      <Field
        htmlFor="remark-member"
        label="À propos de qui ?"
        hint={
          memberId === ""
            ? "Choisis le joueur : une remarque est toujours à propos de quelqu’un."
            : undefined
        }
      >
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={memberId}
            autoFocus
            onChange={(event) => setMemberId(event.target.value)}
          >
            <option value="">Choisis un joueur</option>
            {options.map((option) => (
              <option key={option.memberId} value={option.memberId}>
                {option.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </Sheet>
  );
}
