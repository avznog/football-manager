"use client";

/**
 * A date, or a date and a 24-hour time, typed into French boxes: « 22 » / « 11 » / « 2026 »,
 * « 10 » h « 30 » (decision 231, superseding 109).
 *
 * **Why not the native picker.** `<input type="date">` and `type="datetime-local"` render in the
 * **browser's** locale, which no stylesheet reaches: on an English phone or laptop they read
 * `mm/dd/yyyy, --:-- AM` inside an app that writes `22/11/2026 à 10:30` everywhere else. Decision 109
 * kept them and echoed the value in French underneath; the owner asked for the fields themselves to be
 * French and 24-hour, on every device.
 *
 * **The public API is the native input's**, so no caller changed: `type`, `name`, `value` /
 * `defaultValue` / `onChange` (called with an event whose `target.value` is the assembled value, which
 * is all the controlled caller reads), `required`, `min`, `max`, and the `Field` wiring (`id`,
 * `aria-describedby`, `invalid`). The form posts **the identical value** through one hidden input
 * named `name` — `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` — so the Server Actions and their schemas did not
 * move either.
 *
 * **Without JavaScript** the boxes cannot assemble anything, so they step aside: a `<noscript>` holds
 * the old native input under the same `name`, plus a style that hides the boxes. The hidden input only
 * takes its `name` once mounted, so with scripting off exactly one field posts — the native one, in the
 * browser's own format, which is the pre-231 behaviour and still correct. Chosen over naming each box
 * and assembling on the server because that would have meant touching every action and schema that
 * reads a date.
 *
 * **Validation.** An impossible date (31/02), an out-of-range time or a value outside `min`/`max`
 * posts **empty** — the server's own « required » message then fires for a required field — and is
 * said under the boxes and set as the first box's validity message, so the browser refuses to submit
 * it in the first place. Nothing is said while the boxes are still being filled.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import {
  PART_LENGTH,
  assembleDateValue,
  dateProblemFr,
  normalisePart,
  parsePastedDate,
  splitDateValue,
  type DateParts,
} from "@/lib/calendar/date-parts";
import { cn } from "./cn";
import { controlClassName, type InputProps } from "./input";

export type DateInputProps = Omit<InputProps, "type"> & {
  /** `date` for a calendar day, `datetime-local` for a day and a wall clock. */
  type: "date" | "datetime-local";
};

const PART_LABEL: Readonly<Record<keyof DateParts, string>> = {
  day: "Jour",
  month: "Mois",
  year: "Année",
  hour: "Heure",
  minute: "Minutes",
};

const PART_PLACEHOLDER: Readonly<Record<keyof DateParts, string>> = {
  day: "JJ",
  month: "MM",
  year: "AAAA",
  hour: "HH",
  minute: "MM",
};

/** Hidden when scripting is off, so the `<noscript>` native input stands alone. */
const SEGMENTS_ATTR = "data-date-segments";

