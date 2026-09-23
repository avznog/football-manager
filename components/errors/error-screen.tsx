"use client";

/**
 * What both error boundaries show. One component so the French copy cannot drift between them.
 *
 * The `digest` is deliberately on screen. In production React strips the message of a server-side
 * error and replaces it with that hash, which is the only thing that ties what the user saw to a
 * line in the Vercel logs — and on this project the person reading those logs is the person the app
 * broke in front of. It is rendered as a support code, not as an explanation.
 *
 * `reset()` re-renders the segment. It is worth offering because the usual cause here is a query
 * that failed once (a cold Neon connection), but the copy promises nothing: if the cause is still
 * there, tapping it fails again, and the second sentence gives somewhere else to go.
 */

import Link from "next/link";

import { Button, buttonClassName } from "@/components/ui";

export type ErrorScreenProps = {
  digest?: string;
  reset: () => void;
  /** Offer a way back to the application. Omit inside the shell, where the tab bar is one. */
  withHomeLink?: boolean;
};

export function ErrorScreen({ digest, reset, withHomeLink = false }: ErrorScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6">
          <path d="M12 9v4" strokeLinecap="round" />
          <path d="M12 17h.01" strokeLinecap="round" />
          <path
            d="M10.3 3.9 2.4 17.5a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">Une erreur est survenue</h1>
        {/* No « rien n’a été perdu » here: this boundary also catches a render that failed just
            after a Server Action, and whether that action landed is exactly what is not known. The
            game-mode boundary can make that promise, because the outbox backs it. */}
        <p className="mx-auto max-w-sm text-sm text-ink-muted">
          Cet écran n’a pas pu s’afficher. Réessayez ; si cela se reproduit, passez par un autre
          écran et revenez.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" onClick={reset}>
          Réessayer
        </Button>
        {withHomeLink ? (
          <Link href="/calendrier" className={buttonClassName({ variant: "ghost" })}>
            Retour au calendrier
          </Link>
        ) : null}
      </div>

      {digest ? (
        <p className="text-xs text-ink-muted/80">
          Code de l’erreur : <span className="font-mono">{digest}</span>
        </p>
      ) : null}
    </div>
  );
}
