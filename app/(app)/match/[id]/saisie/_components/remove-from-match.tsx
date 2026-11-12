"use client";

/**
 * « Sur la feuille de match » — and « Retirer du match » next to each person (decision 226).
 *
 * The owner: « Lucien has been on the pitch from 0′ but never showed up, so I remove him from the
 * match, as he should not even be a supporter. » So the card lists everybody the match names — on the
 * sheet in any role, or seen on the pitch — and removing one asks the one question that matters when
 * he played: who really was in his place. The answer is picked from the sheet, from « Pas sur la
 * feuille de match » (the same group « Ajouter un changement » offers), or « Personne, on a joué à 6 ».
 *
 * Then a confirmation that says, line by line, what will happen — computed by `planRemoval`, the same
 * function the server runs, so the sentence and the write cannot disagree. A refusal (an action that
 * names him, a replacement already on the pitch) is said in the same place, before anything is posted.
 *
 * His notes are not touched and the sheet says so: they stop counting while he is off the match and
 * come back if he is added again.
 */

import { startTransition, useMemo, useState } from "react";

import { OptionRow } from "@/components/action-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { actualPeriodStarts, periodsConfig } from "@/lib/match/clock";
import { reduceLive } from "@/lib/match/presenter";
import { NOBODY, planRemoval } from "@/lib/retro/remove";
import { OFF_SHEET_HEADING_FR } from "@/lib/retro/sheet";
import type { RetroView } from "@/lib/retro/queries";

const ROLE_FR: Record<string, string> = {
  starter: "titulaire",
  substitute: "remplaçant",
  supporter: "supporter",
};

type Step =
  | { step: "closed" }
  | { step: "who"; memberId: string }
  | { step: "confirm"; memberId: string; replacementId: string | null };

