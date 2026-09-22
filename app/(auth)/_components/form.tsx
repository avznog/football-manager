"use client";

/**
 * The few form primitives the two auth screens need.
 *
 * Deliberately local to the `(auth)` group: the rest of the app uses the shared set in
 * `components/ui`. Login and joining are the only screens an unauthenticated stranger can
 * reach, so they stay self-contained and cheap to render.
 */

import { useFormStatus } from "react-dom";

import type { FormState } from "@/lib/auth/validation";

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-ink " +
  "placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-accent disabled:opacity-60";

type FieldProps = {
  label: string;
  name: string;
  /** Rendered under the label, before the input — for "en minuscules, sans espaces". */
  hint?: string;
  errors?: string[];
} & Omit<React.ComponentProps<"input">, "name" | "className" | "id">;

export function Field({ label, name, hint, errors, ...input }: FieldProps) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = errors?.length ? `${name}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      <input
        {...input}
        id={name}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={INPUT_CLASS}
      />
      {errors?.length ? (
        <p id={errorId} className="text-sm text-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

/** The form-wide error: wrong credentials, or anything not attached to one field. */
export function FormError({ state }: { state: FormState }) {
  const message = state?.error ?? state?.fieldErrors?._?.[0];
  if (!message) return null;

  return (
    <p
      role="alert"
      className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
    >
      {message}
    </p>
  );
}

/**
 * Disables itself while the action is in flight. `useFormStatus` only reports the status of
 * the enclosing <form>, which is why this has to be its own component.
 */
export function SubmitButton({ children, pending }: { children: string; pending?: string }) {
  const { pending: inFlight } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={inFlight}
      className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-base font-semibold text-accent-ink transition-opacity disabled:opacity-60"
    >
      {inFlight ? (pending ?? "…") : children}
    </button>
  );
}
