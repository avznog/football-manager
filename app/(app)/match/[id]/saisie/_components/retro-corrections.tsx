"use client";

/**
 * Correcting a match that is over. « Le but de la 27ᵉ, ce n'était pas Karim, c'était Momo. »
 *
 * The match already has a log, so there is nothing to enter — only the timeline, newest first, with
 * two things a coach can do to a line: correct it, or annul it. Both **append** (invariant 1). The
 * corrected event carries the annulled one's minute unless the coach says otherwise, and the wrong
 * line stays visible, struck through, exactly as a paper scoresheet is corrected (decision 003).
 *
 * Only the football facts, the substitutions and the changes are amendable — a change, since decision
 * 169, is also something a coach can **add** (`AddChange`), at a minute, against the pitch as it stood. Kick-offs, period ends and the final
 * whistle are the frame of the match: annulling one would leave every minute in the log meaning
 * something else, and changing the length of a match is what « Modifier » on the match page is for.
 * The copy says so rather than leaving the coach hunting for a button that is not there.
 *
 * One `<form>` per open sheet, native `<select>`s, no optimistic rendering: the page revalidates and
 * `match_player_stats` is re-frozen server-side, so what comes back is what the season table says.
 */

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/components/ui/cn";
import { EVENT_LABELS_FR } from "@/lib/match/events";
import { regulationMinutes } from "@/lib/match/clock";
import { submitAmendment } from "@/lib/retro/actions";
import {
  RETRO_FACT_TYPES,
  retroFactNeedsMember,
  retroFactTakesAssist,
  retroFactTakesMember,
  type RetroFactType,
} from "@/lib/retro/log";
import type { RetroTimelineLine, RetroView } from "@/lib/retro/queries";

import { AddChange } from "./add-change";

export type RetroCorrectionsProps = {
  teamId: string;
  view: RetroView;
};

const ROLE_LABELS_FR: Record<string, string> = {
  scorer: "but",
  assist: "passe",
  "own-goal": "csc",
  penalty: "penalty",
  in: "entre",
  out: "sort",
  moved: "poste",
  foul: "faute",
  injured: "blessé",
};

export function RetroCorrections({ teamId, view }: RetroCorrectionsProps) {
  const [state, action, pending] = useActionState(submitAmendment, undefined);
  const [openLine, setOpenLine] = useState<RetroTimelineLine | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingChange, setAddingChange] = useState(false);
  /**
   * Which card the last submission came from, so its refusal is printed **there**. A change refused
   * at the bottom of the page with its sentence at the top is a refusal the coach never reads: the
   * sheets close on submit and leave him looking at the card he started from.
   */
  const [lastFrom, setLastFrom] = useState<"line" | "change">("line");
  const dispatch = (from: "line" | "change") => (payload: FormData) => {
    setLastFrom(from);
    action(payload);
  };

  const nameOf = (memberId: string) =>
    view.players.find((player) => player.memberId === memberId)?.displayName ?? "Joueur retiré";

  const regulation = regulationMinutes({
    periodsCount: view.match.periodsCount,
    periodMinutes: view.match.periodMinutes,
  });

  return (
    <div className="space-y-4">
      {state?.error && lastFrom === "line" ? (
        <FieldError className="px-1">{state.error}</FieldError>
      ) : null}

      <Card>
        <p className="text-sm text-ink-muted">
          Une correction ne réécrit rien&nbsp;: l’action fautive est annulée et la bonne est ajoutée.
          Les deux restent dans le déroulé, et les statistiques de la saison sont recalculées
          aussitôt.
        </p>
      </Card>

      <Card title="Déroulé du match" as="h2" flush>
        <ul className="divide-y divide-border/60">
          {view.timeline.map((line) => (
            <li key={line.eventId} className="flex items-center gap-3 px-4 py-3">
              <span className="w-12 shrink-0 font-mono text-sm text-ink-muted tabular-nums">
                {line.minuteLabel}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm font-medium text-ink",
                    line.voided && "text-ink-muted line-through",
                  )}
                >
                  {line.labelFr}
                </p>
                {line.actors.length > 0 ? (
                  <p
                    className={cn(
                      "truncate text-sm text-ink-muted",
                      line.voided && "line-through",
                    )}
                  >
                    {line.actors
                      .map(
                        (actor) =>
                          `${nameOf(actor.memberId)} (${ROLE_LABELS_FR[actor.role] ?? actor.role})`,
                      )
                      .join(" · ")}
                  </p>
                ) : null}
              </div>

              {line.voided ? (
                <Badge variant="neutral">annulé</Badge>
              ) : line.amendable ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setOpenLine(line)}
                >
                  Corriger
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Ajouter un changement" as="h2">
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Des joueurs entrés ou sortis sans que ce soit noté, ou des postes échangés. Tu choisis la
            minute, puis qui sort et qui entre&nbsp;: les listes montrent le terrain tel qu’il était à
            ce moment-là.
          </p>
          {state?.error && lastFrom === "change" ? <FieldError>{state.error}</FieldError> : null}
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => setAddingChange(true)}
            disabled={pending}
          >
            Ajouter un changement
          </Button>
        </div>
      </Card>

      <Card title="Ajouter une action oubliée" as="h2">
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Un but, une faute ou une blessure qui n’a pas été enregistrée pendant le match.
          </p>
          <Button type="button" variant="secondary" fullWidth onClick={() => setAdding(true)}>
            Ajouter une action
          </Button>
        </div>
      </Card>

      <AmendSheet
        teamId={teamId}
        view={view}
        line={openLine}
        regulation={regulation}
        pending={pending}
        action={dispatch("line")}
        onClose={() => setOpenLine(null)}
      />

      <AddSheet
        teamId={teamId}
        view={view}
        open={adding}
        regulation={regulation}
        pending={pending}
        action={dispatch("line")}
        onClose={() => setAdding(false)}
      />

      <AddChange
        teamId={teamId}
        view={view}
        regulation={regulation}
        open={addingChange}
        onClose={() => setAddingChange(false)}
        action={dispatch("change")}
      />
    </div>
  );
}