export function RemoveFromMatch({
  teamId,
  view,
  pending,
  error,
  action,
}: {
  teamId: string;
  view: RetroView;
  pending: boolean;
  /** The last refusal, when it came from this card. */
  error: string | null;
  action: (payload: FormData) => void;
}) {
  const live = view.live;
  const [flow, setFlow] = useState<Step>({ step: "closed" });
  const state = useMemo(() => reduceLive(live, [], null), [live]);
  const periods = useMemo(() => periodsConfig(view.match), [view.match]);
  const periodStarts = useMemo(() => actualPeriodStarts(state.playIntervals), [state.playIntervals]);

  const minutesOf = useMemo(
    () => new Map(state.players.map((player) => [player.memberId, player.minutes])),
    [state.players],
  );
  const playedIds = useMemo(
    () => new Set(state.players.filter((player) => player.playedMatch).map((player) => player.memberId)),
    [state.players],
  );

  /** Everybody the match names: on the sheet in any role, or seen on the pitch. */
  const onTheMatch = useMemo(
    () =>
      live.players
        .filter((player) => player.squadRole !== null || playedIds.has(player.memberId))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "fr")),
    [live.players, playedIds],
  );

  const nameOf = (memberId: string) =>
    live.players.find((player) => player.memberId === memberId)?.displayName ?? "Ce joueur";

  /** Who may have played in his place: the sheet first, then the rest of the squad, apart. */
  const replacements = useMemo(() => {
    if (flow.step === "closed") return { sheet: [], off: [] };
    const others = live.players.filter(
      (player) => player.isPlayer && !player.hasLeft && player.memberId !== flow.memberId,
    );
    const onSheet = (player: (typeof others)[number]) =>
      player.squadRole === "starter" || player.squadRole === "substitute" || playedIds.has(player.memberId);
    const sort = (a: { displayName: string }, b: { displayName: string }) =>
      a.displayName.localeCompare(b.displayName, "fr");
    return {
      sheet: others.filter(onSheet).sort(sort),
      off: live.hasSquadSheet ? others.filter((player) => !onSheet(player)).sort(sort) : [],
    };
  }, [flow, live.players, live.hasSquadSheet, playedIds]);

  const plan = useMemo(() => {
    if (flow.step !== "confirm") return null;
    return planRemoval({
      live,
      state,
      periods,
      periodStarts,
      memberId: flow.memberId,
      replacementId: flow.replacementId,
      // Only the server's ids are written; these are the preview's own.
      submissionId: "00000000-0000-4000-8000-000000000000",
      kickoffAtMs: 0,
    });
  }, [flow, live, state, periods, periodStarts]);

  const close = () => setFlow({ step: "closed" });

  function start(memberId: string) {
    // Somebody who never set foot on the pitch has no place to fill: straight to the confirmation.
    setFlow(
      playedIds.has(memberId)
        ? { step: "who", memberId }
        : { step: "confirm", memberId, replacementId: null },
    );
  }

  function submit() {
    if (flow.step !== "confirm") return;
    const form = new FormData();
    form.set("teamId", teamId);
    form.set("matchId", view.match.id);
    form.set("intent", "remove");
    form.set("memberId", flow.memberId);
    form.set("replacement", flow.replacementId ?? NOBODY);
    close();
    startTransition(() => action(form));
  }

  const subtitleOf = (memberId: string, role: string | null) => {
    const bits: string[] = [];
    if (role) bits.push(ROLE_FR[role] ?? role);
    else bits.push("hors feuille");
    const minutes = minutesOf.get(memberId) ?? 0;
    if (minutes > 0) bits.push(`${minutes}’ jouées`);
    return bits.join(" · ");
  };

  return (
    <>
      <Card title="Sur la feuille de match" as="h2" flush>
        <p className="px-4 pb-2 text-sm text-ink-muted">
          Quelqu’un est noté sur ce match sans y avoir été&nbsp;? Retire-le&nbsp;: tu diras qui a
          joué à sa place.
        </p>
        {error ? <p className="px-4 pb-2 text-sm font-semibold text-danger">{error}</p> : null}
        <ul className="divide-y divide-border/60 border-t border-border/60">
          {onTheMatch.map((player) => (
            <li key={player.memberId} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{player.displayName}</p>
                <p className="text-xs text-ink-muted">
                  {subtitleOf(player.memberId, player.squadRole)}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => start(player.memberId)}
              >
                Retirer du match
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      {flow.step === "who" ? (
        <Sheet
          open
          onClose={close}
          title={`Qui a joué à la place de ${nameOf(flow.memberId)} ?`}
          description="Il prend sa place à chaque fois qu’il était sur le terrain."
        >
          <div className="space-y-4">
            <ul className="space-y-2">
              {replacements.sheet.map((player) => (
                <li key={player.memberId}>
                  <OptionRow
                    label={player.displayName}
                    subtitle={subtitleOf(player.memberId, player.squadRole)}
                    leading={player.jerseyNumber ?? undefined}
                    onClick={() =>
                      setFlow({ step: "confirm", memberId: flow.memberId, replacementId: player.memberId })
                    }
                  />
                </li>
              ))}
            </ul>

            {replacements.off.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                  {OFF_SHEET_HEADING_FR}
                </h3>
                <ul className="space-y-2">
                  {replacements.off.map((player) => (
                    <li key={player.memberId}>
                      <OptionRow
                        label={player.displayName}
                        subtitle={player.squadRole === "supporter" ? "supporter" : "hors feuille"}
                        leading={player.jerseyNumber ?? undefined}
                        onClick={() =>
                          setFlow({
                            step: "confirm",
                            memberId: flow.memberId,
                            replacementId: player.memberId,
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <OptionRow
              label="Personne, on a joué à 6"
              subtitle="Son poste reste vide"
              onClick={() => setFlow({ step: "confirm", memberId: flow.memberId, replacementId: null })}
            />
          </div>
        </Sheet>
      ) : null}

      {flow.step === "confirm" && plan ? (
        <Sheet
          open
          onClose={close}
          title={`Retirer ${nameOf(flow.memberId)} du match`}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" fullWidth onClick={close}>
                Annuler
              </Button>
              <Button fullWidth disabled={!plan.ok || pending} onClick={submit}>
                Retirer
              </Button>
            </div>
          }
        >
          {plan.ok ? (
            <div className="space-y-3">
              <ul className="space-y-1 text-sm text-ink">
                {plan.linesFr.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="text-sm text-ink-muted">
                Ses notes, données ou reçues, sont gardées mais ne comptent plus tant qu’il n’est pas
                sur le match. Elles reviennent si tu l’y ajoutes de nouveau.
              </p>
            </div>
          ) : (
            <p role="alert" className="text-sm font-semibold text-danger">
              {plan.problemFr}
            </p>
          )}
        </Sheet>
      ) : null}
    </>
  );
}
