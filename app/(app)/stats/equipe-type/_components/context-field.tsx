/**
 * « Ce que les chiffres ne savent pas » — the one input on this screen that is not a filter
 * (decision 204).
 *
 * The season gives the model minutes, goals and notes. It cannot give it the opponent, who is away
 * this Sunday, or who is back from an injury and should not play ninety minutes, and those are exactly
 * the facts that move a seven. So there is a short free-text field, and submitting it re-asks.
 *
 * ## Why it is a Server Component with a Server Action, and not `useActionState`
 *
 * The typed sentence ends up in the URL (`?contexte=…`), like the two selects beside it, because the
 * question on this screen is a view of the URL: an answer worth reading is an answer worth sending to
 * somebody, and one worth reloading. `askWithContext` therefore redirects rather than returning state,
 * which also means the field works with no JavaScript — no `"use client"`, no bundle, no hydration.
 *
 * It sits **below** the pitch with `SevenControls`, for the reason `controls.tsx` argues at length: the
 * reader meets the answer first and the ways of asking a different question after it.
 *
 * Nothing here is explained on hover (decision 072): the hint under the field is printed, and it says
 * what an empty field means rather than leaving it to be discovered.
 */

import { Button, Field, Textarea } from "@/components/ui";
import {
  CONTEXT_MAX_LENGTH,
  CONTEXT_PARAM,
  CRITERION_PARAM,
  SEVEN_CONTEXT_HINT_FR,
  SEVEN_CONTEXT_LABEL_FR,
  SEVEN_CONTEXT_PLACEHOLDER_FR,
  SEVEN_CONTEXT_SUBMIT_FR,
  type BestSevenQuery,
} from "@/lib/stats/best-seven-copy";

import { askWithContext } from "@/lib/stats/actions";

export function SevenContextField({
  query,
  context,
  competitionParam,
}: {
  query: BestSevenQuery;
  /** What is in the URL now, so a reload shows the sentence the seven was reasoned from. */
  context: string;
  competitionParam: string;
}) {
  return (
    <form action={askWithContext} className="space-y-2">
      {/* The seven and the competition travel with the context, so submitting the field never silently
          resets the two selects above it. */}
      <input type="hidden" name={CRITERION_PARAM} value={query.seven} />
      <input type="hidden" name={competitionParam} value={query.competitionId ?? ""} />

      <Field
        htmlFor="equipe-type-contexte"
        label={SEVEN_CONTEXT_LABEL_FR}
        optional
        hint={SEVEN_CONTEXT_HINT_FR}
      >
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            name={CONTEXT_PARAM}
            rows={3}
            maxLength={CONTEXT_MAX_LENGTH}
            placeholder={SEVEN_CONTEXT_PLACEHOLDER_FR}
            aria-describedby={describedBy}
            /* Uncontrolled, with a `key` — the same trade as the selects: the sentence stays on screen
               while the navigation runs, and a URL that changes without this form remounts it. */
            key={context}
            defaultValue={context}
          />
        )}
      </Field>

      <Button type="submit" variant="secondary" fullWidth>
        {SEVEN_CONTEXT_SUBMIT_FR}
      </Button>
    </form>
  );
}
