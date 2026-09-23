"use client";

/**
 * The retro-entry sheet: who started, who came on, what happened.
 *
 * Designed for one specific moment — a coach on a bus, on a phone, filling in a match that finished
 * two weeks ago. Everything below follows from that:
 *
 * - **Nobody reconstructs a timeline.** The minute of every action is optional. An empty minute field
 *   means « je ne sais plus » and the app places the action itself; a required minute would get a
 *   made-up number, which is worse than an honest approximation because it looks precise.
 * - **The score is never typed.** Two big buttons add a goal for or against, one tap each, and the
 *   score above them is *derived* from the rows by the same `reduceMatch` every other screen uses
 *   (invariant 2). A 7-3 is ten taps and no arithmetic.
 * - **The starting seven is pre-filled** from the composition the coach planned before the match,
 *   when there was one. It is a default he can change, not a fact — invariant 3's courtesy applied to
 *   a screen that is not game mode.
 * - **The warnings are live.** `findRetroIssues` runs on every keystroke, so « Momo n'était pas sur
 *   le terrain à cette minute » appears next to the row rather than after a round trip.
 * - **It works without JavaScript.** Everything is native `<select>`s, number inputs and one
 *   `<form>`; without JS the coach gets the seven slots plus the rows the server rendered, and the
 *   Server Action re-validates everything anyway.
 */

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/components/ui/cn";
import { EVENT_LABELS_FR } from "@/lib/match/events";
import { scoreLineFr } from "@/lib/calendar/labels";
import { regulationMinutes } from "@/lib/match/clock";
import { reduceMatch } from "@/lib/match/reducer";
import { submitRetroMatch } from "@/lib/retro/actions";
import {
  RETRO_FACT_TYPES,
  buildRetroLog,
  retroEventRecords,
  retroFactNeedsMember,
  retroFactTakesAssist,
  retroFactTakesMember,
  type RetroChange,
  type RetroEntry,
  type RetroFact,
  type RetroFactType,
} from "@/lib/retro/log";
import { findRetroIssues, type RetroIssue } from "@/lib/retro/validation";
import type { RetroView } from "@/lib/retro/queries";

export type RetroFormProps = {
  teamId: string;
  view: RetroView;
};

/** A local row key: DOM bookkeeping only, never submitted as data. */
let rowSeq = 0;
const nextKey = (prefix: string) => `${prefix}${(rowSeq += 1)}`;

