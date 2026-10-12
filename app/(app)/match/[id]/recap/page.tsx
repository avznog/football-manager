/**
 * « Résumé » — the page that is now the bottom half of `/match/[id]`.
 *
 * Decision 189 merged the two screens a finished match had. This route stays, and redirects, because
 * the old URL is in more places than a grep of this repository can reach: a WhatsApp message from
 * last Sunday, a bookmark, the browser history of a dozen people. A 404 for « the link the coach sent
 * after the match » is the worst possible way to announce a reorganisation.
 *
 * `permanentRedirect`, not `redirect`: the move is permanent and a 308 lets a phone remember it. It
 * keeps the method and the body, which matters for nothing here — no form posts to this URL — and
 * costs nothing either.
 *
 * It takes **no** query string with it. The one that existed, `?saisie=1`, was a marker left by the
 * retro-entry redirect that no screen ever read; `lib/retro/actions.ts` now sends its own to
 * `/match/[id]`.
 */

import { permanentRedirect } from "next/navigation";

export default async function RecapRedirect({ params }: PageProps<"/match/[id]/recap">) {
  const { id } = await params;
  permanentRedirect(`/match/${id}`);
}
