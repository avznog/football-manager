"use client";

import { Button, EmptyState, Sheet } from "@/components/ui";
import type { PlayerOption } from "@/lib/match/presenter";
import { OptionRow } from "./option-row";

export type PlayerPickerProps = {
  open: boolean;
  onClose: () => void;
  /** « Qui a marqué ? » — a question, so the coach knows what the tap means. */
  title: string;
  description?: string;
  options: readonly PlayerOption[];
  onPick: (memberId: string) => void;
  /**
   * An answer that is not a player: « Aucune passe décisive », « Buteur inconnu ». Rendered under
   * the list as a secondary button, because it is the exception and must not be the easy tap.
   */
  skip?: { label: string; onPick: () => void } | null;
  /** French, shown when nobody can be picked — never an empty sheet with no explanation. */
  emptyLabel?: string;
};

/**
 * Pick a player.
 *
 * Every step of every action ends up here, so it is deliberately dull: one full-width row per
 * player, shirt number on the left, the reason to hesitate (« blessé », « déjà joué 22’ ») printed
 * under the name rather than hidden behind a filter. Nobody is ever removed from the list for being
 * a doubtful choice — decision 011 flags, it does not block.
 */
export function PlayerPicker({
  open,
  onClose,
  title,
  description,
  options,
  onPick,
  skip = null,
  emptyLabel = "Personne à proposer.",
}: PlayerPickerProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        skip ? (
          <Button variant="secondary" fullWidth onClick={skip.onPick}>
            {skip.label}
          </Button>
        ) : undefined
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
                onClick={() => onPick(option.memberId)}
              />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
