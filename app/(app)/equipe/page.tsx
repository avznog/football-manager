import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireTeamContext } from "@/lib/auth/dal";
import { getActiveInvites, getSquad } from "@/lib/team/queries";
import { InviteManager } from "./invite-manager";
import { MemberRow } from "./member-row";

export const metadata = { title: "Équipe" };

export default async function TeamPage() {
  const { team } = await requireTeamContext();
  const [squad, activeInvites] = await Promise.all([
    getSquad(team.id),
    team.isCoach ? getActiveInvites(team.id) : Promise.resolve([]),
  ]);

  const players = squad.filter((member) => member.isPlayer);
  const staff = squad.filter((member) => !member.isPlayer);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-ink">{team.name}</h1>
        <p className="text-sm text-ink-muted">
          {players.length} joueur{players.length > 1 ? "s" : ""}
        </p>
      </header>

      <Card title="Effectif" flush>
        <ul className="divide-y divide-border/60">
          {players.map((member) => (
            <MemberRow
              key={member.membershipId}
              member={member}
              teamId={team.id}
              canManage={team.isCoach}
            />
          ))}
        </ul>
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
              />
            ))}
          </ul>
        </Card>
      ) : null}

      {team.isCoach ? (
        <InviteManager teamId={team.id} invites={activeInvites} />
      ) : (
        <p className="text-sm text-ink-subtle">
          Seul un coach peut inviter de nouveaux joueurs.{" "}
          <Badge variant="neutral">lecture seule</Badge>
        </p>
      )}
    </div>
  );
}
