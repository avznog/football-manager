import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { logout, switchTeam } from "@/lib/auth/actions";
import { requireTeamContext, requireUser } from "@/lib/auth/dal";
import { getUserTeams } from "@/lib/team/queries";

export const metadata = { title: "Moi" };

export default async function MePage() {
  const [{ team }, user] = await Promise.all([requireTeamContext(), requireUser()]);
  const teams = await getUserTeams(user.id);

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

      <Card title="Mon profil de joueur">
        <p className="text-sm text-ink-muted">
          Postes préférés et blessures arrivent au jalon M1.
        </p>
      </Card>

      <form action={logout}>
        <Button type="submit" variant="danger">
          Se déconnecter
        </Button>
      </form>
    </div>
  );
}
