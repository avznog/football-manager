/**
 * Editing a saved composition. Coach only.
 *
 * The id is looked up inside the match's own compositions rather than fetched on its own, so a
 * `lineups.id` from another match — or another team — simply is not found. A composition that game
 * mode has already confirmed is not editable; `EditorScreen` says so, and `saveLineup` refuses it
 * again (invariant 3).
 */

import { notFound } from "next/navigation";

import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { getMatch } from "@/lib/match/queries";
import { EditorScreen } from "../_components/editor-screen";

export const metadata = { title: "Modifier la composition" };

export default async function EditCompositionPage({
  params,
}: PageProps<"/match/[id]/composition/[lineupId]">) {
  const [{ actor, team }, { id, lineupId }] = await Promise.all([requireTeamContext(), params]);
  if (!can(actor, "match:manageLineups", { teamId: team.id })) notFound();

  const match = await getMatch(team.id, id);
  if (!match) notFound();

  return <EditorScreen team={team} match={match} lineupId={lineupId} requestedMinute={null} />;
}
