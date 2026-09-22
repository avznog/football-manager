import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { logout, switchTeam } from "@/lib/auth/actions";
import { requireTeamContext, requireUser } from "@/lib/auth/dal";
import { injuryStatus, injurySummaryFr, parisDate } from "@/lib/player/injury";
import { positionsSummaryFr } from "@/lib/player/positions";
import { getPlayerProfile } from "@/lib/player/queries";
import { getUserTeams } from "@/lib/team/queries";
import { InjuryDeclareForm } from "../joueur/_components/injury-declare-form";

export const metadata = { title: "Moi" };

export default async function MePage() {
  const [{ team }, user] = await Promise.all([requireTeamContext(), requireUser()]);
  const teams = await getUserTeams(user.id);

  // A non-playing coach has no player profile at all: no positions, no injuries, nothing to show.
  const profile =
    team.isPlayer && team.membershipId
      ? await getPlayerProfile(team.id, team.membershipId)
      : null;
  const today = parisDate(new Date());
  const status = injuryStatus(profile?.injuries ?? [], today);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Avatar name={user.displayName} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-ink">
            {user.displayName}
          </h1>
          <p className="truncate text-sm text-ink-subtle">@{user.username}</p>
        </div>
      </header>

      <Card title="Mon équipe">
        <p className="text-sm text-ink">
          {team.name}{" "}
          {team.role === "coach" ? (
            <Badge variant="accent">coach</Badge>
          ) : (
            <Badge variant="neutral">joueur</Badge>
          )}
        </p>

        {/* Several teams is the rare case, so the switcher only appears when it is useful. */}
        {teams.length > 1 ? (
          <form action={switchTeam} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Changer d’équipe
              <select
                name="teamId"
                defaultValue={team.id}
                className="rounded-xl border border-border bg-surface px-3 py-2.5 text-base"
              >
                {teams.map((option) => (
                  <option key={option.teamId} value={option.teamId}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary">
              Basculer
            </Button>
          </form>
        ) : null}
      </Card>

      <Card
        title="Préférences"
        description="Le thème suit ton téléphone par défaut."
      >
        <ThemeToggle />
      </Card>

      <Card
        title="Mon profil de joueur"
        description={profile ? positionsSummaryFr(profile.positions) : undefined}
      >
        {profile ? (
          <div className="space-y-4">
            <p className={status.injured ? "text-sm text-danger" : "text-sm text-ink-muted"}>
              {injurySummaryFr(profile.injuries, today)}
            </p>

            <ButtonLink href={`/joueur/${profile.membershipId}`} variant="secondary">
              Ouvrir ma fiche
            </ButtonLink>

            {/* Closed by default: declaring an injury is the exception, not the routine. */}
            {status.injured ? (
              <p className="text-sm text-ink-muted">
                Ta guérison se déclare depuis ta fiche.
              </p>
            ) : (
              <details className="rounded-xl border border-border bg-surface-2/50 px-4 py-3">
                <summary className="min-h-11 cursor-pointer list-none py-2 text-sm font-medium text-ink">
                  Je me suis blessé
                </summary>
                <div className="pt-2">
                  <InjuryDeclareForm
                    teamId={team.id}
                    memberId={profile.membershipId}
                    today={today}
                    idPrefix="moi"
                    isSelf
                  />
                </div>
              </details>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            Tu fais partie de l’encadrement&nbsp;: pas de fiche joueur, donc pas de postes ni de
            blessures à renseigner.
          </p>
        )}
      </Card>

      <form action={logout}>
        <Button type="submit" variant="danger">
          Se déconnecter
        </Button>
      </form>
    </div>
  );
}
