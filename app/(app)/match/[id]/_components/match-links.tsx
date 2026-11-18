/**
 * « Match · Compositions · Corriger · Noter » — the pages of one match, as a row of links under its
 * title, **from `md:` only** (decision 227).
 *
 * On a desktop the match page is a long column and its entry points to the other three pages sit in
 * cards several screens down; with a mouse, the only way between them was scrolling to the right card
 * or using a back link. This row says where you can go from here, in one line, without scrolling.
 *
 * It grants nothing. Each link is shown exactly when the match page already shows its own entry
 * point, and on the same answer — the caller passes the flags it computed for those cards, from
 * `can()` (invariant 4): compositions behind `match:manageLineups`, the composition page's own guard;
 * « Corriger » / « Saisir » behind `match:amend` on a finished match, with the label the « Corriger le
 * match » card uses; « Noter » when the reader has a set of notes to give (`mayRate`). A player
 * therefore sees « Match » and « Noter » at most, and a row of one link is not drawn at all.
 *
 * `hidden md:flex`: phones keep the page exactly as it was — there the cards are a thumb's scroll
 * away, and the tab bar already sits under the page.
 */

import Link from "next/link";

import { cn } from "@/components/ui/cn";

export type MatchLinksProps = {
  matchId: string;
  /** May open the compositions page (`match:manageLineups`). */
  mayCompose: boolean;
  /** May correct, or type up, the log of a finished match (`match:amend` and finished). */
  mayAmend: boolean;
  /** The log holds something, so the correction screen corrects rather than types up. */
  recorded: boolean;
  /** Has notes to give on this match (`mayRate` on the match page). */
  mayRate: boolean;
};

export function MatchLinks({ matchId, mayCompose, mayAmend, recorded, mayRate }: MatchLinksProps) {
  const base = `/match/${matchId}`;
  const links = [
    { href: base, label: "Match", current: true },
    ...(mayCompose ? [{ href: `${base}/composition`, label: "Compositions", current: false }] : []),
    ...(mayAmend
      ? [{ href: `${base}/saisie`, label: recorded ? "Corriger" : "Saisir", current: false }]
      : []),
    ...(mayRate ? [{ href: `${base}/notation`, label: "Noter", current: false }] : []),
  ];
  if (links.length < 2) return null;

  return (
    <nav aria-label="Pages du match" className="hidden md:block">
      <ul className="flex flex-wrap gap-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={link.current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                link.current
                  ? "bg-accent/15 text-accent"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