export function RetroForm({ teamId, view }: RetroFormProps) {
  const [state, action, pending] = useActionState(submitRetroMatch, undefined);

  const planned = useMemo(
    () => new Map(view.plannedStarters.map((starter) => [starter.slotId, starter.memberId])),
    [view.plannedStarters],
  );
  const [starters, setStarters] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.slots.map((slot) => [slot.id, planned.get(slot.id) ?? ""])),
  );
  const [changes, setChanges] = useState<readonly ChangeRow[]>([]);
  const [facts, setFacts] = useState<readonly FactRow[]>([]);

  const regulation = regulationMinutes({
    periodsCount: view.match.periodsCount,
    periodMinutes: view.match.periodMinutes,
  });

  /** The sheet as the pure modules want it: exactly what the Server Action will rebuild. */
  const entry: RetroEntry = useMemo(
    () => ({
      // The real one is derived from the content on the server; the preview never writes anything.
      submissionId: "00000000-0000-4000-8000-000000000000",
      periods: {
        periodsCount: view.match.periodsCount,
        periodMinutes: view.match.periodMinutes,
      },
      kickoffAtMs: new Date(view.match.kickoffAt).getTime(),
      lineupId: null,
      starters: view.slots
        .map((slot) => ({ slotId: slot.id, memberId: starters[slot.id] ?? "" }))
        .filter((starter) => starter.memberId !== ""),
      changes: changes
        .filter((row) => row.outId !== "" && row.inId !== "")
        .map(toRetroChange),
      facts: facts.map(toRetroFact),
    }),
    [changes, facts, starters, view.match, view.slots],
  );

  /** The score and the minutes this sheet implies — asked of the reducer, never counted here. */
  const preview = useMemo(() => {
    const built = buildRetroLog(entry);
    return {
      state: reduceMatch(retroEventRecords(built.events), [], {
        periodsCount: view.match.periodsCount,
        periodMinutes: view.match.periodMinutes,
        slots: view.slots.map((slot) => ({
          id: slot.id,
          positionCode: slot.positionCode,
          sort: slot.sort,
        })),
      }),
      guessedStamps: built.guessedStamps,
    };
  }, [entry, view.match.periodsCount, view.match.periodMinutes, view.slots]);

  const issues = useMemo(
    () =>
      findRetroIssues({
        entry,
        members: view.players.map((player) => ({
          membershipId: player.memberId,
          name: player.displayName,
        })),
        slots: view.slots.map((slot) => ({
          id: slot.id,
          positionCode: slot.positionCode,
          sort: slot.sort,
        })),
      }),
    [entry, view.players, view.slots],
  );

  const blocking = issues.filter((issue) => issue.blocking);
  const warnings = issues.filter((issue) => !issue.blocking);
  const issuesOfRow = (rowKey: string) => issues.filter((issue) => issue.rowKey === rowKey);

  const nameOf = (memberId: string) =>
    view.players.find((player) => player.memberId === memberId)?.displayName ?? "—";
  const chosen = new Set(Object.values(starters).filter((value) => value !== ""));

  /** Only claim the planned composition when the seven on screen still are the seven planned. */
  const lineupId =
    view.plannedLineupId !== null &&
    planned.size > 0 &&
    view.slots.every((slot) => (starters[slot.id] ?? "") === (planned.get(slot.id) ?? ""))
      ? view.plannedLineupId
      : "";

  function addGoal(type: RetroFactType) {
    setFacts((rows) => [
      ...rows,
      { key: nextKey("f"), type, memberId: "", assistId: "", minute: "" },
    ]);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="matchId" value={view.match.id} />
      <input type="hidden" name="lineupId" value={lineupId} />

      {state?.error ? <FieldError className="px-1">{state.error}</FieldError> : null}
      {state?.fieldErrors
        ? Object.entries(state.fieldErrors).map(([key, messages]) => (
            <FieldError key={key} className="px-1">
              {messages}
            </FieldError>
          ))
        : null}

      {/* ---- The score, derived ------------------------------------------- */}

      <Card
        title="Score"
        description="Déduit des buts que tu ajoutes ci-dessous. Un appui par but."
      >
        <div className="space-y-3">
          <p className="text-center font-mono text-4xl font-bold text-ink tabular-nums">
            {scoreLineFr(preview.state.goalsFor, preview.state.goalsAgainst)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => addGoal("GOAL_FOR")}>
              + But pour nous
            </Button>
            <Button type="button" variant="secondary" onClick={() => addGoal("GOAL_AGAINST")}>
              + But encaissé
            </Button>
          </div>
        </div>
      </Card>

      {/* ---- The starting seven ------------------------------------------- */}

      <Card
        title="Composition de départ"
        description={
          view.formationLabel
            ? `${view.formationLabel} · qui a commencé le match`
            : "Qui a commencé le match"
        }
      >
        <ul className="space-y-2">
          {view.slots.map((slot) => {
            const value = starters[slot.id] ?? "";
            const id = `starter-${slot.id}`;
            return (
              <li key={slot.id} className="flex items-center gap-3">
                <label htmlFor={id} className="w-28 shrink-0 text-sm font-medium text-ink">
                  {slot.labelFr}
                </label>
                <Select
                  id={id}
                  name={`starter:${slot.id}`}
                  value={value}
                  onChange={(event) =>
                    setStarters((rows) => ({ ...rows, [slot.id]: event.target.value }))
                  }
                  className="min-h-11"
                >
                  <option value="">— personne —</option>
                  {view.players.map((player) => (
                    <option
                      key={player.memberId}
                      value={player.memberId}
                      // A player already placed elsewhere stays listed, so picking him moves him.
                      disabled={player.memberId !== value && chosen.has(player.memberId)}
                    >
                      {playerLabel(player)}
                    </option>
                  ))}
                </Select>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ---- Substitutions ------------------------------------------------ */}

      <Card
        title="Changements"
        description="Qui est sorti, qui est entré. La minute est facultative."
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setChanges((rows) => [
                ...rows,
                { key: nextKey("c"), outId: "", inId: "", minute: "" },
              ])
            }
          >
            + Ajouter
          </Button>
        }
      >
        {changes.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun changement : les sept titulaires ont fini le match.</p>
        ) : (
          <ul className="space-y-3">
            {changes.map((row) => (
              <li key={row.key} className="space-y-1.5 rounded-xl border border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <Select
                    aria-label="Joueur sortant"
                    name={`change-out:${row.key}`}
                    value={row.outId}
                    onChange={(event) =>
                      setChanges((rows) => patch(rows, row.key, { outId: event.target.value }))
                    }
                    className="min-h-11"
                  >
                    <option value="">Sort…</option>
                    {view.players.map((player) => (
                      <option key={player.memberId} value={player.memberId}>
                        {playerLabel(player)}
                      </option>
                    ))}
                  </Select>
                  <span aria-hidden="true" className="text-ink-muted">
                    →
                  </span>
                  <Select
                    aria-label="Joueur entrant"
                    name={`change-in:${row.key}`}
                    value={row.inId}
                    onChange={(event) =>
                      setChanges((rows) => patch(rows, row.key, { inId: event.target.value }))
                    }
                    className="min-h-11"
                  >
                    <option value="">Entre…</option>
                    {view.players.map((player) => (
                      <option key={player.memberId} value={player.memberId}>
                        {playerLabel(player)}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <MinuteInput
                    name={`change-minute:${row.key}`}
                    label="Minute du changement"
                    value={row.minute}
                    regulation={regulation}
                    onChange={(minute) => setChanges((rows) => patch(rows, row.key, { minute }))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setChanges((rows) => rows.filter((item) => item.key !== row.key))}
                  >
                    Retirer
                  </Button>
                </div>

                <RowIssues issues={issuesOfRow(row.key)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---- Everything else that happened -------------------------------- */}

      <Card
        title="Actions du match"
        description="Buts, penalties, fautes, blessures."
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setFacts((rows) => [
                ...rows,
                { key: nextKey("f"), type: "GOAL_FOR", memberId: "", assistId: "", minute: "" },
              ])
            }
          >
            + Ajouter
          </Button>
        }
      >
        {facts.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {/* Not « sans carton » : this app deliberately records no cards at all (`docs/PLAN.md`),
                so naming one here would promise a field that does not exist. */}
            Rien pour l’instant. Un 0-0 sans rien à signaler, ça existe.
          </p>
        ) : (
          <ul className="space-y-3">
            {facts.map((row) => (
              <li key={row.key} className="space-y-1.5 rounded-xl border border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <Select
                    aria-label="Type d’action"
                    name={`fact-type:${row.key}`}
                    value={row.type}
                    onChange={(event) =>
                      setFacts((rows) =>
                        patch(rows, row.key, { type: event.target.value as RetroFactType }),
                      )
                    }
                    className="min-h-11"
                  >
                    {RETRO_FACT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {EVENT_LABELS_FR[type]}
                      </option>
                    ))}
                  </Select>
                  <MinuteInput
                    name={`fact-minute:${row.key}`}
                    label="Minute de l’action"
                    value={row.minute}
                    regulation={regulation}
                    onChange={(minute) => setFacts((rows) => patch(rows, row.key, { minute }))}
                  />
                </div>

                {retroFactTakesMember(row.type) ? (
                  <Select
                    aria-label={retroFactNeedsMember(row.type) ? "Joueur" : "Buteur"}
                    name={`fact-member:${row.key}`}
                    value={row.memberId}
                    onChange={(event) =>
                      setFacts((rows) => patch(rows, row.key, { memberId: event.target.value }))
                    }
                    className="min-h-11"
                  >
                    <option value="">
                      {retroFactNeedsMember(row.type) ? "Qui ?" : "Buteur inconnu"}
                    </option>
                    {view.players.map((player) => (
                      <option key={player.memberId} value={player.memberId}>
                        {playerLabel(player)}
                      </option>
                    ))}
                  </Select>
                ) : null}

                {retroFactTakesAssist(row.type) ? (
                  <Select
                    aria-label="Passeur"
                    name={`fact-assist:${row.key}`}
                    value={row.assistId}
                    onChange={(event) =>
                      setFacts((rows) => patch(rows, row.key, { assistId: event.target.value }))
                    }
                    className="min-h-11"
                  >
                    <option value="">Sans passe décisive</option>
                    {view.players.map((player) => (
                      <option key={player.memberId} value={player.memberId}>
                        {playerLabel(player)}
                      </option>
                    ))}
                  </Select>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFacts((rows) => rows.filter((item) => item.key !== row.key))}
                  >
                    Retirer
                  </Button>
                </div>

                <RowIssues issues={issuesOfRow(row.key)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---- What the app will record ------------------------------------- */}

      <Card title="Ce qui sera enregistré" as="h2">
        <div className="space-y-2 text-sm text-ink-muted">
          <p>
            {preview.state.players.filter((player) => player.minutes > 0).length} joueurs avec des
            minutes
            {preview.guessedStamps > 0
              ? ` · ${preview.guessedStamps} action${preview.guessedStamps > 1 ? "s" : ""} sans minute précise, placée${preview.guessedStamps > 1 ? "s" : ""} au mieux`
              : ""}
          </p>
          <ul className="space-y-1">
            {preview.state.players
              .filter((player) => player.minutes > 0)
              .map((player) => (
                <li key={player.memberId} className="flex justify-between gap-2">
                  <span className="truncate text-ink">{nameOf(player.memberId)}</span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {player.minutes}′
                    {player.goals > 0 ? ` · ${player.goals} but${player.goals > 1 ? "s" : ""}` : ""}
                    {player.assists > 0 ? ` · ${player.assists} passe${player.assists > 1 ? "s" : ""}` : ""}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </Card>

      {warnings.length > 0 ? (
        <ul className="space-y-1 px-1">
          {warnings.map((issue, index) => (
            <li key={`${issue.code}-${index}`} className="text-sm font-medium text-warning">
              {issue.messageFr}
            </li>
          ))}
        </ul>
      ) : null}

      {blocking.length > 0 ? (
        <ul className="space-y-1 px-1">
          {blocking.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              <FieldError>{issue.messageFr}</FieldError>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        type="submit"
        fullWidth
        disabled={pending || blocking.length > 0 || entry.starters.length === 0}
      >
        {pending ? "Enregistrement…" : "Enregistrer le match"}
      </Button>

      <p className={cn("px-1 text-center text-sm text-ink-muted")}>
        Le déroulé sera écrit comme si le match avait été suivi en direct : les statistiques, le
        résumé et les notes s’en servent tels quels.
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

type ChangeRow = { key: string; outId: string; inId: string; minute: string };
type FactRow = {
  key: string;
  type: RetroFactType;
  memberId: string;
  assistId: string;
  minute: string;
};

function toRetroChange(row: ChangeRow): RetroChange {
  return {
    key: row.key,
    outId: row.outId,
    inId: row.inId,
    minute: row.minute === "" ? null : Number(row.minute),
  };
}

function toRetroFact(row: FactRow): RetroFact {
  return {
    key: row.key,
    type: row.type,
    memberId: row.memberId === "" ? null : row.memberId,
    assistId: row.assistId === "" ? null : row.assistId,
    minute: row.minute === "" ? null : Number(row.minute),
  };
}

function patch<T extends { key: string }>(rows: readonly T[], key: string, values: Partial<T>): T[] {
  return rows.map((row) => (row.key === key ? { ...row, ...values } : row));
}

function playerLabel(player: RetroView["players"][number]): string {
  const number = player.jerseyNumber === null ? "" : `${player.jerseyNumber}. `;
  return `${number}${player.displayName}${player.isInjured ? " (blessé)" : ""}`;
}

/**
 * The minute of an action, or nothing at all.
 *
 * `placeholder="?"` and the hint below it are the whole unknown-minute rule as the coach meets it:
 * leaving it empty is a supported answer, not a field he forgot.
 */
function MinuteInput({
  name,
  label,
  value,
  regulation,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  regulation: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        aria-label={label}
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        max={regulation}
        step={1}
        placeholder="?"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-20 min-h-11 text-center"
      />
      <span className="text-sm text-ink-muted">
        {value === "" ? "minute inconnue" : "ᵉ minute"}
      </span>
    </div>
  );
}

function RowIssues({ issues }: { issues: readonly RetroIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`}>
          {issue.blocking ? (
            <FieldError>{issue.messageFr}</FieldError>
          ) : (
            <p className="text-sm font-medium text-warning">{issue.messageFr}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
