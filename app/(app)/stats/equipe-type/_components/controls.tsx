"use client";

/**
 * The four controls of `/stats/equipe-type` — criterion, direction, shape, competition — and not one
 * of them is state.
 *
 * ## Why they are selects, and why they are under the pitch
 *
 * They were four rows of `min-h-11` chips in the page `<header>`: about 216 px of controls above the
 * thing they control, so the reader met every way of asking the question before he ever saw an answer.
 * Now they are four labelled `<select>`s in a two-column grid **below** the pitch — two rows of ~74 px
 * instead of four of 48 px, and a 48 px tap target instead of 44 px.
 *
 * « Smaller » is bought by layout and never by type size. The select keeps `components/ui`'s
 * `text-base`, which `input.tsx` sets deliberately: anything under 16 px makes iOS Safari zoom the page
 * the moment the picker opens, and a screen that zooms when you filter it is not smaller, it is broken.
 *
 * ## Still a view of the URL, still working with JavaScript off
 *
 * `app/(app)/stats/_components/filters.tsx` records why the chips were `<Link>`s: the filter is a *view
 * of the URL*, so `?critere=ratings` is shareable, survives a reload, and works with no JavaScript. Both
 * properties are kept, by two paths to the same query string:
 *
 * - **with JavaScript**, `onChange` pushes `equipeTypeHref(next)` — the one place that knows the
 *   parameter names and that omits whatever is at its default;
 * - **without**, the surrounding `<form method="get">` submits the four selects itself, with the
 *   `<noscript>` button as the only thing that can trigger it. That path sends `?critere=` for a select
 *   left at its default, which `equipeTypeHref` never writes, so the page's four parsers have to tolerate
 *   an empty value — pinned in `best-seven-copy.test.ts`, not hoped for.
 *
 * `scroll={false}` (decision 100) still matters and now means the opposite thing: the controls sit
 * *below* the pitch, so a navigation that jumped to the top of the document would put the reader above
 * the select he just used and above the answer it changed. Measured at 393 px, that answer is the **list**
 * of the seven and not the pitch: the SVG ends at 780 and this form starts at 1217, so the drawing and a
 * select can never be on screen together, while the list of seven names and figures sits directly above
 * them. Decision 116 carries the numbers.
 *
 * Data in, URL out. No fetching, no derived sentence of its own: this is the second client component on
 * the screen and it is kept the smaller of the two.
 *
 * ## `defaultValue` with a `key`, and not `value`
 *
 * The selects are deliberately **not** controlled. A controlled `value` comes from the server render, so
 * between the tap and the new screen — the two seconds COORDINATION.md is about — the picker would snap
 * back to the option the reader had just abandoned. `defaultValue` leaves the choice on screen while the
 * navigation runs. The `key` is what keeps that honest in the other direction: a URL that changes without
 * this form (the « et la pire équipe ? » link under the notes, the back button) remounts the select so it
 * never shows a choice the pitch above it has stopped obeying.
 */

import { useRouter } from "next/navigation";

import { Field, Select, buttonClassName } from "@/components/ui";
import type { CompetitionOption } from "@/lib/competition/options";
import { BEST_SEVEN_CRITERIA } from "@/lib/stats/best-seven";
import {
  ALL_COMPETITIONS_FR,
  CRITERION_CHIP_FR,
  CRITERION_PARAM,
  DIRECTION_OPTION_FR,
  DIRECTION_PARAM,
  DIRECTION_VALUES,
  FORMATION_PARAM,
  SEVEN_CONTROLS_SUBMIT_FR,
  SEVEN_CONTROL_LABEL_FR,
  equipeTypeHref,
  mostUsedFormationOptionFr,
  parseCriterion,
  parseDirection,
  showsCompetitionSelect,
  type BestSevenQuery,
} from "@/lib/stats/best-seven-copy";

/** `?competition=` and `?formation=` both mean « no override », and a select says that with `""`. */
const NONE = "";

