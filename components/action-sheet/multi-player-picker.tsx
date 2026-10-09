"use client";

import { Button, EmptyState, Sheet } from "@/components/ui";
import type { PlayerOption } from "@/lib/match/presenter";
import { OptionRow } from "./option-row";

export type MultiPlayerPickerProps = {
  open: boolean;
  onClose: () => void;
  /** « Qui sort ? » — a question, so the coach knows what a tap means. */
  title: string;
  description?: string;
  options: readonly PlayerOption[];
  /** The players ticked so far, in the order they were ticked. */
  selected: readonly string[];
  onToggle: (memberId: string) => void;
  /** « Suivant » — always enabled: nobody is a legitimate answer (a 0 / 0 change is a reshuffle). */
  confirmLabel: string;
  onConfirm: () => void;
  emptyLabel?: string;
};

/**
 * Pick any number of players, including none.
 *
 * The two questions of « Changement » (decision 147): who goes out, who comes in, unpaired. The rows
 * are `PlayerPicker`'s 56 px rows with `aria-pressed`, so a tap toggles rather than answers, and the
 * one button under the list moves on. It is never disabled: zero out and zero in is how a coach says
 * « just move people around », and the pitch that follows is where that is done.
 */
export function MultiPlayerPicker({
  open,
  onClose,
  title,
  description,
  options,
  selected,
  onToggle,
  confirmLabel,
  onConfirm,
  emptyLabel = "Personne à proposer.",
}: MultiPlayerPickerProps) {
  const chosen = new Set(selected);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <Button fullWidth onClick={onConfirm}>
          {confirmLabel}
        </Button>
      }
    >
      {options.length === 0 ? (
        <EmptyState title={emptyLabel} />
      ) : (
        <ul className="space-y-2">
          {options.map((option) => (
            <li key={option.memberId}>
              <OptionRow
                label={option.name}
                subtitle={option.subtitle}
                warn={option.warn}
                leading={option.jerseyNumber ?? undefined}
                selected={chosen.has(option.memberId)}
                onClick={() => onToggle(option.memberId)}
              />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
