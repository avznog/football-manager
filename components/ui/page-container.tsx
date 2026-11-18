import type { ComponentPropsWithoutRef } from "react";

import { cn } from "./cn";

/**
 * How wide a page is on desktop (decision 227). **Below `md:` it does nothing at all** — the phone
 * layout is the full width of the screen and stays byte-for-byte what it was.
 *
 * - `read` — the default, and what every page that does not say otherwise gets: the shell's <main>
 *   box, 48rem with its padding, 720 px of content. Declaring it changes nothing; it exists so a page
 *   can say what it is.
 * - `form` — a form page (new match, edit match, delete): the content narrows to 32rem and centres, so
 *   a team name is not a 720 px field and the submit button sits under the fields it submits.
 * - `wide` — a page whose content is a grid of boards (stats, équipe type, compositions): it widens
 *   the shell's <main> itself to 72rem, through a `:has()` the shell carries. A page cannot widen its
 *   parent any other way, and doing it this way keeps `read` the default for every page nobody has
 *   looked at — none of them moves.
 *
 * Renders the page's root element, so a page swaps its `<div className="space-y-4">` for
 * `<PageContainer width="form" className="space-y-4">` and its mobile classes are untouched.
 */
export type PageWidth = "form" | "read" | "wide";

export type PageContainerProps = ComponentPropsWithoutRef<"div"> & { width?: PageWidth };

const WIDTH_CLASS: Record<PageWidth, string> = {
  form: "md:mx-auto md:max-w-form",
  read: "",
  wide: "",
};

export function PageContainer({ width = "read", className, ...props }: PageContainerProps) {
  return <div data-page-width={width} className={cn(WIDTH_CLASS[width], className)} {...props} />;
}
