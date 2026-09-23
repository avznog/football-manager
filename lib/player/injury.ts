/**
 * Injuries: the derived state and the French wording.
 *
 * **Pure** — every function takes the data and "today" as arguments, so there is no clock and no
 * database here and the whole thing is unit-tested. The rule itself comes from
 * `docs/DATA_MODEL.md`: *a member is injured while a row exists with `resolved_on` null*. Injured
 * members are flagged, never blocked.
 *
 * Dates are plain `YYYY-MM-DD` strings, exactly as `injuries.started_on` stores them
 * (`date({ mode: "string" })`). They are calendar days, not instants: turning one into a `Date`
 * would drag a timezone into a value that has none, and « blessé depuis le 13 » would become
 * « le 12 » for anybody east of Greenwich. So they are compared as strings — ISO dates sort
 * lexicographically — and formatted from their parts.
 */

/** An injury as every screen reads it: plain strings, safe across the RSC boundary. */
export type InjuryRecord = {
  id: string;
  /** `YYYY-MM-DD`. */
  startedOn: string;
  /** `YYYY-MM-DD`, or null when nobody dared guess. */
  expectedReturnOn: string | null;
  note: string | null;
  /** `YYYY-MM-DD` once healed; null means the injury is ongoing. */
  resolvedOn: string | null;
  /** Display name of whoever declared it — the player themselves, or a coach. */
  declaredByName: string | null;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day in `YYYY-MM-DD`. Rejects `2026-02-30` as well as `hier`. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
  );
}

/**
 * Today as a calendar day in Paris (`CLAUDE.md`: dates are handled in `Europe/Paris`).
 *
 * Takes the instant as an argument so callers stay testable and so nothing in here reads the
 * clock. `en-CA` is the shortest way to get ISO order out of `Intl`.
 */
const PARIS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parisDate(instant: Date): string {
  return PARIS_DAY.format(instant);
}

/** An injury nobody has closed yet. */
export function isOngoing(injury: Pick<InjuryRecord, "resolvedOn">): boolean {
  return injury.resolvedOn === null;
}

/**
 * Ongoing first, then most recently started. This is the order the profile lists them in, and
 * the reason the current injury is always `[0]`.
 */
export function sortInjuries<T extends Pick<InjuryRecord, "startedOn" | "resolvedOn">>(
  injuries: readonly T[],
): T[] {
  return [...injuries].sort((a, b) => {
    const byState = Number(isOngoing(b)) - Number(isOngoing(a));
    if (byState !== 0) return byState;
    return b.startedOn.localeCompare(a.startedOn);
  });
}

/** The injury that makes a member « blessé »: the most recent unresolved one. */
export function currentInjury<T extends Pick<InjuryRecord, "startedOn" | "resolvedOn">>(
  injuries: readonly T[],
): T | undefined {
  return sortInjuries(injuries.filter(isOngoing))[0];
}

/** The ones already healed, most recent first. */
export function pastInjuries<T extends Pick<InjuryRecord, "startedOn" | "resolvedOn">>(
  injuries: readonly T[],
): T[] {
  return sortInjuries(injuries.filter((injury) => !isOngoing(injury)));
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function isFutureDate(value: string, today: string): boolean {
  return value > today;
}

/** The whole injury state of a member, derived — never stored. */
export type InjuryStatus =
  | { injured: false }
  | {
      injured: true;
      injury: InjuryRecord;
      /** Days elapsed since the injury started. 0 on the day itself. */
      daysSinceStart: number;
      /** Days left before the expected return; negative once it has passed. Null if unknown. */
      daysUntilReturn: number | null;
      /** The expected return date is behind us and nobody has closed the injury. */
      overdue: boolean;
    };

export function injuryStatus(injuries: readonly InjuryRecord[], today: string): InjuryStatus {
  const injury = currentInjury(injuries);
  if (!injury) return { injured: false };

  const daysUntilReturn =
    injury.expectedReturnOn === null ? null : daysBetween(today, injury.expectedReturnOn);

  return {
    injured: true,
    injury,
    daysSinceStart: daysBetween(injury.startedOn, today),
    daysUntilReturn,
    overdue: daysUntilReturn !== null && daysUntilReturn < 0,
  };
}

/**
 * « 13/09/2026 » — the French numeric date, for the dates that are read off a list or a record
 * rather than read as a sentence: the injury history, « Arrivé le ». Same shape as
 * `formatDate` in `lib/calendar/time.ts`, reached from an ISO day instead of an instant, so a
 * `YYYY-MM-DD` column never has to be turned into a `Date` and a timezone question.
 */
export function formatDateFr(value: string): string {
  const match = ISO_DATE.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** « depuis 3 jours », « aujourd’hui », « dans 12 jours »… for a relative day count. */
export function formatDayCountFr(days: number): string {
  if (days === 0) return "aujourd’hui";
  if (days === 1) return "demain";
  if (days === -1) return "hier";
  return days > 0 ? `dans ${days} jours` : `il y a ${-days} jours`;
}

/**
 * One line summarising an ongoing injury: « Blessé depuis le 13/09/2026, retour prévu le
 * 03/10/2026 (dans 11 jours). »
 *
 * Digits, like every other date in the app (decision 109). It used to say « depuis le 13
 * septembre » on the grounds that a sentence reads better with the month as a word — and it does,
 * right up to the point where the reader has to compare it with the numeric date two lines above it.
 */
export function injurySummaryFr(injuries: readonly InjuryRecord[], today: string): string {
  const status = injuryStatus(injuries, today);
  if (!status.injured) return "Aucune blessure en cours.";

  const since = `Blessé depuis le ${formatDateFr(status.injury.startedOn)}`;
  if (status.injury.expectedReturnOn === null) {
    return `${since}, retour non estimé.`;
  }

  const returnOn = formatDateFr(status.injury.expectedReturnOn);
  if (status.overdue) {
    return `${since}, retour prévu le ${returnOn} — la date est passée.`;
  }
  return `${since}, retour prévu le ${returnOn} (${formatDayCountFr(status.daysUntilReturn ?? 0)}).`;
}
