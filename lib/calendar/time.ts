/**
 * Dates and times for the calendar, always in **Europe/Paris**.
 *
 * Two problems this module exists to solve, both of which bite in production but never on the
 * developer's laptop:
 *
 *  1. **Display.** A kick-off is a `timestamptz`, i.e. an instant. "Which day is it?" only has
 *     an answer once you pick a zone. A 20:30 CEST kick-off is 18:30 UTC — the same day — but a
 *     23:00 kick-off would be the *next* day in UTC. Every formatter below therefore pins
 *     `timeZone: "Europe/Paris"`; nothing here uses the host's zone, so a Vercel function running
 *     in UTC renders exactly what a phone in Paris renders.
 *  2. **Input.** `<input type="datetime-local">` hands back a naked wall clock ("2026-09-27T10:30")
 *     with no zone at all. We interpret it as Paris, not as the server's zone and not as the
 *     browser's: the team plays in France, and a coach on holiday in Lisbon must not create a
 *     match an hour early.
 *
 * Pure — no database, no `Date.now()` except where a `now` is passed in — so all of it is unit
 * tested in `time.test.ts`.
 */

/** The team's zone. One constant, so there is exactly one place to change if that ever moves. */
export const TIME_ZONE = "Europe/Paris";

/* -------------------------------------------------------------------------- */
/* Zone arithmetic                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `en-GB` with `hour12: false` gives a stable, parseable set of parts in every engine we care
 * about. It is never shown to a user — only the `fr-FR` formatters further down are.
 */
const PART_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(instant: Date): ZonedParts {
  const found: Record<string, string> = {};
  for (const part of PART_FORMAT.formatToParts(instant)) {
    if (part.type !== "literal") found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    // Some engines render midnight as "24" with hour12: false.
    hour: Number(found.hour) % 24,
    minute: Number(found.minute),
    second: Number(found.second),
  };
}

/**
 * The offset of Europe/Paris at `instant`, in milliseconds (+1h in winter, +2h in summer).
 *
 * Works by formatting the instant in Paris, reading the wall clock back as if it were UTC, and
 * taking the difference. That is the only way to get a zone offset out of the platform without
 * shipping a timezone database.
 */
