import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { parseHex } from "@/components/ui/contrast";

import { BottomNav } from "./bottom-nav";
import { SidebarNav } from "./sidebar-nav";

export type AppShellProps = {
  team: { name: string; crestUrl: string | null; primaryColor: string };
  user: { displayName: string };
  isCoach: boolean;
  children: React.ReactNode;
};

/** Header height, mirrored by the sidebar's sticky offset below. */
const HEADER_HEIGHT = "h-14";

function TeamMark({
  name,
  crestUrl,
  primaryColor,
}: {
  name: string;
  crestUrl: string | null;
  primaryColor: string;
}) {
  if (crestUrl) {
    return (
      // A crest is an arbitrary URL uploaded per club, so `next/image` would
      // need a `remotePatterns` entry we cannot predict. Plain <img> it is.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={crestUrl}
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0 rounded-md object-contain"
      />
    );
  }
  // Fallback: club colour on a disc, with a measured label colour.
  return <Avatar name={name} color={primaryColor} size="sm" />;
}

/**
 * Application shell: compact top header, navigation, and the page content.
 *
 * Server-Component-compatible — no hooks, no handlers. Only the two navigation
 * children are Client Components, because the active tab depends on the current
 * path.
 *
 * Navigation is a fixed bottom tab bar on mobile (thumb reach, safe-area aware)
 * and a left sidebar from `md:` upwards, with the content constrained to a
 * readable width.
 *
 * `team.primaryColor` is the only place a club colour is allowed in the shell
 * (decision 014): the crest fallback disc and a hairline rule under the header.
 * It is never used as the interactive accent.
 */
export function AppShell({ team, user, isCoach, children }: AppShellProps) {
  const clubColor = parseHex(team.primaryColor) ? team.primaryColor : undefined;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:ring-1 focus:ring-border"
      >
        Aller au contenu
      </a>

      <header className="safe-pt sticky top-0 z-40 border-b border-border/60 bg-surface">
        {/* Club identity cue. Decorative: no information depends on it. */}
        <div
          aria-hidden="true"
          className="h-0.5 w-full"
          style={clubColor ? { backgroundColor: clubColor } : undefined}
        />
        <div
          className={cn("flex items-center gap-3 px-4 md:px-6", HEADER_HEIGHT)}
        >
          <TeamMark
            name={team.name}
            crestUrl={team.crestUrl}
            primaryColor={team.primaryColor}
          />
          <p className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
            {team.name}
          </p>

          {isCoach ? (
            <Badge variant="accent" className="hidden sm:inline-flex">
              Coach
            </Badge>
          ) : null}

          <Link
            href="/moi"
            aria-label={`Mon profil — ${user.displayName}`}
            className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <Avatar name={user.displayName} size="sm" />
            <span className="hidden max-w-32 truncate sm:inline">
              {user.displayName}
            </span>
          </Link>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col border-r border-border/60 bg-surface py-4 md:flex">
          <SidebarNav />
          {isCoach ? (
            <p className="mt-3 px-4">
              <Badge variant="accent">Coach</Badge>
            </p>
          ) : null}
          {/* Desktop convenience. The `/moi` page can render the full
              `<ThemeToggle showLegend />` with its labels. */}
          <div className="mt-auto px-3 pt-4">
            <ThemeToggle compact />
          </div>
        </aside>

        {/* The bottom padding clears the fixed tab bar (56px + home indicator)
            on mobile; from md: the tab bar is gone and `md:pb-10` takes over.
            Written as a `pb-*` utility, not the `tabbar-pb` helper, so the
            `md:` variant reliably wins in the cascade. */}
        <main
          id="contenu"
          className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:px-6 md:py-6 md:pb-10"
        >
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
