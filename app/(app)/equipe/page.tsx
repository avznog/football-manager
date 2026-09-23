import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireTeamContext } from "@/lib/auth/dal";
import { getActiveInvites, getSquad } from "@/lib/team/queries";
import { InviteManager } from "./invite-manager";
import { MemberRow } from "./member-row";
import { TeamSettings } from "./team-settings";

export const metadata = { title: "Équipe" };

export default async function TeamPage() {
  const { team } = await requireTeamContext();
  const [squad, activeInvites] = await Promise.all([
    getSquad(team.id),
    team.isCoach ? getActiveInvites(team.id) : Promise.resolve([]),
  ]);

  const players = squad.filter((member) => member.isPlayer);
  const staff = squad.filter((member) => !member.isPlayer);

  /**
   * A team must always keep one coach, and `setMemberRole` / `removeMember` enforce it by refusing.
   * Counted here so the row can say so instead of offering a button that does nothing — `getSquad`
   * already excludes anybody who has left, which is the condition those actions check too.
   */
  const coaches = squad.filter((member) => member.role === "coach");
  const lastCoachId = coaches.length === 1 ? coaches[0].membershipId : null;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-ink">{team.name}</h1>
        <p className="text-sm text-ink-muted">
          {players.length} joueur{players.length > 1 ? "s" : ""}
        </p>
      </header>

      <Card title="Effectif" flush>
        {players.length === 0 ? (
          /* The state a brand-new team is in, and therefore the first thing the owner of a fresh
             instance sees. An empty bordered box says nothing; this says what to do next. */
          <p className="px-4 py-6 text-sm text-ink-muted">
            {team.isCoach
              ? "Personne encore. Génère un code d’invitation ci-dessous et envoie-le à tes joueurs : ils choisiront leur mot de passe eux-mêmes."
              : "Aucun joueur dans l’effectif pour l’instant."}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {players.map((member) => (
              <MemberRow
                key={member.membershipId}
                member={member}
                teamId={team.id}
                canManage={team.isCoach}
                isLastCoach={member.membershipId === lastCoachId}
              />
            ))}
          </ul>
        )}
      </Card>

      {staff.length > 0 ? (
        <Card title="Encadrement" flush>
          <ul className="divide-y divide-border/60">
            {staff.map((member) => (
              <MemberRow
                key={member.membershipId}
                member={member}
                teamId={team.id}
                canManage={team.isCoach}
                isLastCoach={member.membershipId === lastCoachId}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {team.isCoach ? (
        <>
          <InviteManager teamId={team.id} invites={activeInvites} />
          <TeamSettings
            teamId={team.id}
            name={team.name}
            primaryColor={team.primaryColor}
            secondaryColor={team.secondaryColor}
          />
        </>
      ) : (
        <p className="text-sm text-ink-subtle">
          Seul un coach peut inviter de nouveaux joueurs.{" "}
          <Badge variant="neutral">lecture seule</Badge>
        </p>
      )}
    </div>
  );
}
