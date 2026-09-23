/**
 * « Nouvelle composition » — the starting seven, or a plan « à partir de la minute X ».
 *
 * Coach only. The minute comes from `?minute=`, which the list fills in with the first free mark
 * (half time, then the next free minute), and the editor lets the coach change it — a plan is
 * identified by its minute, not by its position in a list.
 */

import { notFound } from "next/navigation";

import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { getMatch } from "@/lib/match/queries";
import { EditorScreen } from "../_components/editor-screen";

export const metadata = { title: "Nouvelle composition" };

export default async function NewCompositionPage({
  params,
  searchParams,
}: PageProps<"/match/[id]/composition/nouvelle">) {
  const [{ actor, team }, { id }, query] = await Promise.all([
    requireTeamContext(),
    params,
    searchParams,
  ]);
  if (!can(actor, "match:manageLineups", { teamId: team.id })) notFound();

  const match = await getMatch(team.id, id);
  if (!match) notFound();

  return (
    <EditorScreen
      team={team}
      match={match}
      lineupId={null}
      requestedMinute={readMinute(query.minute)}
    />
  );
}

/** `?minute=30`. Anything else is ignored rather than guessed at. */
function readMinute(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string") return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0 || value > 200) return null;
  return value;
}
