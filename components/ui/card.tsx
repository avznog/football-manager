import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "./cn";

export type CardProps = ComponentPropsWithRef<"section"> & {
  /** Rendered as the card heading. Omit for a bare surface container. */
  title?: ReactNode;
  /** Small muted line under the title. */
  description?: ReactNode;
  /** Right-hand side of the header row: a link, a button, a badge. */
  action?: ReactNode;
  /** Heading level, so a page keeps a correct outline. */
  as?: "h2" | "h3" | "h4";
  /** Drop the inner padding when the body owns its own layout (lists, tables). */
  flush?: boolean;
};

export function Card({
  title,
  description,
  action,
  as: Heading = "h2",
  flush = false,
  className,
  children,
  ...props
}: CardProps) {
  const hasHeader = Boolean(title || description || action);

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/60 bg-surface",
        className,
      )}
      {...props}
    >
      {hasHeader ? (
        <header
          className={cn(
            "flex items-start justify-between gap-3 px-4 pt-4",
            flush ? "pb-4" : "pb-2",
          )}
        >
          <div className="min-w-0">
            {title ? (
              <Heading className="truncate text-base font-semibold text-ink">
                {title}
              </Heading>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn(!flush && "p-4", !flush && hasHeader && "pt-2")}>
        {children}
      </div>
    </section>
  );
}
