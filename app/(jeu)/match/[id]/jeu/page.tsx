/**
 * Game mode: the screen the coach holds during the match.
 *
 * All this page does is load and authorise. Everything that moves is in the client component, and
 * everything that is *computed* is in `lib/match/presenter.ts` on top of `reduceMatch` — the score,
 * the clock, who is on the pitch and how long they have played are derived from the log on every
 * render and stored nowhere (invariant 2).
 *
 * Two notes on what this page does **not** do:
 *
 * - it does not decide whether the coach may operate the match; `can(actor, "match:operate", …)`
 *   does (invariant 4). A member who may not gets exactly the same screen, read-only, because
 *   following the score from the touchline is a legitimate thing to want;
 * - it does not write the match sheet. Only the final whistle does, and only through
 *   `finalizeMatch`. The `finalizeMatchById` call below is a repair path: it fires when the log says
 *   the match is over but `matches.status` disagrees, which is what a device that died between the
 *   POST and its response leaves behind.
 */

import { notFound } from "next/navigation";

import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { matchNameFr } from "@/lib/calendar/labels";
import { finalizeMatchById } from "@/lib/match/finalize";
import { getLiveMatch } from "@/lib/match/live";
import { reduceLive } from "@/lib/match/presenter";
import { GameMode } from "./_components/game-mode";

export async function generateMetadata({ params }: PageProps<"/match/[id]/jeu">) {
  const [{ team }, { id }] = await Promise.all([requireTeamContext(), params]);
  const live = await getLiveMatch(team.id, id);
  return {
    title: live
      ? `Mode match · ${matchNameFr(live.match.opponentName, live.match.isHome)}`
      : "Match introuvable",
  };
}

export default async function GameModePage({ params }: PageProps<"/match/[id]/jeu">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);

  let live = await getLiveMatch(team.id, id);
  if (!live) notFound();

  // Self-healing: a finished log with a live status means the freeze never ran. Do it now, then
  // reload, so the screen and `match_player_stats` agree.
  if (live.match.status !== "finished" && reduceLive(live, [], null).finished) {
    await finalizeMatchById(team.id, id);
    live = (await getLiveMatch(team.id, id)) ?? live;
  }

  const canOperate = can(actor, "match:operate", {
    teamId: team.id,
    match: { status: live.match.status, operatorUserId: live.match.operatorUserId },
  });

  return (
    <>
      {/*
       * The only `h1` in the app that is not drawn. Every pixel above the pitch is the clock and the
       * score, on purpose — a title bar here would push the ACTION button down the screen, and a coach
       * holding the phone at 0-0 in the 58th minute knows which match he is at. But the page still
       * needs a name: an audit of every screen found this one and the composition editor were the only
       * two with no level-one heading, so a screen reader landing here had nothing to announce.
       * `sr-only` is the same answer the recap table and the squad rows give.
       *
       * The back link that used to sit beside it is now the first thing in `MatchBar`, which is where
       * it can be the only way out of the screen.
       */}
      <h1 className="sr-only">
        Mode match · {matchNameFr(live.match.opponentName, live.match.isHome)}
      </h1>

      <GameMode live={live} canOperate={canOperate} />
    </>
  );
}
