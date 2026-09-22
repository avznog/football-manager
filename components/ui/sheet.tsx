"use client";

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";

export type SheetProps = {
  open: boolean;
  /** Called for Escape, the close button, and a click on the scrim. */
  onClose: () => void;
  /** French, always present: it labels the dialog for assistive tech. */
  title: string;
  /** Optional muted line under the title. */
  description?: string;
  children: ReactNode;
  /** Sticky action row, e.g. « Annuler » / « Valider ». */
  footer?: ReactNode;
  /** Set false for a step the user must answer (no Escape, no scrim click). */
  dismissible?: boolean;
  className?: string;
};

/**
 * Bottom sheet on mobile, centred dialog from `md:` upwards.
 *
 * Built on the native `<dialog>` element and `showModal()`, which gives a real
 * focus trap (the rest of the page becomes inert in the top layer), Escape
 * handling and correct stacking for free — no JS focus-loop to get wrong.
 * There is no entry animation on purpose: the live-match ACTION menu opens on
 * this and must feel instant (decision 014, sober and functional).
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  className,
}: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Lets the `close` event tell "the parent already knows" (we closed it from
  // the effect below) from "something else closed it" (a form submit).
  const openRef = useRef(open);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    openRef.current = open;

    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // iOS Safari still scrolls the page behind a modal dialog.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function handleScrimClick(event: MouseEvent<HTMLDialogElement>) {
    // The <dialog> box fills the viewport; the panel is a child. A pointer
    // event whose target is the dialog itself therefore landed on the scrim.
    if (dismissible && event.target === dialogRef.current) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Keep the `open` prop the single source of truth.
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClose={() => {
        if (openRef.current) onClose();
      }}
      onMouseDown={handleScrimClick}
      className={cn(
        "fm-sheet hidden open:flex",
        "fixed inset-0 m-0 h-dvh max-h-dvh w-screen max-w-none bg-transparent p-0",
        "items-end justify-center md:items-center md:p-6",
      )}
    >
      <div
        className={cn(
          "flex max-h-[88dvh] w-full flex-col overflow-hidden bg-surface text-ink",
          "rounded-t-2xl border-t border-border/60",
          "md:max-h-[85dvh] md:max-w-lg md:rounded-2xl md:border",
          className,
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border/60 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-sm text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={onClose}
              aria-label="Fermer"
              className="-mr-1 -mt-1"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="size-5"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Button>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>

        {footer ? (
          // The bottom padding folds in the home-indicator inset; written as a
          // single `pb-*` utility so it cannot be overwritten by `py-*`.
          <footer className="shrink-0 border-t border-border/60 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
            {footer}
          </footer>
        ) : (
          <div className="safe-pb shrink-0" />
        )}
      </div>
    </dialog>
  );
}