export function DateInput({
  type,
  value,
  defaultValue,
  onChange,
  className,
  id,
  name,
  required,
  min,
  max,
  invalid,
  disabled,
  "aria-describedby": describedBy,
  ...rest
}: DateInputProps) {
  const controlled = value !== undefined;
  const order: (keyof DateParts)[] =
    type === "date" ? ["day", "month", "year"] : ["day", "month", "year", "hour", "minute"];
  const bounds = { min: stringOf(min) || null, max: stringOf(max) || null };

  const [parts, setParts] = useState<DateParts>(() =>
    splitDateValue(stringOf(controlled ? value : defaultValue)),
  );
  // True once hydrated, false in the server HTML: decides whether the hidden input takes the name.
  const mounted = useSyncExternalStore(noSubscription, isClient, isServer);

  // A controlled caller that sets the value itself (not through these boxes) is followed; a value
  // this component just emitted is not, or clearing a box would wipe the others with it.
  const lastEmitted = useRef(stringOf(controlled ? value : defaultValue));
  useEffect(() => {
    if (!controlled) return;
    const next = stringOf(value);
    if (next !== lastEmitted.current) {
      lastEmitted.current = next;
      setParts(splitDateValue(next));
    }
  }, [controlled, value]);

  const assembled = useMemo(
    () => assembleDateValue(parts, type, bounds),
    // `bounds` is rebuilt every render from two strings; depend on the strings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parts, type, bounds.min, bounds.max],
  );
  // Said only once every box is full: « incomplete » while typing would be noise.
  const complete = order.every((part) => parts[part].length === PART_LENGTH[part]);
  const shownProblem =
    assembled.problem && (assembled.problem !== "incomplete" || complete)
      ? assembled.problem
      : null;
  const message = shownProblem ? dateProblemFr(shownProblem, bounds) : null;

  const refs = useRef<Partial<Record<keyof DateParts, HTMLInputElement | null>>>({});
  const firstRef = (element: HTMLInputElement | null) => {
    refs.current.day = element;
  };

  // The browser's own validation: an incomplete or wrong value cannot be submitted at all.
  useEffect(() => {
    const first = refs.current.day;
    if (!first) return;
    first.setCustomValidity(
      assembled.problem ? dateProblemFr(assembled.problem, bounds) : "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assembled.problem, bounds.min, bounds.max]);

  function commit(next: DateParts) {
    setParts(next);
    const result = assembleDateValue(next, type, bounds);
    if (result.value !== lastEmitted.current) {
      lastEmitted.current = result.value;
      onChange?.({
        target: { value: result.value, name: name ?? "" },
        currentTarget: { value: result.value, name: name ?? "" },
      } as unknown as ChangeEvent<HTMLInputElement>);
    }
  }

  function focus(part: keyof DateParts | undefined) {
    const element = part ? refs.current[part] : null;
    if (element) {
      element.focus();
      element.select();
    }
  }

  function handleInput(part: keyof DateParts, event: ChangeEvent<HTMLInputElement>) {
    const { text, complete: full } = normalisePart(part, event.target.value);
    commit({ ...parts, [part]: text });
    if (full) focus(order[order.indexOf(part) + 1]);
  }

  function handleKeyDown(part: keyof DateParts, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && parts[part] === "") {
      const previous = order[order.indexOf(part) - 1];
      if (previous) {
        event.preventDefault();
        focus(previous);
      }
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = parsePastedDate(event.clipboardData.getData("text"));
    if (!pasted) return;
    event.preventDefault();
    commit(type === "date" ? { ...pasted, hour: "", minute: "" } : pasted);
    focus(order[order.length - 1]);
  }

  const showInvalid = Boolean(invalid) || shownProblem !== null;
  const messageId = useId();
  const groupDescribedBy = [describedBy, message ? messageId : null].filter(Boolean).join(" ") || undefined;

  const box = (part: keyof DateParts) => (
    <input
      key={part}
      ref={part === "day" ? firstRef : (element) => void (refs.current[part] = element)}
      // The `Field` label's `htmlFor` lands on the first box, so a tap on the label focuses it.
      id={part === "day" ? id : undefined}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={PART_LENGTH[part]}
      placeholder={PART_PLACEHOLDER[part]}
      aria-label={PART_LABEL[part]}
      aria-describedby={groupDescribedBy}
      aria-invalid={showInvalid || undefined}
      required={required}
      disabled={disabled}
      value={parts[part]}
      onChange={(event) => handleInput(part, event)}
      onKeyDown={(event) => handleKeyDown(part, event)}
      onPaste={handlePaste}
      onFocus={(event) => event.target.select()}
      className={cn(
        controlClassName,
        "px-1 text-center tabular-nums",
        part === "year" ? "w-[4.5rem]" : "w-12",
      )}
      {...(part === "day" ? rest : {})}
    />
  );

  return (
    <>
      <div
        {...{ [SEGMENTS_ATTR]: "" }}
        role="group"
        aria-labelledby={id ? `${id}-label` : undefined}
        className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}
      >
        <span className="flex items-center gap-1">
          {box("day")}
          <span aria-hidden="true" className="text-ink-muted">/</span>
          {box("month")}
          <span aria-hidden="true" className="text-ink-muted">/</span>
          {box("year")}
        </span>
        {type === "datetime-local" ? (
          <span className="flex items-center gap-1">
            {box("hour")}
            <span aria-hidden="true" className="text-ink-muted">h</span>
            {box("minute")}
          </span>
        ) : null}
        {/* Named only once mounted: with scripting off, the <noscript> input below is the one that
            posts, and two fields under one name would let the stale one win. */}
        <input type="hidden" name={mounted ? name : undefined} value={assembled.value} />
      </div>
      {message ? (
        <p id={messageId} className="text-sm text-danger">
          {message}
        </p>
      ) : null}
      <noscript>
        <style>{`[${SEGMENTS_ATTR}]{display:none!important}`}</style>
        <input
          type={type}
          name={name}
          defaultValue={stringOf(controlled ? value : defaultValue)}
          required={required}
          min={stringOf(min) || undefined}
          max={stringOf(max) || undefined}
          aria-describedby={describedBy}
          className={cn(controlClassName, "tabular-nums")}
        />
      </noscript>
    </>
  );
}

const noSubscription = () => () => {};
const isClient = () => true;
const isServer = () => false;

function stringOf(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
