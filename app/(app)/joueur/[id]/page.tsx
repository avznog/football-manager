/**
 * A player's profile: identity, preferred positions, jersey number, injuries.
 *
 * Readable by every member of the team (`team:read`), editable by the player themselves and by a
 * coach. Every decision below is taken by `can()` — the page only chooses what to render from it,
 * and the Server Actions re-check it anyway (`CLAUDE.md`, invariant 4).
 *
 * `params` is a Promise in Next 16 and `PageProps<"/joueur/[id]">` comes from `next typegen`
 * (`docs/NEXTJS16.md`). A membership id from another team, or one that does not exist, is a 404:
 * `getPlayerProfile` scopes its query by team, so nothing leaks.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { formatDateFr, injuryStatus, parisDate } from "@/lib/player/injury";
import { positionsSignature } from "@/lib/player/positions";
import { getPlayerProfile } from "@/lib/player/queries";
import { InjuriesCard } from "../_components/injuries-card";
import { JerseyForm } from "../_components/jersey-form";
import { PositionsEditor } from "../_components/positions-editor";

export async function generateMetadata({ params }: PageProps<"/joueur/[id]">) {
  const [{ team }, { id }] = await Promise.all([requireTeamContext(), params]);
  // `getPlayerProfile` is `cache()`d, so this costs nothing extra: the page reuses the result.
  const profile = await getPlayerProfile(team.id, id);
  return { title: profile ? profile.displayName : "Joueur introuvable" };
}

export default async function PlayerPage({ params }: PageProps<"/joueur/[id]">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);
  const profile = await getPlayerProfile(team.id, id);
  if (!profile) notFound();

  const isSelf = team.membershipId === profile.membershipId;
  const context = { teamId: team.id, targetMemberId: profile.membershipId };
  // Positions belong to the squad record, so a coach reaches them through `member:update`;
  // the player reaches their own through `profile:editPositions`. Both are `can()` decisions.
  const canEditPositions =
    can(actor, "profile:editPositions", context) || can(actor, "member:update", context);
  const canEditJersey = can(actor, "member:update", context);
  const canManageInjuries = can(actor, "injury:declare", context);

  const today = parisDate(new Date());
  const status = injuryStatus(profile.injuries, today);

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link
          href="/equipe"
          className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← Effectif
        </Link>
      </p>

      <header className="flex items-center gap-4">
        <Avatar name={profile.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight text-ink">
            {profile.jerseyNumber !== null ? (
              <span className="mr-2 font-mono text-lg text-ink-subtle tabular-nums">
                {profile.jerseyNumber}
              </span>
            ) : null}
            {profile.displayName}
          </h1>
          <p className="truncate text-sm text-ink-subtle">@{profile.username}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {profile.role === "coach" ? <Badge variant="accent">coach</Badge> : null}
            {profile.isPlayer ? (
              <Badge variant="neutral">joueur</Badge>
            ) : (
              <Badge variant="neutral">encadrement</Badge>
            )}
            {status.injured ? <Badge variant="danger">blessé</Badge> : null}
            {isSelf ? <Badge variant="neutral">c’est toi</Badge> : null}
          </div>
        </div>
      </header>

      {profile.isPlayer ? (
        <PositionsEditor
          // Remounted when the stored wishes change, so a save (or somebody else's) resets the
          // local selection instead of leaving a stale « non enregistré ».
          key={positionsSignature(profile.positions)}
          teamId={team.id}
          memberId={profile.membershipId}
          positions={profile.positions}
          canEdit={canEditPositions}
          isSelf={isSelf}
        />
      ) : null}

      <Card title="Fiche">
        {canEditJersey ? (
          <JerseyForm
            teamId={team.id}
            memberId={profile.membershipId}
            jerseyNumber={profile.jerseyNumber}
            isPlayer={profile.isPlayer}
          />
        ) : (
          <p className="text-sm text-ink">
            Numéro de maillot&nbsp;:{" "}
            <strong className="font-mono tabular-nums">
              {profile.jerseyNumber ?? "non attribué"}
            </strong>
            {isSelf ? (
              <span className="block text-sm text-ink-muted">
                Les numéros sont attribués par le coach&nbsp;: demande-lui si tu veux changer.
              </span>
            ) : null}
          </p>
        )}

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3 sm:justify-start sm:gap-2">
            <dt className="text-ink-muted">Rôle</dt>
            <dd className="text-ink">{profile.role === "coach" ? "Coach" : "Joueur"}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:justify-start sm:gap-2">
            <dt className="text-ink-muted">Dans l’équipe depuis</dt>
            <dd className="text-ink">{formatDateFr(profile.joinedOn)}</dd>
          </div>
        </dl>
      </Card>

      {profile.isPlayer ? (
        <InjuriesCard
          teamId={team.id}
          memberId={profile.membershipId}
          injuries={profile.injuries}
          today={today}
          canManage={canManageInjuries}
          isSelf={isSelf}
        />
      ) : (
        <Card title="Fiche joueur">
          <p className="text-sm text-ink-muted">
            Ce membre fait partie de l’encadrement&nbsp;: pas de postes ni de blessures à suivre.
          </p>
        </Card>
      )}

      {profile.isPlayer ? (
        <Card title="Statistiques personnelles">
          <p className="text-sm text-ink-muted">
            Buts, passes décisives, minutes jouées et notes arrivent au jalon M5.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
