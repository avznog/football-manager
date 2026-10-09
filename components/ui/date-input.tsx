"use client";

/**
 * A native date / date-and-time picker, with the value it holds echoed underneath in French.
 *
 * **Why.** Every date the app *formats* is `DD/MM/YYYY` and every clock 24-hour (decision 109), but
 * `<input type="date">` and `<input type="datetime-local">` render in the **browser's** locale, which
 * no stylesheet and no formatter can reach: on a phone set to English the owner picks a kick-off in
 * `MM/DD/YYYY` with an AM/PM clock, inside an app that says `27/09/2026` everywhere else.
 *
 * The native control stays — it is still the best thing under a thumb, and a masked text field or a
 * hand-rolled calendar would be worse on the phone this app is for. What is added is one quiet line
 * under it saying, in the app's own shape, what the picker currently holds. A confirmation, not a
 * label.
 *
 * **The input keeps its own semantics exactly.** `name`, `defaultValue` / `value`, `required`, `min`,
 * `max` and the `Field` wiring are passed straight through, so the Server Action receives the same
 * field it always did and the form still posts **with JavaScript off** — the echo is then simply the
 * one rendered on the server from `defaultValue`, and it stops following the picker. Nothing else
 * changes.
 *
 * **The echo is `aria-hidden`.** It duplicates a value the control already announces, in a second
 * rendering, and decisions 116 and 117 are both about the cost of telling the reader who did not need
 * telling: 117 refused an `aria-label` that only screen readers would hear, and the `Field` contract
 * keeps a control's accessible *description* to its hint and its error. Appending « 14/03/2026 » to
 * either would make the control announce its value twice, in two formats, for a reader whose
 * assistive technology already speaks the date. The echo is a repair for a *visual* mismatch, so it is
 * addressed to the eye only.
 */

import { useState, type ChangeEvent } from "react";

import { formatInputValueFr } from "@/lib/calendar/time";
import { cn } from "./cn";
import { Input, type InputProps } from "./input";

export type DateInputProps = Omit<InputProps, "type"> & {
  /** `date` for a calendar day, `datetime-local` for a day and a wall clock. */
  type: "date" | "datetime-local";
};

export function DateInput({
  type,
  value,
  defaultValue,
  onChange,
  className,
  ...props
}: DateInputProps) {
  // Uncontrolled inputs (the match and « Guéri le » forms) need a mirror to write the echo
  // from, exactly as `MatchForm` mirrors its two numbers; a controlled one (the injury start date,
  // whose value also drives the `min` of the return date) is already the truth, so it is read
  // directly and the mirror is ignored. One component covers both rather than five copies of either.
  const [mirrored, setMirrored] = useState(stringOf(defaultValue));
  const current = value === undefined ? mirrored : stringOf(value);
  const echo = formatInputValueFr(current);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setMirrored(event.target.value);
    onChange?.(event);
  }

  return (
    <>
      <Input
        type={type}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        className={cn("tabular-nums", className)}
        {...props}
      />
      {/* Nothing at all when the picker is empty or holds something unreadable: a placeholder date
          would be a date the reader never chose, and « --/--/---- » is noise under an empty field. */}
      {echo ? (
        <p aria-hidden="true" className="text-sm text-ink-muted tabular-nums">
          {echo}
        </p>
      ) : null}
    </>
  );
}

function stringOf(value: InputProps["value" | "defaultValue"]): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
