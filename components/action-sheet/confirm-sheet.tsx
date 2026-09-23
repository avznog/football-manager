"use client";

import type { ReactNode } from "react";

import { Button, Sheet } from "@/components/ui";

export type ConfirmSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** What is at stake, in French. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for the irreversible ones: the final whistle, an annulment. */
  tone?: "primary" | "danger";
  onConfirm: () => void;
};

/**
 * A yes/no step that cannot be answered by accident.
 *
 * `dismissible={false}`: no Escape, no tap on the scrim, no close cross — the only ways out are the
 * two buttons, and « Annuler » is the wide one on the left where a thumb lands by mistake. Used for
 * the final whistle (it freezes the match) and for annulling an event (it appends to a log that is
 * never rewritten).
 */
export function ConfirmSheet({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Annuler",
  tone = "primary",
  onConfirm,
}: ConfirmSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      dismissible={false}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} fullWidth onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {children ?? null}
    </Sheet>
  );
}
