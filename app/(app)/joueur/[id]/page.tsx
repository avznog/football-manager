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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { formatDateFr, injuryStatus, parisDate } from "@/lib/player/injury";
import { noPlayerSheetTitleFr, removeMemberCardFr } from "@/lib/player/labels";
import { positionsSignature } from "@/lib/player/positions";
import { getPlayerProfile } from "@/lib/player/queries";
import { shirtNameValueFr } from "@/lib/player/shirt";
import { removeMember, setMemberRole } from "@/lib/team/actions";
import { InjuriesCard } from "../_components/injuries-card";
import { JerseyForm } from "../_components/jersey-form";
import { ShirtNameForm } from "../_components/shirt-name-form";
import { PositionsEditor } from "../_components/positions-editor";
import { PlayerStatsCard } from "../_components/stats-card";

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
  // A player's wishes are the player's: `profile:editPositions` is self-only and has no coach
  // fallback, so a coach sees the card read-only and the editor says why.
  const canEditPositions = can(actor, "profile:editPositions", context);
  const canEditJersey = can(actor, "member:update", context);
  // The flocage is not the number: « MOMO » agrees with nothing and nobody, so the player owns his
  // own, and the coach may still type one for a teammate — unlike the positions above, which are
  // nobody else's to choose.
  const canEditShirtName =
    can(actor, "profile:editShirtName", context) || can(actor, "member:update", context);
  const canManageInjuries = can(actor, "injury:declare", context);
  // The two squad-administration controls. They used to sit on every row of `/equipe`, where
  // « Nommer coach » + « Retirer » took 200 px of a 390 px row and pushed the names to « Tho… ».
  // They belong to one member, so they live on that member's page and the list is left to reading.
  const canAppointCoach = can(actor, "team:appointCoach", context);
  const canRemove = can(actor, "member:remove", context);

  const today = parisDate(new Date());
  const status = injuryStatus(profile.injuries, today);
  // The card below used to be one string promising « le joueur » would lose his availabilities and
  // his convocations — neither of which a member of the encadrement has ever had, and the demo team
  // has such a member. What the removal actually takes away is now derived (decision NNN).
  const removal = removeMemberCardFr(profile.displayName, profile.isPlayer);

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
        />
      ) : null}

      <Card title="Fiche">
        {/* The maillot, as two fields and two permissions: the coach hands out the number, which has
            to be unique in the squad, and the flocage belongs to the man whose back it is printed on
            (decision 104). Hence two forms rather than one — whoever may change only one of them
            sees the other as a sentence. */}
        <div className="space-y-4">
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

          {canEditShirtName ? (
            <ShirtNameForm
              teamId={team.id}
              memberId={profile.membershipId}
              shirtName={profile.shirtName}
              isPlayer={profile.isPlayer}
              isSelf={isSelf}
            />
          ) : (
            /* « aucun », never a dash: most members have no flocage and that is not a gap in the
               data. The value is uppercased for display only — `shirtNameValueFr`. */
            <p className="text-sm text-ink">
              Nom sur le maillot&nbsp;:{" "}
              <strong className="font-mono">{shirtNameValueFr(profile.shirtName)}</strong>
            </p>
          )}
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 sm:justify-start sm:gap-2">
            <dt className="text-ink-muted">Rôle</dt>
            <dd className="flex items-center gap-2 text-ink">
              {/* Not simply « Coach » or « Joueur »: demoting a member of the encadrement would
                  otherwise label them « Joueur » next to their own « encadrement » badge. */}
              {profile.role === "coach" ? "Coach" : profile.isPlayer ? "Joueur" : "Encadrement"}
              {canAppointCoach && !profile.isLastCoach ? (
                /* A plain form, like the rest of this page: it works with no JavaScript, and there
                   is no client state to hold — the button's own label is the whole question. */
                <form action={setMemberRole}>
                  <input type="hidden" name="teamId" value={team.id} />
                  <input type="hidden" name="memberId" value={profile.membershipId} />
                  <input
                    type="hidden"
                    name="role"
                    value={profile.role === "coach" ? "player" : "coach"}
                  />
                  <Button type="submit" variant="ghost" size="sm">
                    {profile.role === "coach" ? "Retirer coach" : "Nommer coach"}
                  </Button>
                </form>
              ) : null}
            </dd>
          </div>
          <div className="flex justify-between gap-3 sm:justify-start sm:gap-2">
            <dt className="text-ink-muted">Dans l’équipe depuis</dt>
            <dd className="text-ink">{formatDateFr(profile.joinedOn)}</dd>
          </div>
        </dl>

        {canAppointCoach && profile.isLastCoach ? (
          <p className="mt-2 text-xs text-ink-subtle">
            Seul coach de l’équipe&nbsp;: nomme quelqu’un d’autre avant de changer son rôle ou de le
            retirer de l’effectif.
          </p>
        ) : null}
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
        /* Not « Fiche joueur »: the one sentence under that heading says this member is not one. */
        <Card title={noPlayerSheetTitleFr()}>
          <p className="text-sm text-ink-muted">
            Ce membre fait partie de l’encadrement&nbsp;: pas de postes ni de blessures à suivre.
          </p>
        </Card>
      )}

      {profile.isPlayer ? (
        <PlayerStatsCard teamId={team.id} memberId={profile.membershipId} isSelf={isSelf} />
      ) : null}

      {canRemove && !isSelf && !profile.isLastCoach ? (
        <Card title={removal.titleFr} description={removal.descriptionFr}>
          {/* A plain form, as with « Supprimer ce match »: no confirmation dialog to get wrong, and
              it works without JavaScript. `removeMember` sets `left_at` and sends the coach back to
              the squad list — this page would be a 404 on the next render. */}
          <form action={removeMember}>
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="memberId" value={profile.membershipId} />
            <Button type="submit" variant="danger" fullWidth aria-label={removal.buttonFr}>
              {removal.buttonFr}
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
