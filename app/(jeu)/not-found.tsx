/**
 * The 404 boundary for game mode. **Not a duplicate of `app/(app)/not-found.tsx` — a sibling.**
 *
 * `app/(jeu)/match/[id]/jeu/page.tsx` answers `notFound()` when `getLiveMatch` returns null, and
 * that happens for two reasons which are deliberately indistinguishable: the match does not exist,
 * *or* it belongs to another team. While game mode lived in `app/(app)/` that call resolved to the
 * shell's own not-found page, whose copy — « la page n’existe pas, ou elle est réservée aux coachs »
 * — is ambiguous on purpose, so the screen never confirms that somebody else's match is there.
 *
 * Moving the route into its own group (decision 112) left this group with no boundary of its own, so
 * every one of those 404s fell through to `app/not-found.tsx`. That file's own doc comment says its
 * wording is *false* for exactly this case: « cette adresse ne correspond à aucun écran » is true of
 * a typo and a lie about a match id that is real and not ours. Hence this file. Deleting it as a
 * near-copy of the `(app)` one reintroduces the wrong sentence.
 *
 * Two layout constraints, both because Next keeps the layouts that *did* match: `app/(jeu)/layout.tsx`
 * already renders `<main id="contenu">`, so this must not render a second `<main>` — two `main`
 * landmarks is invalid HTML — and it must not set `min-h-svh` inside that layout's `min-h-dvh flex`
 * column, where it would overflow the viewport by the height of the safe-area inset. `flex-1` with
 * centred content fills exactly the space there is.
 *
 * The one link leaves the group for the calendar: there is nothing to go back to inside game mode
 * when the match it was about cannot be read.
 */

import { ButtonLink } from "@/components/ui";

export default function GameNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
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
