"use client";

/**
 * Game mode has its own boundary because it is the one screen where a crash costs something that
 * cannot be typed up again afterwards: the coach is on the touchline, the match does not stop, and
 * the generic « réessayez » is not enough to tell him whether the four actions he has just tapped
 * are gone.
 *
 * They are not, and this is the screen that can say so truthfully. Every action is written to the
 * IndexedDB queue *before* it is POSTed (`lib/match/outbox.ts`), and a remount — which is exactly
 * what `reset()` does — calls `outbox.hydrate()` and reads the store back. So the promise below is
 * about the queue, not about this component's state, and it holds for the same reason a reload at
 * 78′ holds. The one exception is private-mode Safari, where `indexedDB.open` is refused and the
 * queue falls back to memory; that is a documented degradation of the outbox, not of this screen,
 * and it is why the sentence talks about « la file d’envoi » rather than promising the device.
 */

import { useParams } from "next/navigation";

import { Button, ButtonLink } from "@/components/ui";

export default function GameModeError({ reset }: { error: Error; reset: () => void }) {
  // Not a relative `../`: against `/match/<id>/jeu` that resolves to `/match/`, and next/link does
  // not promise to resolve relative hrefs anyway. The param is the route's own truth.
  const { id } = useParams<{ id: string }>();

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">Le mode match a planté</h1>
        <p className="mx-auto max-w-sm text-sm text-ink-muted">
          Les actions déjà validées sont dans la file d’envoi, pas dans cet écran : relancer le mode
          match les retrouve, y compris celles qui n’étaient pas encore parties.
        </p>
      </div>
      <Button size="lg" onClick={reset}>
        Relancer le mode match
      </Button>
      <ButtonLink href={`/match/${id}`} variant="ghost" size="sm">
        Revenir à la fiche du match
      </ButtonLink>
    </div>
  );
}
