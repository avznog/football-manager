/**
 * The guard for everything inside the application.
 *
 * `requireTeamContext()` is the real check (`proxy.ts` only sniffs a cookie): it redirects to
 * `/connexion` without a session and to `/rejoindre` without a team, which is invariant 5 in
 * `CLAUDE.md` — a user with no team sees nothing but the join screen.
 *
 * Every page under this layout can therefore assume a signed-in member of a real team. It
 * still has to call `can()` before mutating anything (invariant 4): being here proves
 * membership, not permission.
 */

import { AppShell } from "@/components/nav/app-shell";
import { requireTeamContext, requireUser } from "@/lib/auth/dal";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Both are `cache()`d and share the same session lookup, so this is one round trip.
  const [{ team }, user] = await Promise.all([requireTeamContext(), requireUser()]);

  return (
    <AppShell
      team={{ name: team.name, crestUrl: team.crestUrl, primaryColor: team.primaryColor }}
      user={{ displayName: user.displayName }}
      isCoach={team.isCoach}
    >
      {children}
    </AppShell>
  );
}
