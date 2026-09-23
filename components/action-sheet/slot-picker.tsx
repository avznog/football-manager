"use client";

import { EmptyState, Sheet } from "@/components/ui";
import { OptionRow } from "./option-row";

export type SlotChoice = {
  slotId: string;
  /** « MC », « AT » — the position code, which is how a coach names a spot. */
  positionCode: string;
  /** « Milieu central ». */
  label: string;
  /** Who is there now, if anyone: moving a player into an occupied slot swaps them. */
  occupantName?: string | null;
  disabled?: boolean;
};

export type SlotPickerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  choices: readonly SlotChoice[];
  onPick: (slotId: string) => void;
};

/**
 * Pick a position.
 *
 * A list, not the pitch: this is the sheet used for « Changement de poste » while the match is
 * running, and dragging a disc on a phone held in one hand at 78′ is a way to lose a player. The
 * pitch behind the sheet stays visible, so the list and the picture agree — and the drag-and-drop
 * editor exists for the calm, pre-match case (M3's composition screen).
 */
export function SlotPicker({ open, onClose, title, description, choices, onPick }: SlotPickerProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title} description={description}>
      {choices.length === 0 ? (
        <EmptyState
          title="Aucun poste disponible."
          description="La formation de ce match n’a pas de postes enregistrés."
        />
      ) : (
        <ul className="space-y-2">
          {choices.map((choice) => (
            <li key={choice.slotId}>
              <OptionRow
                label={choice.label}
                subtitle={choice.occupantName ? `occupé par ${choice.occupantName}` : "libre"}
                leading={choice.positionCode}
                disabled={choice.disabled}
                onClick={() => onPick(choice.slotId)}
              />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
