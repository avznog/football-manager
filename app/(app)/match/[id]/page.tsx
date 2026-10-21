/**
 * A match: when, where, what can be done with it, and — once it is over — everything that happened
 * in it.
 *
 * ## One page, not two (decision 189)
 *
 * There used to be a second screen, `/match/[id]/recap`, and the owner's fourth backlog is blunt
 * about it: « once a game is over, there are two different pages. There should not. » He is right, and
 * the split had become arbitrary rather than wrong-headed: the old reasoning was that this page is the
 * *organising* page and that one the *reading* page, with a different mood and a different set of
 * people coming to it. After a season nobody arrives at a finished match to organise anything. So
 * `/match/[id]` carries both halves and `/recap` redirects here.
 *
 * **The order is the whole design of this page**, because the merged version is long on a phone. Two
 * sequences, and which one you get is `finished`:
 *
 * - **before and during**, in the order of the afternoon (decision 174): « Mode match », the
 *   composition, « Terminer le match ». That is what the page is opened for on a Sunday;
 * - **after**, in the order a reader wants it (the owner's own list): the **result**, then the
 *   **notes**, then the **temps de jeu**, then the **Déroulé**, then the **compositions** the match
 *   went through, then the coach's planning card, then the **corrections**, then game mode as
 *   consultation, and the deletion last of all.
 *
 * Nothing on it is stored. The score, the scorers, the minutes, the Déroulé and the blocks are all
 * derived by `reduceMatch` over the append-only log (invariant 2), and the man of the match from the
 * notes (decision 007).
 *
 * ## What is role-dependent, and what is not
 *
 * The composition card, the corrections card and the deletion card are the coach's (`docs/PLAN.md`,
 * screen 3). The result, the notes panel, the temps de jeu, the Déroulé and the blocks are everybody's
 * — the notes panel shows a player one mean per teammate and the coach every individual note
 * (decisions 137 and 190), and that split is enforced in the query, never here.
 *
 * `params` is a Promise in Next 16 and `PageProps<"/match/[id]">` comes from `next typegen`
 * (`docs/NEXTJS16.md`). A match id from another team is a 404: every query is scoped by team, so
 * nothing leaks.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import {
  entryModeBadgeFr,
  MATCH_STATUS_LABELS,
  periodsLabel,
  scoreLineFr,
  venueSideLabel,
} from "@/lib/calendar/labels";
import { capitalizeFirst, formatDay, formatTime } from "@/lib/calendar/time";
import { reopenMatch } from "@/lib/match/actions";
import { getMatch, getMatchScore, hasMatchEvents } from "@/lib/match/queries";
import { MIN_NOTES_FOR_MEAN } from "@/lib/rating/aggregate";
import { ratingInvitationFr } from "@/lib/rating/labels";
import { getMatchRecap, getRatingResults } from "@/lib/rating/queries";
import { getCompositionMembers } from "@/lib/composition/queries";
import {
  addableSupporters,
  namedSupporters,
  toSupporterCandidates,
} from "@/lib/composition/supporters";
import { CompositionsStrip } from "./_components/compositions-strip";
import { FinishMatchCard } from "./_components/finish-match-card";
import { ManOfTheMatchCard } from "./_components/man-of-the-match";
import { MinutesTable } from "./_components/minutes-table";
import { RatingsPanel } from "./_components/ratings-panel";
import { Scoreboard } from "./_components/scoreboard";
import { SupportersCard } from "./_components/supporters-card";
import { TimelineList } from "./_components/timeline-list";
import { CompositionCard } from "./composition/_components/composition-card";

export async function generateMetadata({ params }: PageProps<"/match/[id]">) {
  const [{ team }, { id }] = await Promise.all([requireTeamContext(), params]);
  const match = await getMatch(team.id, id);
  return { title: match ? `Match · ${match.opponentName}` : "Match introuvable" };
}

export default async function MatchPage({ params }: PageProps<"/match/[id]">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);

  const match = await getMatch(team.id, id);
  if (!match) notFound();

  const finished = match.status === "finished";

  const [score, logged] = await Promise.all([
    /*
     * The header's live scoreline. A scheduled match has nothing in its log yet, so do not even ask;
     * a finished one is described by the `Scoreboard` below, which says the same figures and five
     * more things, so asking twice would print the score twice.
     */
    match.status === "live" ? getMatchScore(match.id) : Promise.resolve(null),
    /*
     * Asked for every status, unlike the score: it is what the two cards about *declaring* a match
     * over are gated on, and one of them appears on a scheduled match. It is also the stricter
     * question — `score === null` ignores voided events, so a match whose every action was
     * corrected away reads as empty there and as logged here. Declaring is the case that must not
     * get it wrong, because it is what decides whether the déroulé can still be contradicted.
     */
    hasMatchEvents(match.id),
  ]);

  /*
   * The reading half, for a finished match only — and the only reason this page is not two pages.
   *
   * Both of these reduce the match, which is two replays of one log per render. That is what the two
   * screens did between them before they were merged, and threading one `MatchState` through
   * `getRatingResults` would mean its three other callers carrying a value they have no use for; the
   * note stays here so the next session knows the duplication is seen rather than missed.
   *
   * `getRatingResults` also answers « does this reader owe notes », which is why `getNotationView` is
   * no longer called here: it was a third replay of the same log for a `progress` this one already
   * carries.
   */
  const [view, results] = finished
    ? await Promise.all([
        getMatchRecap({ teamId: team.id, matchId: match.id }),
        getRatingResults({
          teamId: team.id,
          matchId: match.id,
          membershipId: team.membershipId,
          /*
           * Invariant 4: every one of these is an answer from `can()` and none of them is a role read
           * here. The three are genuinely three: `rating:submit` is self-scoped and true for every
           * member, the non-playing coach included (decision 139), while `rating:readNotes` and
           * `rating:publish` are the coach's alone. Whether *this match's sheet* names him is decision
           * 159's data half, and `getRatingResults` applies it: a member who was not selected comes
           * back with an empty set.
           */
          canSubmit: can(actor, "rating:submit", { teamId: team.id }),
          canSeeNotes: can(actor, "rating:readNotes", { teamId: team.id }),
          canPublish: can(actor, "rating:publish", { teamId: team.id }),
        }),
      ])
    : [null, null];

  const recap = view?.recap ?? null;

  const kickoff = new Date(match.kickoffAt);
  const now = new Date();
  /**
   * « Not one action was ever recorded », which is what the « Saisir le match » card is about.
   *
   * `recap.recorded` for a finished match — the recap's own test, and the one the Déroulé and the
   * temps de jeu are drawn from — and the log for anything earlier. Two spellings of one idea, and
   * they differ on a match whose every event was voided: there the recap still has a timeline to
   * show, so « ce match a été joué sans le téléphone » would be untrue.
   */
  const recorded = finished ? (recap?.recorded ?? false) : logged;
  // The log of this match was reconstructed from memory rather than watched: decision 013 put the
  // column in the database for this sentence, and nothing had ever printed it.
  const entryBadge = entryModeBadgeFr(match.entryMode, { recorded });

  const isCoach = can(actor, "match:update", { teamId: team.id });
  // Typing a match up, or rewriting it days later, is the coach's — not the match operator's
  // (decision 004). Invariant 4: the permission is `can()`'s answer.
  const mayAmend = can(actor, "match:amend", { teamId: team.id });
  const mayDelete = can(actor, "match:delete", { teamId: team.id });
  // Naming a supporter is writing the match sheet, so it is the same permission as selecting the
  // squad before kick-off — not `match:amend`, which is about the log (decision 211).
  const maySelectSquad = can(actor, "match:selectSquad", { teamId: team.id });

  /**
   * The supporters card's two lists, for a finished match the coach is looking at.
   *
   * The played set comes from the recap this page has already reduced rather than from a third replay
   * of the log, and `toSupporterCandidates` is shared with the action so the screen cannot offer a
   * name the action refuses (`lib/composition/supporters.ts`).
   */
  const supporterBoard =
    finished && maySelectSquad && recap !== null
      ? await (async () => {
          const members = await getCompositionMembers(team.id, match.id);
          const candidates = toSupporterCandidates(
            members,
            recap.players.filter((player) => player.playedMatch).map((player) => player.memberId),
          );
          return {
            supporters: namedSupporters(candidates),
            addable: addableSupporters(candidates),
          };
        })()
      : null;

  /**
   * Whether the « Terminer le match » card is offered.
   *
   * `!logged` is the line decision 121 draws: a match with a déroulé is `live` or `finished`
   * already, and a `live` one has a correct way to end — game mode's own final whistle, which
   * derives the minute from the reducer instead of inventing one out here.
   */
  const mayFinish = mayAmend && !finished && !logged;
  /** The kick-off has come round. Only the card's extra sentence depends on it now (decision 174). */
  const played = kickoff.getTime() <= now.getTime();

  /**
   * He has notes left to give. The whole question, now that nothing closes the notation (decision
   * 139) and that the means being out does not stop him — so the publication state has dropped out of
   * this expression entirely.
   *
   * `requiredCount > 0` carries more weight than it looks: an empty set is *vacuously* complete, so
   * without it a match nobody played would congratulate every reader on having noted everybody. It is
   * also where decision 159 lands — a member the sheet does not name gets an empty set — and where
   * `rating:submit` lands, so neither needs a clause of its own here.
   */
  const mayRate = results !== null && results.progress.requiredCount > 0;
  const ratingDuty = mayRate ? results.progress : null;

  /*
   * Open to every member, not just the operator: following the score from the touchline is
   * legitimate, and game mode itself decides who may record an action (`can()`).
   *
   * Not offered at all for a match that is over with nothing recorded. « Le déroulé reste
   * consultable » is untrue there: opening it shows « Rien pour l’instant », and a full-width primary
   * button is a poor way to say that nothing happened. The « Saisir le match » card is the real next
   * action, and decision 013's whole point is that the app does not pretend to hold a record of an
   * afternoon nobody recorded.
   *
   * Where it goes depends on whether the match is over (decision 174): first while it is still to be
   * played or being played, because that is what the page is opened for on a Sunday; last once it is
   * finished, where the déroulé is consultation and everything above it is the reason to be here.
   */
  const gameModeCard =
    finished && !recorded ? null : (
      <Card title="Mode match" as="h2">
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            {finished
              ? "Le match est terminé : le déroulé reste consultable."
              : "Chronomètre, buts, remplacements et minutes jouées, en direct."}
          </p>
          <ButtonLink href={`/match/${match.id}/jeu`} fullWidth>
            {match.status === "live"
              ? "Reprendre le mode match"
              : finished
                ? "Voir le déroulé"
                : "Ouvrir le mode match"}
          </ButtonLink>
        </div>
      </Card>
    );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/calendrier"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← Calendrier
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{match.competitionLabel}</Badge>
          <Badge variant={match.isHome ? "neutral" : "warning"}>
            {capitalizeFirst(venueSideLabel(match.isHome))}
          </Badge>
          {match.status === "live" ? (
            <Badge variant="danger" solid>
              {MATCH_STATUS_LABELS.live}
            </Badge>
          ) : null}
          {entryBadge !== null ? <Badge variant="neutral">{entryBadge}</Badge> : null}
        </div>

        <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink">
          {match.opponentName}
        </h1>

        <p className="text-sm text-ink-muted">
          {capitalizeFirst(formatDay(kickoff))} à {formatTime(kickoff)}
          {match.venue ? ` · ${match.venue}` : ""}
          {` · ${periodsLabel(match.periodsCount, match.periodMinutes)}`}
        </p>

        {/* A live match states its score here and nowhere else — the `Scoreboard` is for a result,
            and « Victoire » is not a thing anybody knows in the 20th minute. The « En cours » badge
            above already says what state the match is in. */}
        {score ? (
          <p className="flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold text-ink tabular-nums">
              {scoreLineFr(score.goalsFor, score.goalsAgainst)}
            </span>
          </p>
        ) : null}

        {isCoach ? (
          <div className="pt-1">
            <ButtonLink href={`/match/${match.id}/modifier`} variant="secondary" size="sm">
              Modifier
            </ButtonLink>
          </div>
        ) : null}
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Before the final whistle: the order of the afternoon (174)       */}
      {/* ---------------------------------------------------------------- */}

      {finished ? null : gameModeCard}

      {/* The match sheet and the compositions are the coach's job (`docs/PLAN.md`, screen 3): a
          player does not see them here. Before the match it is the second thing he wants; after it,
          it is a record and waits until under the blocks. */}
      {!finished && isCoach ? <CompositionCard team={team} match={match} /> : null}

      {/* Under the composition whether or not the kick-off has come round (decision 174, which moved
          it from the top of the page for a match already played): declaring a match over is the last
          thing done with it, and it must not push game mode and the composition down the screen. */}
      {mayFinish ? (
        <FinishMatchCard teamId={team.id} matchId={match.id} beforeKickoff={!played} />
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* After it: the result, the notes, the minutes, the Déroulé        */}
      {/* ---------------------------------------------------------------- */}

      {finished && recap !== null ? (
        <>
          {/* 1. The result. The one place the app celebrates. */}
          <Scoreboard recap={recap} opponentName={match.opponentName} status={match.status} />

          {/* 2. The notes — and first the duty, because a reader who still owes some is the reader
                 this screen was reached for. It promises nothing in return: « tu verras les notes de
                 tout le monde dès que tu auras fini » was decision 021's trade, and under 137 his own
                 notes unlock nothing for him. Under 139 it does not threaten anything either — the
                 card appears whether or not the means are out, because his notes still count once
                 they are. */}
          {ratingDuty && !ratingDuty.complete ? (
            <Card title="À toi de noter" as="h2" className="border-accent/40 bg-accent/10">
              <div className="space-y-3">
                {/* « qui était sur le terrain », not « avec toi »: the reader may not have been on it
                    — a supporter on the sheet rates too (decisions 139 and 159). */}
                <p className="text-sm text-ink-muted">
                  {ratingDuty.partial
                    ? `Il te reste ${ratingDuty.missingIds.length} note${ratingDuty.missingIds.length > 1 ? "s" : ""} à donner.`
                    : "Une note pour chaque joueur qui était sur le terrain. L’équipe lira une moyenne par joueur, jamais ta note à toi."}
                </p>
                {/* No deadline to state (decision 079 applied to the absence of one): who decides,
                    and whether the figures he is about to move are already out. */}
                <p className="text-sm font-medium text-ink">
                  {ratingInvitationFr(results?.published ?? false)}
                </p>
                <ButtonLink href={`/match/${match.id}/notation`} fullWidth>
                  {ratingDuty.submittedCount > 0 ? "Finir mes notes" : "Noter les joueurs"}
                </ButtonLink>
              </div>
            </Card>
          ) : null}

          {/* He has sent everything he owes. The second sentence is in the person of whoever is
              reading it: « quand le coach les sortira » said *to the coach* is the screen talking
              about him in the third person about a button he is looking at. `canSeeNotes` is the
              coach marker on this payload (decision 137). */}
          {ratingDuty?.complete ? (
            <Card title="Tes notes" as="h2">
              <p className="text-sm text-ink-muted">
                {results?.published
                  ? "Tu as noté tout le monde, et les moyennes de ce match sont sorties."
                  : results?.canSeeNotes
                    ? "Tu as noté tout le monde. Les moyennes ne sont pas encore sorties pour l’équipe : c’est toi qui décides quand."
                    : "Tu as noté tout le monde : les moyennes sortiront quand le coach les sortira."}
              </p>
            </Card>
          ) : null}

          {results?.readable ? (
            <ManOfTheMatchCard
              manOfTheMatch={results.manOfTheMatch}
              minRatings={MIN_NOTES_FOR_MEAN}
              published={results.published}
            />
          ) : null}

          {results ? (
            <RatingsPanel
              results={results}
              teamId={team.id}
              matchId={match.id}
              mayRate={mayRate}
            />
          ) : null}

          {/* 3. Les supporters, et c'est le seul écrit que la feuille accepte après le coup de
                 sifflet final (décision 211). Juste sous les notes, parce que c'est à ça qu'il sert :
                 c'est la feuille qui donne le droit de noter (décision 159), et quelqu'un qui est
                 venu regarder ne pouvait pas y être inscrit après coup. */}
          {maySelectSquad && supporterBoard !== null ? (
            <SupportersCard
              teamId={team.id}
              matchId={match.id}
              supporters={supporterBoard.supporters}
              addable={supporterBoard.addable}
            />
          ) : null}

          {/* 4. Le temps de jeu. With an empty log every man on the sheet would be listed « non
                 entré » at 0’, which is not « il n'est pas entré » but « on ne sait pas » — the
                 scoreboard has already said so, and the Déroulé below says it again. Nine false lines
                 would be the third telling, and a wrong one. */}
          {recorded ? <MinutesTable players={recap.players} entryMode={match.entryMode} /> : null}

          {/* 5. Le déroulé. */}
          <TimelineList entries={recap.timeline} />

          {/* 6. Les compositions: the Déroulé above says what changed, and this says what the pitch
                 looked like after each change (decision 182). Both roles read it — there is no branch
                 here, and that is deliberate: a composition is not privileged. */}
          <CompositionsStrip
            compositions={recap.compositions}
            kit={{ primaryColor: team.primaryColor, secondaryColor: team.secondaryColor }}
          />

          {/* 7. The coach's own composition card, which after the match is the record of what he
                 planned — including the plans the afternoon never used. Under the blocks, which are
                 what actually happened. */}
          {isCoach ? <CompositionCard team={team} match={match} /> : null}
        </>
      ) : null}

      {/* 8. « Saisie rétroactive » (`docs/PLAN.md`, screen 8). A match played without the phone is
             typed up here and becomes an ordinary event log; a match that already has one is
             corrected action by action. */}
      {mayAmend && finished ? (
        <Card title={recorded ? "Corriger le match" : "Saisir le match"} as="h2">
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              {recorded
                ? "Un but attribué au mauvais joueur, une action oubliée : la correction s’ajoute au déroulé, elle ne le réécrit pas."
                : "Ce match a été joué sans le téléphone. Renseigne qui a joué et les buts : le score, les minutes et les clean sheets se déduisent."}
            </p>
            <ButtonLink
              href={`/match/${match.id}/saisie`}
              variant={recorded ? "secondary" : "primary"}
              fullWidth
            >
              {recorded ? "Corriger une action" : "Saisir le match"}
            </ButtonLink>
            {/* The undo for « Marquer comme terminé », and the reason that button needs no dialog.
                Only while the log is empty: once there is a déroulé, going back to `scheduled` would
                mean voiding events to stay coherent, which is a different feature (decision 121). */}
            {!logged ? (
              <form action={reopenMatch}>
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="matchId" value={match.id} />
                <Button type="submit" variant="ghost" fullWidth>
                  Terminé par erreur ? Rouvrir le match
                </Button>
              </form>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* 9. A finished match keeps game mode here: the déroulé is consultation now. */}
      {finished ? gameModeCard : null}

      {/* 10. And the deletion last, under everything it would destroy (decision 191). A link rather
             than a button: what it opens is a confirmation that names the déroulé, the notes, the
             sheet and the compositions, one tap from the act itself. */}
      {mayDelete ? (
        <Card title="Supprimer le match" as="h2">
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Le match et tout ce qui y est rattaché disparaissent. L’écran suivant dit exactement
              quoi.
            </p>
            <ButtonLink href={`/match/${match.id}/supprimer`} variant="secondary" fullWidth>
              Supprimer ce match…
            </ButtonLink>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
