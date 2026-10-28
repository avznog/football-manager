"use client";

/**
 * A minute, and beside it the added time — « 30 » and « +2 » (decision 218).
 *
 * ## Why two boxes and not one
 *
 * Decision 215 let the field hold `30+2`, which is the notation the label uses, and on a desktop that
 * is fine. On a phone it is not: `inputMode="numeric"` is what makes the keyboard open on digits, and
 * **that keyboard has no `+` key**. The owner found it immediately — « I feel that on the phone there
 * is no possibility to add "+1", as the keyboard is only numbers ». A text keyboard would have the
 * `+` and would also offer every letter for a field that wants three digits, which is worse.
 *
 * So the `+` stops being something to type. Two numeric boxes, and this component owns the one string
 * the server reads. His own description of the behaviour is the spec: « add another field for
 * additional time, that, if filled up with a minute, changes the first field to either 30 or 60. »
 *
 * ## The snap, which is the whole of the interaction
 *
 * Filling the added-time box means « this happened in added time », and added time only exists at the
 * end of a period — so the minute box becomes that period's end. He is looking at a goal the screen
 * calls « 36’ », realises it was in the second half's added time, types 3, and the boxes read 60 and
 * 3: « 60+3 ». A goal at 12′ would snap to 30. `snapToPeriodEnd` is the rule and it is pure, so a
 * 3×20 snaps to 20, 40 or 60 without this component knowing anything about it.
 *
 * Emptying the added-time box leaves the snapped minute where it is rather than restoring what was
 * there before. That is deliberate: undoing a snap by guessing what he meant two keystrokes ago is
 * how a minute changes without anyone asking for it, and 60 is a true minute he can edit.
 *
 * ## One string, composed here
 *
 * The parent keeps `30+2` — the value the form posts and the server validates — and never sees the
 * two halves. So there is one representation of a minute in the app and this component is the only
 * place that splits it, which is what stops the two boxes and the wire drifting apart.
 */

import { Input } from "@/components/ui/input";
import { periodEndMinutes, snapToPeriodEnd, type PeriodsConfig } from "@/lib/match/clock";

export type MinuteFieldProps = {
  /** `56`, `30+2`, or `""` for « je ne sais plus ». */
  value: string;
  onChange: (value: string) => void;
  periods: PeriodsConfig;
  /** Posted under this name when set; « Ajouter un changement » builds its own FormData instead. */
  name?: string;
  /** « Minute de l’action » — the accessible name of the first box. */
  label: string;
  invalid?: boolean;
};

/** `30+2` → `["30", "2"]`, `56` → `["56", ""]`. Anything unparseable keeps the text in the first box. */
function split(value: string): [string, string] {
  const at = value.indexOf("+");
  return at < 0 ? [value, ""] : [value.slice(0, at), value.slice(at + 1)];
}

export function MinuteField({
  value,
  onChange,
  periods,
  name,
  label,
  invalid = false,
}: MinuteFieldProps) {
  const [base, extra] = split(value);
  const ends = periodEndMinutes(periods);

  const setBase = (next: string) => {
    const digits = next.replace(/[^0-9]/g, "").slice(0, 3);
    onChange(extra === "" ? digits : `${digits}+${extra}`);
  };

  const setExtra = (next: string) => {
    const digits = next.replace(/[^0-9]/g, "").slice(0, 2);
    if (digits === "" || digits === "0") {
      // « +0 » is not added time, it is no added time: drop the suffix and keep the minute.
      onChange(base);
      return;
    }
    // The snap. Only on the way in, and only from whatever the minute box holds right now.
    const snapped = extra === "" ? snapToPeriodEnd(base === "" ? null : Number(base), periods) : base;
    onChange(`${snapped}+${digits}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <Input
        aria-label={label}
        type="text"
        inputMode="numeric"
        maxLength={3}
        placeholder="?"
        value={base}
        invalid={invalid}
        onChange={(event) => setBase(event.target.value)}
        className="w-16 min-h-11 text-center"
      />

      <span aria-hidden="true" className="text-lg text-ink-muted">
        +
      </span>

      {/*
        Empty is the ordinary case, so it carries no `0`: a box showing 0 reads as « zero minutes of
        added time », which is a claim, where empty reads as « not in added time », which is a state.
      */}
      <Input
        aria-label={`Temps additionnel, en minutes (la minute passe alors à ${ends.join(" ou ")})`}
        type="text"
        inputMode="numeric"
        maxLength={2}
        placeholder=""
        value={extra}
        onChange={(event) => setExtra(event.target.value)}
        className="w-14 min-h-11 text-center"
      />

      <span className="text-sm text-ink-muted">
        {value === ""
          ? "minute inconnue"
          : extra !== ""
            ? "temps additionnel"
            : "ᵉ minute"}
      </span>
    </div>
  );
}