/**
 * An event the match never recorded. No target, so nothing is annulled — one append, and the frozen
 * statistics are recomputed from the log that results.
 */
function AddSheet({
  teamId,
  view,
  open,
  regulation,
  pending,
  action,
  onClose,
}: {
  teamId: string;
  view: RetroView;
  open: boolean;
  regulation: number;
  pending: boolean;
  action: (payload: FormData) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<RetroFactType>("GOAL_FOR");
  const [memberId, setMemberId] = useState("");
  const [assistId, setAssistId] = useState("");
  const [minute, setMinute] = useState("");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ajouter une action"
      description="Laisse la minute vide si tu ne t’en souviens plus : l’action sera placée au milieu du match."
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="matchId" value={view.match.id} />
        <input type="hidden" name="intent" value="correct" />

        <FactFields
          type={type}
          memberId={memberId}
          assistId={assistId}
          minute={minute}
          players={view.players}
          regulation={regulation}
          onType={setType}
          onMember={setMemberId}
          onAssist={setAssistId}
          onMinute={setMinute}
        />

        <Button type="submit" fullWidth disabled={pending}>
          {pending ? "Enregistrement…" : "Ajouter l’action"}
        </Button>
      </form>
    </Sheet>
  );
}

/**
 * The correction sheet for one line: what really happened, and at what minute if the coach knows.
 *
 * It opens pre-filled with the event as logged, so correcting the scorer is one tap on a `<select>`
 * and one on « Enregistrer » — the other fields already say what the log says.
 */
function AmendSheet({
  teamId,
  view,
  line,
  regulation,
  pending,
  action,
  onClose,
}: {
  teamId: string;
  view: RetroView;
  line: RetroTimelineLine | null;
  regulation: number;
  pending: boolean;
  action: (payload: FormData) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={line !== null}
      onClose={onClose}
      title={line ? `Corriger — ${line.labelFr} ${line.minuteLabel}` : "Corriger"}
      description="L’action est annulée et remplacée. Les deux restent dans le déroulé."
    >
      {line ? (
        <AmendFields
          key={line.eventId}
          teamId={teamId}
          view={view}
          line={line}
          regulation={regulation}
          pending={pending}
          action={action}
        />
      ) : null}
    </Sheet>
  );
}

