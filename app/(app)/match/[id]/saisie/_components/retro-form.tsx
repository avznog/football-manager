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
 * - **One card, one list, the add button underneath.** Everything that happened — buts, changements,
 *   fautes, blessures — is one `<ul>` in the order the coach typed it, because a substitution is just
 *   another thing that happened in the match and he should not have to decide which card a row
 *   belongs in. The control that starts the next row sits under the list, where the thumb left off.
 * - **The empty states describe the form, not a match.** With no planned composition the seven slots
 *   open on « — personne — », and a card saying « les sept titulaires ont fini le match » is then
 *   describing a match nobody has entered. So those sentences live in `lib/retro/labels.ts`, read
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
  RETRO_SCORE_EMPTY_FR,
  retroActionsEmptyFr,
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

/**
 * What the one type `<select>` offers, in the order of the domain's own list.
 *
 * `RETRO_ACTION_TYPES` minus `POSITION_CHANGE`, written out rather than filtered: that type is
 * enterable in principle but `RetroAction` has no arm for it yet, so `readActionFields` drops it, and
 * offering it would be a row the server throws away without saying so. When the arm lands this list
 * is one of the places it has to appear — a filter would have quietly offered it a slice too early.
 */
const RETRO_ROW_TYPES = [...RETRO_FACT_TYPES, "SUBSTITUTION"] as const;
type RetroRowType = (typeof RETRO_ROW_TYPES)[number];

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
   * **One list of rows, substitutions included**, in the order the coach added them — which is the
   * order one card now renders.
   *
   * Never sorted by minute. A row would jump out from under the thumb the moment a minute is typed,
   * and the common case is no minute at all (decision 048), which has no defined place in such an
   * order anyway.
   */
  const [actions, setActions] = useState<readonly ActionRow[]>([]);

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
      // Every row, half-filled substitutions included: this is the sheet as typed, and it is what
      // `findRetroIssues` has to judge for « il faut dire qui est entré » to appear beside the row
      // rather than only on submit (UX audit D22).
      actions: actions.map(toRetroAction),
    }),
    [actions, starters, view.match, view.slots],
  );

  /**
   * The same sheet minus the rows the reducer cannot replay.
   *
   * A substitution with a side still unchosen is « sort personne » — there is no such event, so it is
   * left out of the *preview* only. It stays in `entry`, where it is a problem to report, and the
   * server keeps it too.
   */
  const previewEntry: RetroEntry = useMemo(
    () => ({
      ...entry,
      actions: entry.actions.filter(
        (action) => action.type !== "SUBSTITUTION" || (action.outId !== "" && action.inId !== ""),
      ),
    }),
    [entry],
  );

  /** The score and the minutes this sheet implies — asked of the reducer, never counted here. */
  const preview = useMemo(() => {
    const built = buildRetroLog(previewEntry);
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
  }, [previewEntry, view.match.periodsCount, view.match.periodMinutes, view.slots]);

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

  /**
   * A new row at the **end** of the list, which is where the coach is looking: the two Score buttons
   * and « + Ajouter une action » all land here, and the add button sits under the list for the same
   * reason (the owner's own remark, typing up a match without his phone).
   */
  function addFactRow(type: RetroFactType) {
    setActions((rows) => [
      ...rows,
      { key: nextKey("f"), type, memberId: "", assistId: "", minute: "" },
    ]);
  }

  /**
   * Changing a row's type changes its shape: a substitution carries two players and a fact carries a
   * player and an assister. The minute survives, because it is the one thing the coach typed that is
   * still true, and a fact's player survives a fact-to-fact change (a goal retyped as a foul is the
   * same man).
   */
  const retypeRow = (key: string, type: RetroRowType) =>
    setActions((rows) =>
      rows.map((row) => {
        if (row.key !== key || row.type === type) return row;
        if (type === "SUBSTITUTION") {
          return { key: row.key, type, outId: "", inId: "", minute: row.minute };
        }
        return {
          key: row.key,
          type,
          memberId: isFactRow(row) ? row.memberId : "",
          assistId: isFactRow(row) ? row.assistId : "",
          minute: row.minute,
        };
      }),
    );

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
            <Button type="button" variant="secondary" onClick={() => addFactRow("GOAL_FOR")}>
              + But pour nous
            </Button>
            <Button type="button" variant="secondary" onClick={() => addFactRow("GOAL_AGAINST")}>
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

      {/* ---- Everything that happened, in one list ------------------------ */}

      {/*
        One card, one list, the add button underneath — the owner's remark on typing up a match he had
        played without his phone. A substitution is just another thing that happened in the match, so
        « Changements » and « Actions du match » were two cards for one question, and the coach had to
        decide which one a row belonged in before he could type it.

        The description names changements because the list now holds them; leaving « Buts, penalties,
        fautes, blessures » under a card that also takes substitutions would be the card describing
        something it no longer is.
      */}
      <Card
        title="Actions du match"
        description="Buts, changements, fautes, blessures. La minute est facultative."
      >
        <div className="space-y-3">
          {actions.length === 0 ? (
            // `entry.starters` is the filled slots only, so « sans titulaire » is asked of what the
            // coach has actually named and not of the seven slots on screen (decision 083).
            <p className="text-sm text-ink-muted">
              {retroActionsEmptyFr(entry.starters.length > 0)}
            </p>
          ) : (
            <ul className="space-y-3">
              {actions.map((row) => (
                <li key={row.key} className="space-y-1.5 rounded-xl border border-border/60 p-3">
                  {/*
                    The row's kind, chosen here and posted as data: one decoder reads every row, and
                    `action-type` is the discriminant it switches on. A substitution used to post it
                    from a hidden input because the card it lived in offered no choice of type.

                    On its own line, and that is a measurement and not a preference. It shared one
                    with the minute until « Changement » joined the list: at 390 px that row is the
                    select, an 80 px number field and « minute inconnue » wrapped over two lines, which
                    left the select 138 px and printed « Changemer ». The minute moves down beside
                    « Retirer », where the substitution card already had it, so the row is no taller.
                  */}
                  <Select
                    aria-label="Type d’action"
                    name={`action-type:${row.key}`}
                    value={row.type}
                    onChange={(event) => retypeRow(row.key, event.target.value as RetroRowType)}
                    className="min-h-11"
                  >
                    {RETRO_ROW_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {EVENT_LABELS_FR[type]}
                      </option>
                    ))}
                  </Select>

                  {isSubstitutionRow(row) ? (
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
                  ) : (
                    <>
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
                    </>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <MinuteInput
                      name={`action-minute:${row.key}`}
                      label={isSubstitutionRow(row) ? "Minute du changement" : "Minute de l’action"}
                      value={row.minute}
                      regulation={regulation}
                      onChange={(minute) =>
                        isSubstitutionRow(row)
                          ? patchChange(row.key, { minute })
                          : patchFact(row.key, { minute })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(row.key)}
                    >
                      Retirer
                    </Button>
                  </div>

                  <RowIssues issues={issuesOfRow(row.key)} />
                </li>
              ))}
            </ul>
          )}

          {/*
            **Under the list, not in the card header.** Typing up a match is a loop: add a row, fill
            it, add the next. The `Card` `action` prop renders in the `<header>`, so an « + Ajouter »
            there walks backwards up the screen on every row added, away from the thumb that is about
            to press it again. Placed as a child of this one card rather than by giving `Card` a
            `footer` prop — one call site needs it, and no other card in the app does.
          */}
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => addFactRow("GOAL_FOR")}
          >
            + Ajouter une action
          </Button>
        </div>
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
