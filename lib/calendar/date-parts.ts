/**
 * A date, or a date and a wall-clock time, as the separate boxes the coach types it into (decision
 * 231): « 22 » / « 11 » / « 2026 », « 10 » h « 30 ».
 *
 * Pure: no `Date.now()`, no time zone. The value these assemble is exactly what the native
 * `<input type="date">` and `type="datetime-local"` used to post — `YYYY-MM-DD` and
 * `YYYY-MM-DDTHH:mm`, a Paris wall clock (decision 013) — so the Server Actions and their schemas did
 * not have to change when the native pickers went.
 *
 * Why the boxes exist at all: a native picker renders in the **browser's** locale, so on an English
 * phone or laptop it reads `mm/dd/yyyy, --:-- AM` inside an app that says `22/11/2026 à 10:30`
 * everywhere else. Decision 109 kept the native control and echoed the value in French beneath it;
 * the owner asked for the fields themselves to be French and 24-hour.
 */

export type DateKind = "date" | "datetime-local";

/** The boxes' contents, as typed: digits only, possibly incomplete. */
export type DateParts = {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
};

export const EMPTY_PARTS: DateParts = { day: "", month: "", year: "", hour: "", minute: "" };

/** How many digits each box takes, which is also when focus moves on to the next. */
export const PART_LENGTH: Readonly<Record<keyof DateParts, number>> = {
  day: 2,
  month: 2,
  year: 4,
  hour: 2,
  minute: 2,
};

const DAY_VALUE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** The parts of a posted value, or empty parts for anything unreadable or empty. */
export function splitDateValue(value: string | null | undefined): DateParts {
  const text = (value ?? "").trim();
  const local = LOCAL_VALUE.exec(text);
  if (local) {
    const [, year, month, day, hour, minute] = local;
    return { day, month, year, hour, minute };
  }
  const day = DAY_VALUE.exec(text);
  if (day) return { ...EMPTY_PARTS, year: day[1], month: day[2], day: day[3] };
  return { ...EMPTY_PARTS };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** What is wrong with the boxes once they are filled in, in the order the reader should hear it. */
export type DateProblem =
  | "incomplete"
  | "impossible-date"
  | "impossible-time"
  | "before-min"
  | "after-max";

export type AssembledDate = {
  /** What the form posts: the ISO value, or `""` when the boxes do not make a valid one. */
  value: string;
  /** `null` for a valid value **and** for boxes left entirely empty — empty is not an error here. */
  problem: DateProblem | null;
};

const pad = (text: string, length: number) => text.padStart(length, "0");

/**
 * The boxes as one posted value.
 *
 * An impossible date (31/02) or time (25 h) posts **empty** rather than a nearby real one: a wrong
 * kick-off saved silently is worse than the form's own « required » message firing. `min` / `max`
 * are ISO values as the native input took them, compared on the day for a `date` and on the whole
 * value for a `datetime-local` — string comparison is exact for zero-padded ISO.
 */
export function assembleDateValue(
  parts: DateParts,
  kind: DateKind,
  bounds: { min?: string | null; max?: string | null } = {},
): AssembledDate {
  const fields: (keyof DateParts)[] =
    kind === "date" ? ["day", "month", "year"] : ["day", "month", "year", "hour", "minute"];
  const filled = fields.filter((field) => parts[field] !== "");
  if (filled.length === 0) return { value: "", problem: null };
  if (filled.length < fields.length || parts.year.length !== 4) {
    return { value: "", problem: "incomplete" };
  }

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (
    !Number.isInteger(year) ||
    year < 1000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return { value: "", problem: "impossible-date" };
  }

  let value = `${parts.year}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
  if (kind === "datetime-local") {
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return { value: "", problem: "impossible-time" };
    }
    value += `T${pad(parts.hour, 2)}:${pad(parts.minute, 2)}`;
  }

  if (bounds.min && value < bounds.min) return { value: "", problem: "before-min" };
  if (bounds.max && value > bounds.max) return { value: "", problem: "after-max" };
  return { value, problem: null };
}

/** `2026-11-22` (or `2026-11-22T…`) as `22/11/2026`, for the messages below. */
export function frenchDayOf(iso: string): string {
  const parts = splitDateValue(iso.length === 10 ? iso : iso.slice(0, 16));
  return parts.year ? `${parts.day}/${parts.month}/${parts.year}` : iso;
}

/** The sentence a problem shows under the boxes and as the browser's validation message. */
export function dateProblemFr(
  problem: DateProblem,
  bounds: { min?: string | null; max?: string | null } = {},
): string {
  switch (problem) {
    case "incomplete":
      return "La date est incomplète : jour, mois et année sur quatre chiffres.";
    case "impossible-date":
      return "Cette date n’existe pas.";
    case "impossible-time":
      return "L’heure va de 00 à 23 et les minutes de 00 à 59.";
    case "before-min":
      return `Au plus tôt le ${frenchDayOf(bounds.min ?? "")}.`;
    case "after-max":
      return `Au plus tard le ${frenchDayOf(bounds.max ?? "")}.`;
  }
}

/**
 * Whatever was pasted into any box, as all of them: `22/11/2026 10:30`, `22/11/2026`, `22-11-2026
 * 10h30`, `22.11.2026`, and the ISO forms the native input copied (`2026-11-22T10:30`). `null` for text
 * that is not one of those, so the paste then falls through to the box it landed in.
 */
export function parsePastedDate(text: string): DateParts | null {
  const trimmed = text.trim();
  const iso = splitDateValue(trimmed);
  if (iso.year) return iso;

  const french = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})(?:[\sT,à]+(\d{1,2})\s*[:hH]\s*(\d{2}))?$/.exec(
    trimmed,
  );
  if (!french) return null;
  const [, day, month, year, hour, minute] = french;
  return {
    day: pad(day, 2),
    month: pad(month, 2),
    year,
    hour: hour === undefined ? "" : pad(hour, 2),
    minute: minute ?? "",
  };
}

/**
 * The largest first digit each two-digit box can start with. Typing a bigger one — « 4 » in the day
 * box — can only mean « 04 », so the box pads it and moves on rather than waiting for a second digit
 * that would make it impossible.
 */
export const FIRST_DIGIT_MAX: Readonly<Partial<Record<keyof DateParts, number>>> = {
  day: 3,
  month: 1,
  hour: 2,
  minute: 5,
};

/**
 * What a box holds after a keystroke: digits only, cut to its length, and padded when its first digit
 * alone already decides it. `complete` says whether focus should move to the next box.
 */
export function normalisePart(
  part: keyof DateParts,
  raw: string,
): { text: string; complete: boolean } {
  const length = PART_LENGTH[part];
  const digits = raw.replace(/\D/g, "").slice(0, length);
  const firstMax = FIRST_DIGIT_MAX[part];
  if (digits.length === 1 && firstMax !== undefined && Number(digits) > firstMax) {
    return { text: pad(digits, 2), complete: true };
  }
  return { text: digits, complete: digits.length === length };
}
