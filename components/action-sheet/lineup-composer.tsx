"use client";

import { useMemo, useState } from "react";

import { Button, Select, Sheet } from "@/components/ui";
import type { PlayerOption } from "@/lib/match/presenter";

export type ComposerSlot = {
  id: string;
  positionCode: string;
  sort: number;
};

export type ComposerFormation = {
  id: string;
  label: string;
  slots: readonly ComposerSlot[];
};

export type LineupComposerProps = {
  open: boolean;
  onClose: () => void;
  /** « Composition de départ ». */
  title: string;
  description?: string;
  formations: readonly ComposerFormation[];
  /** Which formation the sheet opens on. */
  initialFormationId: string | null;
  /** Everyone who may be placed, in the order the picker recommends them. */
  options: readonly PlayerOption[];
  /** Pre-filled assignments, e.g. the players already on the pitch. */
  initialAssignments?: readonly { slotId: string; memberId: string }[];
  confirmLabel: string;
  onConfirm: (assignments: { slotId: string; memberId: string }[], formationId: string) => void;
};

/**
 * Build a composition slot by slot, from a list.
 *
 * This is the fallback for the case game mode cannot avoid: a match that reaches kick-off with no
 * planned composition (nobody filled one in, or the squad that turned up is not the squad that was
 * planned). It is a list of positions with a native `<select>` on each — the OS picker is the
 * fastest, least error-prone control on a phone, and it degrades to a real dropdown on a laptop.
 *
 * It is deliberately **not** a drag-and-drop pitch: that editor is the composition screen's job
 * (M3), where the coach is sitting down before the match. At kick-off, with eleven people talking,
 * a list of seven dropdowns is quicker and cannot drop a player on the touchline.
 */
export function LineupComposer({
  open,
  onClose,
  title,
  description,
  formations,
  initialFormationId,
  options,
  initialAssignments = [],
  confirmLabel,
  onConfirm,
}: LineupComposerProps) {
  const [formationId, setFormationId] = useState(
    () => initialFormationId ?? formations[0]?.id ?? "",
  );
  const [bySlot, setBySlot] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialAssignments.map((entry) => [entry.slotId, entry.memberId])),
  );

  const formation = formations.find((item) => item.id === formationId) ?? formations[0] ?? null;
  const slots = useMemo(
    () => (formation ? [...formation.slots].sort((a, b) => a.sort - b.sort) : []),
    [formation],
  );

  const assignments = slots
    .map((slot) => ({ slotId: slot.id, memberId: bySlot[slot.id] ?? "" }))
    .filter((entry) => entry.memberId !== "");

  const counts = new Map<string, number>();
  for (const entry of assignments) counts.set(entry.memberId, (counts.get(entry.memberId) ?? 0) + 1);
  const duplicated = new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));

  const nameOf = (memberId: string) =>
    options.find((option) => option.memberId === memberId)?.name ?? "Joueur inconnu";

  /**
   * Changing formation keeps the players, by position order: a coach switching from 1-3-2-1 to
   * 1-2-3-1 has the same seven people in front of them and should not have to re-enter all of them.
   */
  function changeFormation(nextId: string) {
    const next = formations.find((item) => item.id === nextId);
    if (!next) return;
    const nextSlots = [...next.slots].sort((a, b) => a.sort - b.sort);
    const current = slots.map((slot) => bySlot[slot.id] ?? "");
    setFormationId(nextId);
    setBySlot(
      Object.fromEntries(nextSlots.map((slot, index) => [slot.id, current[index] ?? ""])),
    );
  }

  const problem =
    assignments.length === 0
      ? "Place au moins un joueur."
      : duplicated.size > 0
        ? `${[...duplicated].map(nameOf).join(", ")} ${duplicated.size > 1 ? "sont placés" : "est placé"} à deux postes.`
        : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="space-y-2">
          {problem ? <p className="text-sm font-medium text-danger">{problem}</p> : null}
          <p className="text-xs text-ink-muted">
            {assignments.length} joueur{assignments.length > 1 ? "s" : ""} sur {slots.length} postes
          </p>
          {/* Grid, not flex: `Button` is `shrink-0`, so two `w-full` buttons in a flex row overflow a
              390 px viewport and the confirm button is clipped out of reach. */}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" fullWidth onClick={onClose}>
              Annuler
            </Button>
            <Button
              fullWidth
              disabled={problem !== null}
              onClick={() => formation && onConfirm(assignments, formation.id)}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {formations.length > 1 ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Formation</span>
            <Select value={formationId} onChange={(event) => changeFormation(event.target.value)}>
              {formations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <ul className="space-y-3">
          {slots.map((slot) => {
            const memberId = bySlot[slot.id] ?? "";
            return (
              <li key={slot.id} className="flex items-center gap-3">
                <span className="w-10 shrink-0 text-sm font-semibold text-ink-muted tabular-nums">
                  {slot.positionCode}
                </span>
                <span className="min-w-0 flex-1">
                  <Select
                    aria-label={`Joueur au poste ${slot.positionCode}`}
                    value={memberId}
                    invalid={memberId !== "" && duplicated.has(memberId)}
                    onChange={(event) =>
                      setBySlot((current) => ({ ...current, [slot.id]: event.target.value }))
                    }
                  >
                    <option value="">— personne —</option>
                    {options.map((option) => (
                      <option key={option.memberId} value={option.memberId}>
                        {option.name}
                        {option.jerseyNumber ? ` (${option.jerseyNumber})` : ""}
                        {option.warn ? " ⚠" : ""}
                      </option>
                    ))}
                  </Select>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}