export function zoneOffsetMs(instant: Date): number {
  const parts = zonedParts(instant);
  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // Offsets are whole minutes; drop the milliseconds so the subtraction stays exact.
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * `"2026-09-27T10:30"` (what `<input type="datetime-local">` submits) → the instant of that
 * wall clock **in Paris**. Returns null for anything that is not a real date.
 *
 * The offset is resolved iteratively because the answer depends on the result: to know whether
 * 27 March is CET or CEST you already need the instant. One correction pass is provably enough
 * — DST shifts are an hour, and a first guess is never more than an hour out.
 */
export function fromLocalInput(value: string): Date | null {
  const match = LOCAL_INPUT.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;

  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const rolled = new Date(wallClockAsUtc);
  // Date.UTC silently rolls 31 February over into March. Reject it instead.
  if (
    rolled.getUTCFullYear() !== year ||
    rolled.getUTCMonth() !== month - 1 ||
    rolled.getUTCDate() !== day
  ) {
    return null;
  }

  const firstGuess = wallClockAsUtc - zoneOffsetMs(rolled);
  const corrected = wallClockAsUtc - zoneOffsetMs(new Date(firstGuess));
  return new Date(corrected);
}

/** The inverse: an instant → the Paris wall clock a `datetime-local` input wants. */
export function toLocalInput(instant: Date): string {
  const p = zonedParts(instant);
  return `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}T${pad(p.hour, 2)}:${pad(p.minute, 2)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** The Paris calendar day of an instant, as `YYYY-MM-DD`. The key everything is grouped by. */
export function dayKey(instant: Date): string {
  const p = zonedParts(instant);
  return `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}`;
}

/**
 * Whole days between two `dayKey`s, `to - from`. Exact, because both sides are plain calendar
 * dates read as UTC midnights — no DST hour can creep in and make a day 23 hours long.
 */
export function dayDifference(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Days from `now` to `instant`, counted in Paris calendar days. Today is 0, tomorrow is 1. */
export function daysFromNow(instant: Date, now: Date): number {
  return dayDifference(dayKey(now), dayKey(instant));
}

/* -------------------------------------------------------------------------- */
/* French formatting                                                          */
/* -------------------------------------------------------------------------- */

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIME_ZONE,
  weekday: "long",
});

/**
 * `27/09/2026` — the French numeric date, day first, four-digit year, zero-padded.
 *
 * `2-digit` on both day and month rather than `numeric`: a season list where `3/10` sits under
 * `27/09` is a column that does not line up, and `tabular-nums` cannot fix a missing digit. The
 * locale is spelled out for the same reason it is everywhere in this file — the host's default
 * locale on Vercel is not French, and an implicit one renders `9/27/2026` in production and
 * nowhere else.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const SHORT_WEEKDAY_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIME_ZONE,
  weekday: "short",
});

/**
 * `hour12: false` is explicit even though `fr-FR` already implies it: the locale is the only thing
 * keeping the clock off `7:00 PM`, and one day someone will pass a different one.
 */
const TIME_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIME_ZONE,
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

/**
 * `"dimanche 27/09/2026"` — the weekday in words, the date in digits, always with the year.
 *
 * The two halves earn their place separately. The **weekday** is the half a footballer reads: a
 * Sunday is match day and a Wednesday is not, and no digit says that. The **date** is digits
 * because that is what a date looks like in French (decision 101), and it carries the year
 * unconditionally — a season crosses 1 January, and « 27 septembre » in a heading is a day the
 * reader cannot place without knowing which season he is looking at. Nothing here spells a month
 * any more: the owner asked for `DD/MM/YYYY` and meant everywhere, prose included.
 *
 * Built from `formatDate`, so there is exactly one definition of the numeric shape in this file.
 */
export function formatDay(instant: Date): string {
  return `${WEEKDAY_FORMAT.format(instant)} ${formatDate(instant)}`;
}

/** `"dim. 27/09/2026"` — for dense rows where the full weekday would wrap. */
export function formatShortDay(instant: Date): string {
  return `${formatShortWeekday(instant)} ${formatDate(instant)}`;
}

/** `"dim."` — the weekday alone, above a numeric date in a dense column. */
export function formatShortWeekday(instant: Date): string {
  return SHORT_WEEKDAY_FORMAT.format(instant);
}

/**
 * `"27/09/2026"` — the date in digits, French order. For anywhere a date is a fact to read off
 * rather than a sentence to read: a list column, an expiry, a record of a day.
 */
export function formatDate(instant: Date): string {
  return DATE_FORMAT.format(instant);
}

/** `"10:30"`, always 24-hour: that is how a French kick-off is written. */
export function formatTime(instant: Date): string {
  return TIME_FORMAT.format(instant);
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `"2026-03-14"` → `"14/03/2026"`, and null for anything that is not an ISO calendar day.
 *
 * The **string** half of the numeric shape `formatDate` produces from an instant: same digits, same
 * order, reached from a plain `YYYY-MM-DD` that has no timezone and must not be given one.
 * `new Date("2026-03-14")` is UTC midnight, so a `timeZone` formatter west of Greenwich renders the
 * 13th; this reads the parts and never builds a `Date` at all. `lib/player/injury.ts` formats its
 * `date` columns through here, so the app still has exactly one definition of `DD/MM/YYYY`
 * (decision 109).
 */
export function formatIsoDay(value: string): string | null {
  const match = ISO_DAY.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/**
 * What a native picker is currently holding, written the way the app writes dates:
 * `"2026-03-14"` → `"14/03/2026"`, `"2026-03-14T20:30"` → `"14/03/2026 à 20:30"`.
 *
 * Null — never a placeholder, never `Invalid Date` — for an empty or unparseable value, so the echo
 * under a picker says nothing rather than something untrue. The separator is « à », as in
 * `formatWhen`, and the clock is the 24-hour digits the input already submits: no `Intl` is involved
 * because there is no instant here, only the wall clock the user just picked.
 */
export function formatInputValueFr(value: string): string | null {
  const trimmed = value.trim();
  const day = formatIsoDay(trimmed);
  if (day) return day;

  const match = LOCAL_INPUT.exec(trimmed);
  if (!match) return null;
  const [, year, month, dayOfMonth, hour, minute] = match;
  if (Number(hour) > 23 || Number(minute) > 59) return null;
  return `${dayOfMonth}/${month}/${year} à ${hour}:${minute}`;
}

/**
 * `"aujourd’hui, 27/09/2026"`, `"demain, 28/09/2026"`, `"hier, 26/09/2026"`, else `formatDay`.
 *
 * Only the three neighbouring days get a relative word: "dans 5 jours" reads as vaguer than
 * "vendredi 02/10/2026". The word never stands alone, though. The pinned card on `/calendrier`
 * used to read « Demain à 15:00 » and name no day at all, so a page left open overnight, or a
 * screenshot sent to a teammate, said something false with nothing in it to catch the error. The
 * relative word is the convenience; the digits are the fact.
 */
export function formatDayLabel(instant: Date, now: Date): string {
  const diff = daysFromNow(instant, now);
  if (Math.abs(diff) <= 1) return `${RELATIVE_FORMAT.format(diff, "day")}, ${formatDate(instant)}`;
  return formatDay(instant);
}

/**
 * `"dans 4 jours"` / `"il y a 2 jours"`, switching to weeks past a fortnight so the pinned card
 * never reads "dans 47 jours".
 */
export function formatRelativeDays(instant: Date, now: Date): string {
  const diff = daysFromNow(instant, now);
  if (Math.abs(diff) <= 13) return RELATIVE_FORMAT.format(diff, "day");
  return RELATIVE_FORMAT.format(Math.round(diff / 7), "week");
}

/** `"aujourd’hui, 27/09/2026 à 10:30"`, `"dimanche 27/09/2026 à 10:30"`. */
export function formatWhen(instant: Date, now: Date): string {
  return `${formatDayLabel(instant, now)} à ${formatTime(instant)}`;
}

/** French sentence case, accents included: `"dimanche"` → `"Dimanche"`. */
export function capitalizeFirst(text: string): string {
  if (text.length === 0) return text;
  return text[0].toLocaleUpperCase("fr-FR") + text.slice(1);
}
