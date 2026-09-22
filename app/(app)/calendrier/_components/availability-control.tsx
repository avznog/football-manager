"use client";

/**
 * « Je suis dispo / pas dispo / peut-être ».
 *
 * The single most-tapped control in the app, so it is built to two rules:
 *
 *  1. **One tap.** Choosing a segment submits immediately — no « Valider » to find afterwards.
 *  2. **It works without JavaScript.** The markup is a plain `<form>` bound to a Server Action
 *     with three native radios in it. With JS off, the fallback submit button stays on screen and
 *     the form posts the old-fashioned way. That matters at the side of a pitch on one bar of
 *     signal, which is exactly when somebody declares themselves unavailable.
 *
 * A Client Component because of rule 1 — and because `SegmentedControl` always attaches an
 * `onChange` to its radios, which a Server Component cannot serialise.
 */

import { useRef, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { AvailabilityStatus } from "@/db/schema";
import { AVAILABILITY_OPTIONS } from "@/lib/calendar/labels";
import { setMatchAvailability } from "@/lib/match/actions";
import { setTrainingAvailability } from "@/lib/training/actions";

export type AvailabilityControlProps = {
  kind: "match" | "training";
  teamId: string;
  /** The match id or the training id, depending on `kind`. */
  eventId: string;
  /** The viewer's current answer, or null if they have not answered yet. */
  value: AvailabilityStatus | null;
  /**
   * Radio group name. `SegmentedControl` derives its input ids from it, so a page that renders
   * two of these must give them different names.
   */
  name?: string;
  /** Read by screen readers in place of a visible heading. */
  legend?: string;
};

export function AvailabilityControl({
  kind,
  teamId,
  eventId,
  value,
  name = "status",
  legend = "Ta disponibilité",
}: AvailabilityControlProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const enhanced = useIsHydrated();

  const action = kind === "match" ? setMatchAvailability : setTrainingAvailability;
  const idField = kind === "match" ? "matchId" : "trainingId";

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name={idField} value={eventId} />

      <SegmentedControl
        name={name}
        legend={legend}
        options={AVAILABILITY_OPTIONS}
        defaultValue={value ?? undefined}
        // `requestSubmit` rather than `submit`: it goes through React's form handling, which is
        // what routes the post to the Server Action instead of doing a full navigation.
        onChange={() => formRef.current?.requestSubmit()}
      />

      <Footer showSubmit={!enhanced} />
    </form>
  );
}

/** Nothing to subscribe to: the value only ever changes once, at hydration. */
const NEVER_CHANGES = () => () => {};

/**
 * `false` in the HTML the server sends, `true` once React has taken over.
 *
 * `useSyncExternalStore` rather than a `useState` flipped in an effect: React re-renders on the
 * difference between the server snapshot and the client one, so there is no cascading render — and
 * with JavaScript disabled the HTML simply keeps the `false` rendering, which is exactly the
 * fallback we want.
 */
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

/** Lives inside the form so `useFormStatus` can see it. */
function Footer({ showSubmit }: { showSubmit: boolean }) {
  const { pending } = useFormStatus();

  if (showSubmit) {
    return (
      <Button type="submit" variant="secondary" size="sm" fullWidth pending={pending}>
        Valider ma réponse
      </Button>
    );
  }

  return (
    <p aria-live="polite" className="min-h-5 text-xs text-ink-subtle">
      {pending ? "Enregistrement…" : null}
    </p>
  );
}
