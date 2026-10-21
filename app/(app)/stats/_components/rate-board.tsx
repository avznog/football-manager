/**
 * The frequency cards of `/stats` — « 1 but toutes les X′ », ranked on its real value (decision 177).
 *
 * The figure on the right is the one the row is ranked on, raw: « 1 but toutes les 24′ », or « aucun
 * but encaissé » where the rate would be infinite. Under it, the record that rate is, « 3 buts
 * encaissés en 72′ ». There is no smoothing to explain any more, so there is no note either: the two
 * numbers a reader sees are the two numbers the order comes from.
 *
 * Two boards, one shape, one unit (decision 195): `RateBoard` for what a player took, `EventRateBoard`
 * for what he did (decision 197). The screen tells them apart by the heading — « Qui encaisse le moins
 * souvent », « Qui marque le plus souvent ». The arithmetic is the same minutes over count in both,
 * but no longer over the same minutes: since decision 203 an `EventRateBoard` is over the outfield
 * minutes alone, so each card's subtitle has to name the population its figure is a rate over.
 */

import { Card } from "@/components/ui/card";
import type { DecisiveBoard, MinutesPerEventBoard } from "@/lib/stats/aggregate";
import type { ConcededRateBoard } from "@/lib/stats/impact";
import {
  concededRateFr,
  DECISIVE_WORDS_FR,
  decisiveRecordFr,
  eventRateFr,
  type EventWordsFr,
} from "@/lib/stats/format";

import { CardEmpty, RankedRows } from "./parts";

export function RateBoard({
  title,
  description,
  board,
  emptyMessage,
}: {
  title: string;
  description: string;
  board: ConcededRateBoard;
  emptyMessage: string;
}) {
  if (board.entries.length === 0) {
    return (
      <Card title={title} description={description} as="h3">
        <CardEmpty>{emptyMessage}</CardEmpty>
      </Card>
    );
  }

  return (
    <Card title={title} description={description} as="h3" flush>
      <RankedRows
        entries={board.entries}
        value={(entry) => concededRateFr(entry.conceded, entry.minutes).rate}
        detail={(entry) => concededRateFr(entry.conceded, entry.minutes).record}
      />
    </Card>
  );
}

/**
 * « Qui marque le plus souvent » — his own goals, or his own assists, over the minutes he spent on the
 * pitch outside the goal (decision 197, narrowed by 203).
 *
 * The men it never happened to are at the bottom with « aucun but marqué » over the minutes it did not
 * happen in, rather than cut from the list: the card is read as « où est-ce que je suis », and a man
 * who has played five matches without scoring is somewhere, not nowhere. A man who only ever kept goal
 * is the one exception, and he is absent: the board has no denominator for him.
 */
export function EventRateBoard({
  title,
  description,
  board,
  words,
  emptyMessage,
}: {
  title: string;
  description: string;
  board: MinutesPerEventBoard;
  words: EventWordsFr;
  emptyMessage: string;
}) {
  if (board.entries.length === 0) {
    return (
      <Card title={title} description={description} as="h3">
        <CardEmpty>{emptyMessage}</CardEmpty>
      </Card>
    );
  }

  return (
    <Card title={title} description={description} as="h3" flush>
      <RankedRows
        entries={board.entries}
        value={(entry) => eventRateFr(entry.count, entry.minutes, words).rate}
        detail={(entry) => eventRateFr(entry.count, entry.minutes, words).record}
      />
    </Card>
  );
}

/**
 * « Les plus décisifs » — his goals *and* his passes over the same outfield minutes (decision 212).
 *
 * Its own component rather than an `EventRateBoard` with a flag, because it differs from that board in
 * both halves of a row. The figure is the same « 1 action déc. toutes les X′ », but the record under it
 * is a **breakdown** — « 2 buts et 1 passe décisive en 120′ » — and the board carries no zero rows at
 * all: a man with neither is absent, where the goal and pass boards keep him at the bottom. Two
 * differences is one too many for a boolean.
 */
export function DecisiveRateBoard({
  title,
  description,
  board,
  emptyMessage,
}: {
  title: string;
  description: string;
  board: DecisiveBoard;
  emptyMessage: string;
}) {
  if (board.entries.length === 0) {
    return (
      <Card title={title} description={description} as="h3">
        <CardEmpty>{emptyMessage}</CardEmpty>
      </Card>
    );
  }

  return (
    <Card title={title} description={description} as="h3" flush>
      <RankedRows
        entries={board.entries}
        value={(entry) => eventRateFr(entry.count, entry.minutes, DECISIVE_WORDS_FR).rate}
        detail={(entry) => decisiveRecordFr(entry.goals, entry.assists, entry.minutes)}
      />
    </Card>
  );
}
