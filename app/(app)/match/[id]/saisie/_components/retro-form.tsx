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
 * - **The empty states describe the form, not a match.** With no planned composition the seven slots
 *   open on « — personne — », and a card saying « les sept titulaires ont fini le match » is then
 *   describing a match nobody has entered. So those sentences live in `lib/retro/labels.ts`, count
 *   what is actually filled in, and are tested (decision 083).
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
import { EVENT_LABELS_FR, SCORING_EVENT_TYPES } from "@/lib/match/events";
import { regulationMinutes } from "@/lib/match/clock";
import { reduceMatch } from "@/lib/match/reducer";
import { submitRetroMatch } from "@/lib/retro/actions";
import {
  RETRO_NO_FACTS_FR,
  RETRO_SCORE_EMPTY_FR,
  retroChangesEmptyFr,
  retroRecordedSummaryFr,
  retroScoreLineFr,
} from "@/lib/retro/labels";
import {
  RETRO_FACT_TYPES,
  buildRetroLog,
  retroEventRecords,
  retroFactNeedsMember,
  retroFactTakesAssist,
  retroFactTakesMember,
  retroFacts,
  isRetroFactType,
  type RetroAction,
  type RetroEntry,
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
  /**
   * **One list of rows, substitutions included**, in the order the coach added them.
   *
   * Still rendered as two cards, because merging the two cards into one list on screen is the next
   * slice and this one is meant to be invisible. What changed is underneath: both cards read from and
   * write to this array, and both post one `action-*` family of field names.
   */
  const [actions, setActions] = useState<readonly ActionRow[]>([]);
  const changes = actions.filter(isSubstitutionRow);
  const facts = actions.filter(isFactRow);

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
      // A substitution with a side still unchosen is left out of the *preview* — the reducer cannot
      // replay « sort personne » — while the server keeps it and reports it. Unchanged behaviour.
      actions: actions
        .filter((row) => !isSubstitutionRow(row) || (row.outId !== "" && row.inId !== ""))
        .map(toRetroAction),
    }),
    [actions, starters, view.match, view.slots],
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

  /**
   * How many rows on the sheet can move the score. Zero of them means the Score card has nothing to
   * state yet — and the 0 – 0 it used to print there was the only untrue thing on the screen.
   */
  const goalActions = retroFacts(entry.actions).filter((fact) =>
    (SCORING_EVENT_TYPES as readonly string[]).includes(fact.type),
  ).length;
  const scoreLine = retroScoreLineFr({
    goalActions,
    goalsFor: preview.state.goalsFor,
    goalsAgainst: preview.state.goalsAgainst,
  });

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
    setActions((rows) => [
      ...rows,
      { key: nextKey("f"), type, memberId: "", assistId: "", minute: "" },
    ]);
  }

  /** Narrowed updaters: a substitution row and a fact row have no fields in common but `key`. */
  const patchChange = (key: string, values: Partial<SubRow>) =>
    setActions((rows) =>
      rows.map((row) => (row.key === key && isSubstitutionRow(row) ? { ...row, ...values } : row)),
    );
  const patchFact = (key: string, values: Partial<FactRow>) =>
    setActions((rows) =>
      rows.map((row) => (row.key === key && isFactRow(row) ? { ...row, ...values } : row)),
    );
  const removeRow = (key: string) =>
    setActions((rows) => rows.filter((row) => row.key !== key));

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

      {/*
        « Un appui par but » is gone from the description on purpose (UX audit D6): the tap adds a
        *row*, in a card the coach cannot see from here, and the sentence was confirming the opposite.
      */}
      <Card title="Score" description="Déduit des buts que tu ajoutes ci-dessous.">
        <div className="space-y-3">
          {scoreLine !== null ? (
            <p className="text-center font-mono text-4xl font-bold text-ink tabular-nums">
              {scoreLine}
            </p>
          ) : (
            <p className="text-center text-sm text-ink-muted">{RETRO_SCORE_EMPTY_FR}</p>
          )}
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
              setActions((rows) => [
                ...rows,
                { key: nextKey("c"), type: "SUBSTITUTION", outId: "", inId: "", minute: "" },
              ])
            }
          >
            + Ajouter
          </Button>
        }
      >
        {changes.length === 0 ? (
          // `entry.starters` is the filled slots only, so the sentence cannot claim seven players on
          // a sheet where nobody has been named yet (decision 083).
          <p className="text-sm text-ink-muted">{retroChangesEmptyFr(entry.starters.length)}</p>
        ) : (
          <ul className="space-y-3">
            {changes.map((row) => (
              <li key={row.key} className="space-y-1.5 rounded-xl border border-border/60 p-3">
                {/*
                  The row's kind, posted rather than inferred from which controls arrived: one decoder
                  reads every row now, and `action-type` is the discriminant it switches on. A hidden
                  field because the card above the « Actions du match » one offers no choice of type —
                  that is the next slice's job, and this one must not change what is on screen.
                */}
                <input type="hidden" name={`action-type:${row.key}`} value="SUBSTITUTION" />
                <div className="flex items-center gap-2">
                  <Select
                    aria-label="Joueur sortant"
                    name={`action-out:${row.key}`}
                    value={row.outId}
                    onChange={(event) => patchChange(row.key, { outId: event.target.value })}
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
                    name={`action-in:${row.key}`}
                    value={row.inId}
                    onChange={(event) => patchChange(row.key, { inId: event.target.value })}
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
                    name={`action-minute:${row.key}`}
                    label="Minute du changement"
                    value={row.minute}
                    regulation={regulation}
                    onChange={(minute) => patchChange(row.key, { minute })}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.key)}>
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
            onClick={() => addGoal("GOAL_FOR")}
          >
            + Ajouter
          </Button>
        }
      >
        {facts.length === 0 ? (
          <p className="text-sm text-ink-muted">{RETRO_NO_FACTS_FR}</p>
        ) : (
          <ul className="space-y-3">
            {facts.map((row) => (
              <li key={row.key} className="space-y-1.5 rounded-xl border border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <Select
                    aria-label="Type d’action"
                    name={`action-type:${row.key}`}
                    value={row.type}
                    onChange={(event) =>
                      patchFact(row.key, { type: event.target.value as RetroFactType })
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
                    name={`action-minute:${row.key}`}
                    label="Minute de l’action"
                    value={row.minute}
                    regulation={regulation}
                    onChange={(minute) => patchFact(row.key, { minute })}
                  />
                </div>

                {retroFactTakesMember(row.type) ? (
                  <Select
                    aria-label={retroFactNeedsMember(row.type) ? "Joueur" : "Buteur"}
                    name={`action-member:${row.key}`}
                    value={row.memberId}
                    onChange={(event) => patchFact(row.key, { memberId: event.target.value })}
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
                    name={`action-assist:${row.key}`}
                    value={row.assistId}
                    onChange={(event) => patchFact(row.key, { assistId: event.target.value })}
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
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.key)}>
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
            {retroRecordedSummaryFr({
              playersWithMinutes: preview.state.players.filter((player) => player.minutes > 0)
                .length,
              guessedStamps: preview.guessedStamps,
            })}
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

/**
 * A row as the controls hold it: the same two arms as `RetroAction`, with `minute` and the player ids
 * as the strings a `<select>` and a number input actually carry. `""` is « rien choisi », which
 * `toRetroAction` turns into the `null` the domain means by it.
 */
type SubRow = { key: string; type: "SUBSTITUTION"; outId: string; inId: string; minute: string };
type FactRow = {
  key: string;
  type: RetroFactType;
  memberId: string;
  assistId: string;
  minute: string;
};
type ActionRow = SubRow | FactRow;

const isSubstitutionRow = (row: ActionRow): row is SubRow => row.type === "SUBSTITUTION";
/** Asked of the list, not of « everything that is not a substitution », so a third arm is excluded. */
const isFactRow = (row: ActionRow): row is FactRow => isRetroFactType(row.type);

function toRetroAction(row: ActionRow): RetroAction {
  const minute = row.minute === "" ? null : Number(row.minute);
  return isSubstitutionRow(row)
    ? { key: row.key, type: row.type, outId: row.outId, inId: row.inId, minute }
    : {
        key: row.key,
        type: row.type,
        memberId: row.memberId === "" ? null : row.memberId,
        assistId: row.assistId === "" ? null : row.assistId,
        minute,
      };
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
