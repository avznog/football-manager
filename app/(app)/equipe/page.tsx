import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { requireTeamContext } from "@/lib/auth/dal";
import { getTeamCompetitions } from "@/lib/competition/queries";
import { invitesReadOnlyFr, staffCardFr } from "@/lib/team/labels";
import { getActiveInvites, getSquad } from "@/lib/team/queries";
import { CompetitionManager } from "./competition-manager";
import { InviteManager } from "./invite-manager";
import { MemberRow } from "./member-row";
import { TeamSettings } from "./team-settings";

export const metadata = { title: "Équipe" };

export default async function TeamPage() {
  const { team } = await requireTeamContext();
  const [squad, activeInvites, competitions] = await Promise.all([
    getSquad(team.id),
    team.isCoach ? getActiveInvites(team.id) : Promise.resolve([]),
    team.isCoach ? getTeamCompetitions(team.id) : Promise.resolve([]),
  ]);

  const players = squad.filter((member) => member.isPlayer);
  const staff = squad.filter((member) => !member.isPlayer);
  // « Encadrement » is true of every row under it and still not the whole staff: a coach who plays is
  // in the list above, with his « coach » badge. The card says so rather than letting the reader
  // conclude the touchline is one person.
  const staffCard = staffCardFr(players.filter((member) => member.role === "coach").length);

  /*
   * Desktop (decision 230): the squad on the left, everything a coach manages on the right — invites,
   * competitions, the team's settings — instead of one 720 px column where the settings sat four
   * screens down. The roster itself is two players a row from `xl:`. A player has no management
   * column, so the encadrement and the read-only note take the right-hand side instead. The coach's
   * management column is much the taller, so it spans into a trailing `1fr` row that soaks up its
   * height — spanning only the two card rows stretched them and left a screen of blank under the roster.
   */
  return (
    <PageContainer
      width="wide"
      className={`space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_28rem] ${team.isCoach ? "lg:grid-rows-[auto_auto_auto_1fr]" : ""}`}
    >
      <header className="flex items-baseline justify-between gap-3 lg:col-span-2">
        <h1 className="text-xl font-bold tracking-tight text-ink md:text-2xl md:leading-tight">{team.name}</h1>
        <p className="text-sm text-ink-muted md:max-w-prose">
          {players.length} joueur{players.length > 1 ? "s" : ""}
        </p>
      </header>

      {/* The description is the signpost: a coach used to have « Nommer coach » and « Retirer » on
          every row, and they now live on the member's own page. */}
      <Card
        title="Effectif"
        description={
          team.isCoach
            ? "Touche un joueur pour son numéro, ses postes, son rôle et ses blessures."
            : undefined
        }
        flush
        className={
          team.isCoach ? "lg:col-start-1 lg:row-start-2" : "lg:col-start-1 lg:row-span-2 lg:row-start-2"
        }
      >
        {players.length === 0 ? (
          /* The state a brand-new team is in, and therefore the first thing the owner of a fresh
             instance sees. An empty bordered box says nothing; this says what to do next. */
          <p className="px-4 py-6 text-sm text-ink-muted">
            {team.isCoach
              ? "Personne encore. Génère un code d’invitation ci-dessous et envoie-le à tes joueurs : ils choisiront leur mot de passe eux-mêmes."
              : "Aucun joueur dans l’effectif pour l’instant."}
          </p>
        ) : (
          /* Two a row from `xl:`: a squad of fifteen was a column twice the screen's height. The
             rows keep their own separators, since `divide-y` would draw a stray line above the
             second column's first row. */
          <ul className="divide-y divide-border/60 xl:grid xl:grid-cols-2 xl:divide-y-0 xl:[&>li]:border-b xl:[&>li]:border-border/60">
            {players.map((member) => (
              <MemberRow key={member.membershipId} member={member} />
            ))}
          </ul>
        )}
      </Card>

      {staff.length > 0 ? (
        <Card
          title={staffCard.titleFr}
          description={staffCard.descriptionFr}
          flush
          className={
            team.isCoach ? "lg:col-start-1 lg:row-start-3" : "lg:col-start-2 lg:row-start-2"
          }
        >
          <ul className="divide-y divide-border/60">
            {staff.map((member) => (
              <MemberRow key={member.membershipId} member={member} />
            ))}
          </ul>
        </Card>
      ) : null}

      {team.isCoach ? (
        /* One wrapper for the management column. On the phone it is the same three cards with the
           same `space-y-6` between them, so it renders exactly as the fragment did. */
        <div className="space-y-6 lg:col-start-2 lg:row-span-3 lg:row-start-2">
          <InviteManager teamId={team.id} invites={activeInvites} />
          <CompetitionManager teamId={team.id} competitions={competitions} />
          <TeamSettings
            teamId={team.id}
            name={team.name}
            crestUrl={team.crestUrl}
            primaryColor={team.primaryColor}
            secondaryColor={team.secondaryColor}
          />
        </div>
      ) : (
        <p className="text-sm text-ink-subtle lg:col-start-2 lg:row-start-3">
          {invitesReadOnlyFr()} <Badge variant="neutral">lecture seule</Badge>
        </p>
      )}
    </PageContainer>
  );
}
