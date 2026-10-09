/**
 * « Le moins de buts encaissés » — a ranked rate, on its real value (decision 177).
 *
 * The figure on the right is the one the row is ranked on, raw: « 1 but toutes les 24′ », or « aucun
 * but encaissé » where the rate would be infinite. Under it, the record that rate is, « 3 buts
 * encaissés en 72′ ». There is no smoothing to explain any more, so there is no note either: the two
 * numbers a reader sees are the two numbers the order comes from.
 */

import { Card } from "@/components/ui/card";
import type { ConcededRateBoard } from "@/lib/stats/impact";
import { concededRateFr } from "@/lib/stats/format";

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
