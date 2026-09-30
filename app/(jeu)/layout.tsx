/**
 * The guard for game mode, which is the same guard as `app/(app)/layout.tsx` and none of its chrome.
 *
 * Game mode is the one screen used standing on a touchline, one-handed, while watching football, and
 * the pitch is the only thing on it that has to be *looked at*. The team header (59 px) and the
 * four-tab bar (56 px plus its inset) were taking 115 px of the 852 a phone has, from the screen that
 * can least afford it. A nested layout cannot remove a parent layout's chrome, so the route lives in
 * its own group instead: route groups do not affect the URL, `/match/<id>/jeu` is unchanged, and the
 * shell is simply never rendered around it (decision 112).
 *
 * `requireTeamContext()` is kept verbatim: it redirects to `/connexion` without a session and to
 * `/rejoindre` without a team, which is invariant 5. It is `cache()`d, so calling it here costs
 * nothing the page was not already paying. Pages still call `can()` before mutating anything
 * (invariant 4) — being here proves membership, not permission.
 *
 * There is deliberately no « skip to content » link and no theme toggle: there is no navigation to
 * skip past, and the only way out of this screen is the back button in its own top bar.
 */

import { requireTeamContext } from "@/lib/auth/dal";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  await requireTeamContext();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* `px-3`, not the shell's `px-4`: eight more pixels of pitch width is eleven more of height,
          because the pitch is drawn to a fixed aspect ratio. */}
      <main id="contenu" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 md:px-6">
        {children}
      </main>
    </div>
  );
}
