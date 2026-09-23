/**
 * A URL that matches no route at all: a typo, or a link from before a rename.
 *
 * It has to stand on its own — centred, its own full height — because for a path that matches no
 * segment there is no layout above it but `app/layout.tsx`. Next *does* keep the layouts that did
 * match (this file rendered inside the shell, tab bar and all, when `app/(app)/not-found.tsx` was
 * removed to check), so the sibling file is not there for the chrome. It is there for the **copy**:
 * « cette adresse ne correspond à aucun écran » is true of a typo and false of a coach-only screen a
 * player asked for, which is what most of the fifteen `notFound()` calls inside the app actually are.
 *
 * Nothing about the visitor is known here, so the one link is `/calendrier`, which is right either
 * way: without a session the proxy and the layout guard send them on to `/connexion` (invariant 5).
 */

import Link from "next/link";

import { buttonClassName } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="safe-px flex min-h-svh flex-col items-center justify-center gap-4 px-5 py-10 text-center">
      <p className="text-5xl font-bold tracking-tight text-ink-muted/60" aria-hidden="true">
        404
      </p>
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">Page introuvable</h1>
        <p className="mx-auto max-w-sm text-sm text-ink-muted">
          Cette adresse ne correspond à aucun écran de l’application.
        </p>
      </div>
      <Link href="/calendrier" className={buttonClassName({ variant: "secondary" })}>
        Retour à l’application
      </Link>
    </main>
  );
}