export function SevenControls({
  query,
  competitions,
  formations,
  mostUsed,
  competitionParam,
}: {
  query: BestSevenQuery;
  competitions: readonly CompetitionOption[];
  /**
   * The shapes the team has actually played, most-used first — `getFormationUsage().formations`.
   * Never the whole catalogue: an option for a shape nobody has ever played would invite a seven laid
   * out on a formation this team does not use.
   */
  formations: readonly { formationId: string; label: string }[];
  /**
   * The shape chosen when nothing overrides it, named on the first option. Its **id** matters as much
   * as its label: it is how the list avoids offering the same shape twice (see
   * `resolveFormationOverride`, which is the other half of that rule).
   */
  mostUsed: { formationId: string; label: string } | null;
  /**
   * The competition key, `/stats`'s own — passed in rather than imported so this client bundle does not
   * pull `filters.tsx` and its `<Link>` chips along with it. It is the `name` the no-JavaScript form
   * submits *and* the one `equipeTypeHref` writes, so the two paths cannot drift.
   */
  competitionParam: string;
}) {
  const router = useRouter();

  const go = (next: BestSevenQuery) => {
    router.push(equipeTypeHref(next, competitionParam), { scroll: false });
  };

  /**
   * The most-played shape is named once, by the first option, and is **not repeated** in the list.
   *
   * It used to be in both, and the two entries then said opposite things about the same formation: the
   * first was labelled « 1-3-2-1 (la plus jouée) », and choosing the second set `formation=` in the URL,
   * which made the card under the pitch print « … Ce n'est pas la forme que l'équipe a le plus jouée. »
   */
  const others = formations.filter(
    (formation) => formation.formationId !== mostUsed?.formationId,
  );

  return (
    <form method="get" action="/stats/equipe-type" className="space-y-3">
      {/* Two columns at 390 px: four labelled selects in two rows, where four chip rows took four.
          `sm:grid-cols-4` only because the labels are short enough to sit on one line on a tablet. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* One criterion at a time, on purpose: a seven that mixed goals and notes would be ranked on
            a scale nobody could name, and rule 1 of `best-seven.ts` is that every criterion is its own
            rate. */}
        <Field htmlFor="equipe-type-critere" label={SEVEN_CONTROL_LABEL_FR.criterion}>
          {({ id }) => (
            <Select
              id={id}
              name={CRITERION_PARAM}
              key={query.criterion}
              defaultValue={query.criterion}
              onChange={(event) => go({ ...query, criterion: parseCriterion(event.target.value) })}
            >
              {BEST_SEVEN_CRITERIA.map((criterion) => (
                <option key={criterion} value={criterion}>
                  {CRITERION_CHIP_FR[criterion]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* Rule 6: the worst seven is the best seven of the negated criterion, so it costs one option
            and it is the half of the truth a « meilleure équipe » screen normally hides. The option
            values are the URL's own words, because the no-JavaScript form submits them verbatim. */}
        <Field htmlFor="equipe-type-sens" label={SEVEN_CONTROL_LABEL_FR.direction}>
          {({ id }) => (
            <Select
              id={id}
              name={DIRECTION_PARAM}
              key={query.direction}
              defaultValue={DIRECTION_VALUES[query.direction]}
              onChange={(event) => go({ ...query, direction: parseDirection(event.target.value) })}
            >
              {(["best", "worst"] as const).map((direction) => (
                <option key={direction} value={DIRECTION_VALUES[direction]}>
                  {DIRECTION_OPTION_FR[direction]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {others.length > 0 ? (
          <Field htmlFor="equipe-type-formation" label={SEVEN_CONTROL_LABEL_FR.formation}>
            {({ id }) => (
              <Select
                id={id}
                name={FORMATION_PARAM}
                key={query.formationId ?? NONE}
                defaultValue={query.formationId ?? NONE}
                onChange={(event) =>
                  go({
                    ...query,
                    formationId: event.target.value === NONE ? null : event.target.value,
                  })
                }
              >
                <option value={NONE}>{mostUsedFormationOptionFr(mostUsed?.label ?? null)}</option>
                {others.map((formation) => (
                  <option key={formation.formationId} value={formation.formationId}>
                    {formation.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        {/* Kept working across this screen, as on `/stats`: a seven of the championship is a different
            claim from a seven of the season, and decision 107 keys it by id so a rename cannot break a
            bookmark. With a single competition there is nothing to choose between — *unless* the reader
            arrived already filtered on it, in which case the select is his only way back to « Toutes »
            and the empty state says so out loud. `showsCompetitionSelect` carries that rule and its
            test. */}
        {showsCompetitionSelect({
          competitionCount: competitions.length,
          competitionId: query.competitionId,
        }) ? (
          <Field htmlFor="equipe-type-competition" label={SEVEN_CONTROL_LABEL_FR.competition}>
            {({ id }) => (
              <Select
                id={id}
                name={competitionParam}
                key={query.competitionId ?? NONE}
                defaultValue={query.competitionId ?? NONE}
                onChange={(event) =>
                  go({
                    ...query,
                    competitionId: event.target.value === NONE ? null : event.target.value,
                  })
                }
              >
                <option value={NONE}>{ALL_COMPETITIONS_FR}</option>
                {competitions.map((competition) => (
                  <option key={competition.id} value={competition.id}>
                    {competition.labelFr}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </div>

      {/* The only way to submit the form, and only a reader without JavaScript has to: with it, the
          `onChange` above has already navigated by the time a thumb could reach a button. */}
      <noscript>
        <button type="submit" className={buttonClassName({ variant: "secondary", fullWidth: true })}>
          {SEVEN_CONTROLS_SUBMIT_FR}
        </button>
      </noscript>
    </form>
  );
}