function AmendFields({
  teamId,
  view,
  line,
  regulation,
  pending,
  action,
}: {
  teamId: string;
  view: RetroView;
  line: RetroTimelineLine;
  regulation: number;
  pending: boolean;
  action: (payload: FormData) => void;
}) {
  const initialType: RetroFactType = line.factType ?? "GOAL_FOR";
  const [type, setType] = useState<RetroFactType>(initialType);
  const [memberId, setMemberId] = useState(
    line.actors.find((actor) => actor.role !== "assist" && actor.role !== "in")?.memberId ?? "",
  );
  const [assistId, setAssistId] = useState(
    line.actors.find((actor) => actor.role === "assist")?.memberId ?? "",
  );
  const [minute, setMinute] = useState(String(line.minute));

  // A substitution or a change is not editable field by field — the players and the minute are one
  // fact. The honest correction is to annul it and add the right one, which is what the sheet offers.
  const substitution = line.type === "SUBSTITUTION" || line.type === "LINEUP_APPLIED";

  /*
   * What the coach came for is first: the fields, then « Enregistrer la correction ». Annulling is
   * below a rule, because it is the rarer and the destructive one — a sheet that opens with a red
   * full-width button under the thumb is a sheet that annuls goals by accident.
   */
  return (
    <div className="space-y-4">
      {substitution ? (
        <p className="text-sm text-ink-muted">
          Un changement se corrige en deux temps&nbsp;: annule celui-ci, puis saisis le bon depuis
          « Ajouter un changement ». Les minutes des joueurs suivront.
        </p>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="matchId" value={view.match.id} />
          <input type="hidden" name="targetEventId" value={line.eventId} />
          <input type="hidden" name="intent" value="correct" />

          <FactFields
            type={type}
            memberId={memberId}
            assistId={assistId}
            minute={minute}
            players={view.players}
            regulation={regulation}
            onType={setType}
            onMember={setMemberId}
            onAssist={setAssistId}
            onMinute={setMinute}
          />

          <Button type="submit" fullWidth disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer la correction"}
          </Button>
        </form>
      )}

      <form action={action} className="space-y-3 border-t border-border/60 pt-4">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="matchId" value={view.match.id} />
        <input type="hidden" name="targetEventId" value={line.eventId} />
        <input type="hidden" name="intent" value="void" />
        <p className="text-sm text-ink-muted">
          {substitution
            ? "Ce changement n’a jamais eu lieu ?"
            : "Cette action n’a jamais eu lieu ?"}
        </p>
        <Button type="submit" variant="danger" fullWidth disabled={pending}>
          {pending ? "Enregistrement…" : "Annuler cette action"}
        </Button>
      </form>
    </div>
  );
}

/** Shared by the correction sheet and the "add a forgotten action" sheet. */
function FactFields({
  type,
  memberId,
  assistId,
  minute,
  players,
  regulation,
  onType,
  onMember,
  onAssist,
  onMinute,
}: {
  type: RetroFactType;
  memberId: string;
  assistId: string;
  minute: string;
  players: RetroView["players"];
  regulation: number;
  onType: (value: RetroFactType) => void;
  onMember: (value: string) => void;
  onAssist: (value: string) => void;
  onMinute: (value: string) => void;
}) {
  return (
    <>
      <Select
        aria-label="Type d’action"
        name="fact-type"
        value={type}
        onChange={(event) => onType(event.target.value as RetroFactType)}
        className="min-h-11"
      >
        {RETRO_FACT_TYPES.map((candidate) => (
          <option key={candidate} value={candidate}>
            {EVENT_LABELS_FR[candidate]}
          </option>
        ))}
      </Select>

      {retroFactTakesMember(type) ? (
        <Select
          aria-label={retroFactNeedsMember(type) ? "Joueur" : "Buteur"}
          name="fact-member"
          value={memberId}
          onChange={(event) => onMember(event.target.value)}
          className="min-h-11"
        >
          <option value="">{retroFactNeedsMember(type) ? "Qui ?" : "Buteur inconnu"}</option>
          {players.map((player) => (
            <option key={player.memberId} value={player.memberId}>
              {player.displayName}
            </option>
          ))}
        </Select>
      ) : null}

      {retroFactTakesAssist(type) ? (
        <Select
          aria-label="Passeur"
          name="fact-assist"
          value={assistId}
          onChange={(event) => onAssist(event.target.value)}
          className="min-h-11"
        >
          <option value="">Sans passe décisive</option>
          {players.map((player) => (
            <option key={player.memberId} value={player.memberId}>
              {player.displayName}
            </option>
          ))}
        </Select>
      ) : null}

      <div className="flex items-center gap-2">
        <Input
          aria-label="Minute de l’action"
          name="fact-minute"
          type="number"
          inputMode="numeric"
          min={0}
          max={regulation}
          step={1}
          placeholder="?"
          value={minute}
          onChange={(event) => onMinute(event.target.value)}
          className="w-20 min-h-11 text-center"
        />
        <span className="text-sm text-ink-muted">
          {minute === "" ? "minute inconnue" : "ᵉ minute"}
        </span>
      </div>
    </>
  );
}
