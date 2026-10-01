"use client";

/**
 * What both error boundaries show. One component so the French copy cannot drift between them.
 *
 * **A full reload is the primary affordance, and it is offered for every error this screen shows.**
 * That is a deliberate choice not to classify the failure first. Reloading is never *wrong* advice
 * for « this screen could not display »: it discards the page, the router cache and the JavaScript
 * bundle, so whatever state produced the crash is gone and the app comes back on the deployment
 * that is live now. « Réessayer » is wrong advice specifically — see below — so putting the reload
 * first makes the screen correct without it having to know what broke.
 *
 * The failure that made the old copy's wrongness concrete is **deployment skew**, and it has been
 * reproduced end to end against two local production builds served on one port. A page loaded from
 * one deployment posts a Server Action to a newer one; the action id in the stale bundle no longer
 * exists, Next answers **404** with « Failed to find Server Action … older or newer deployment », and
 * the client throws `UnrecognizedActionError` — which lands here, because React cancels the queued
 * action and shows the nearest boundary. There are 42 `useActionState` call sites in this app and
 * every one of them fails this way, so this one component is the recovery surface for all of them.
 * (Game mode is structurally immune: its events go to a Route Handler at a path-based URL that exists
 * on every deployment, and ingestion is idempotent on `client_event_id` — `lib/match/outbox.ts`.)
 *
 * One thing that reproduction taught us and that is worth not re-learning: **editing a comment in an
 * `actions.ts` does not change its action ids.** Two builds of this tree differing by one comment
 * line produced byte-identical sets of 41 ids in `server-reference-manifest.json`, and the stale page
 * logged in happily against the new server. What *does* change an id is renaming or removing the
 * exported action. So skew only bites on a deploy that moves or renames an action — which is most of
 * them, but not all, and a « change one comment » experiment will report that skew does not exist.
 *
 * We are **exposed** to it on every deploy and there is no host-level protection to buy: Vercel's
 * Skew Protection is not on the free plan. A reload is the only recovery from a dead action id.
 * This is deliberately *not* claimed to be the crash the owner reported from his iPhone — that one
 * survived a force-quit, and a force-quit is a document navigation, which is always served by the
 * latest deployment, so skew cannot survive one. What this screen fixes is its own advice.
 *
 * Why neither of the two instructions this screen used to give could work, both verified against the
 * installed Next 16.3.6 in `dist/client/components/error-boundary.js`:
 *
 * - `reset()` is `this.setState({ error: null })` and nothing else. It re-renders the segment from
 *   the same bundle, with the same dead action id, so on a skew failure it fails identically for as
 *   long as the tab stays open. It is still offered, second, because the other common cause here is
 *   a query that failed once — a cold Neon connection — and for that one a re-render is the cheap fix.
 * - « passez par un autre écran et revenez » is a client-side navigation. The bundle is the same one
 *   afterwards, so it is the same dead end wearing a longer path. It is gone.
 */

import Link from "next/link";

import { Button, buttonClassName } from "@/components/ui";

export type ErrorScreenProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /**
   * The boundary's third prop, which this screen takes and deliberately does not use. It is
   * `startTransition(() => { router.refresh(); reset(); })` — an RSC refetch followed by a reset.
   * It cannot help with skew: the refetch is issued by the same stale bundle, so it asks the new
   * deployment for a payload in the old format and fails again. Taken as a prop only so the next
   * reader finds it named here rather than in Next's types, and concludes we chose against it.
   */
  retry: () => void;
  /** Offer a way back to the application. Omit inside the shell, where the tab bar is one. */
  withHomeLink?: boolean;
};

/**
 * True when this is the deployment-skew failure above.
 *
 * The check is on `name`, not on `unstable_isUnrecognizedActionError` from `next/navigation`. Two
 * reasons, in order: the `unstable_` prefix is not covered by semver, so importing it would let a
 * minor Next bump break the recovery screen; and the exported predicate is an `instanceof` against
 * a class identity that a stale bundle is not guaranteed to share with the one that threw, which is
 * precisely the situation here. `name` is set in the constructor and survives both.
 *
 * It only ever changes a sentence. The reload is offered either way, so a future Next renaming the
 * error degrades this screen to vaguer copy and never to a dead end.
 */
function isDeploymentSkew(error: Error): boolean {
  return error.name === "UnrecognizedActionError";
}

export function ErrorScreen({
  error,
  reset,
  // Destructured on purpose, and on purpose not called: `retry` does `router.refresh()` then
  // `reset()`, and the refetch it issues comes from the same stale bundle that just failed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  retry,
  withHomeLink = false,
}: ErrorScreenProps) {
  const skew = isDeploymentSkew(error);

  return (
    // No horizontal padding here, deliberately, even though `app/error.tsx` has none that works:
    // its `safe-px px-5` pair cancels itself, because `safe-px` sets the *longhands*
    // `padding-left`/`padding-right` (`globals.css:158-161`) while `px-5` compiles to the
    // `padding-inline` shorthand, and a longhand after a shorthand always wins. Upright on a phone
    // the gutter is therefore 0 — measured, the button row ran 4 → 386 of 390 px. Moving the block
    // in `globals.css` does not help: Tailwind v4 sorts the utilities layer by property and
    // interleaves custom `@utility` rules among its own built-ins, so a custom utility is emitted
    // after one it was declared above.
    //
    // The gutter belongs to the three standalone page shells carrying that clash (`app/error.tsx`,
    // `app/not-found.tsx`, `app/(auth)/layout.tsx`) rather than here, because `app/(app)/error.tsx`
    // renders this same component inside `app-shell`'s own `px-4`: padding it here would double-pad
    // that one and still leave the other three bare. One slice owns all four.
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
        <h1 className="text-xl font-bold tracking-tight text-ink">Cet écran n’a pas pu s’afficher</h1>
        {/* No « rien n’a été perdu » here: this boundary also catches a render that failed just
            after a Server Action, and whether that action landed is exactly what is not known. The
            game-mode boundary can make that promise, because the outbox backs it.
            And no promise that recharger *répare* either — it says what it does. */}
        <p className="mx-auto max-w-sm text-sm text-ink-muted">
          {skew
            ? "Une nouvelle version de l’app est sortie pendant que cet écran était ouvert. Recharge la page pour passer dessus : il n’y a rien d’autre à faire."
            : "Recharge la page : l’app repart de zéro, dans sa dernière version. C’est ce qui a le plus de chances de débloquer l’écran."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* `window.location.reload()` and not `router.refresh()`: only a document reload throws the
            current JavaScript bundle away, and that bundle is the thing that is stale. */}
        <Button onClick={() => window.location.reload()}>Recharger la page</Button>
        <Button variant="secondary" onClick={reset}>
          Réessayer
        </Button>
        {withHomeLink ? (
          <Link href="/calendrier" className={buttonClassName({ variant: "ghost" })}>
            Retour au calendrier
          </Link>
        ) : null}
      </div>

      {/* `digest` is React's hash of a *server-side* error, attached when it crosses the RSC
          boundary; it is the only handle on the Vercel log line, and on this project the person
          reading those logs is the person the app broke in front of. So it is shown when it exists,
          framed as something to send rather than something to read.
          Its absence is a diagnosis in itself and deliberately stays in this comment rather than on
          screen: no code means the throw happened in the browser — a skew failure, or any other
          client-side crash — so there is no server log line to go and find. */}
      {error.digest ? (
        <p className="text-xs text-ink-muted/80">
          Si tu nous le signales, donne ce code : <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
