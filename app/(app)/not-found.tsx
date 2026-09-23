/**
 * The boundary for every `notFound()` inside the application — fifteen pages call it.
 *
 * Without this file Next answers all of them with its own built-in page: « This page could not be
 * found. », in English, in an app whose every other string is French (`CLAUDE.md`), with nothing to
 * tap but the tab bar.
 *
 * The wording has to cover both reasons a page here answers 404, because they are deliberately
 * indistinguishable: the row is gone, *or* `can()` refused and the screen answers `notFound()`
 * rather than 403 so that it does not confirm the thing exists (`saisie/page.tsx` is the clearest
 * case — a player asking for the retro-entry screen must not learn whether the match is there).
 * Hence « la page n’existe pas, ou elle est réservée aux coachs » — both halves, neither
 * confirmed, and the page never says which of the two applies to the link you followed.
 */

import { ButtonLink } from "@/components/ui";

export default function AppNotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="text-5xl font-bold tracking-tight text-ink-muted/60" aria-hidden="true">
        404
      </p>
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">Page introuvable</h1>
        <p className="mx-auto max-w-sm text-sm text-ink-muted">
          Ce lien ne mène à rien : la page n’existe pas, ou elle est réservée aux coachs.
        </p>
      </div>
      <ButtonLink href="/calendrier" variant="secondary">
        Retour au calendrier
      </ButtonLink>
    </div>
  );
}
