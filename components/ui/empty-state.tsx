import type { ReactNode } from "react";

import { cn } from "./cn";

export type EmptyStateProps = {
  /** French title, e.g. « Aucun match prévu ». */
  title: string;
  /** French explanation of what to do next. */
  description?: string;
  /** Inline SVG, 24×24 viewBox. Decorative. */
  icon?: ReactNode;
  /** Usually a `<Button>` or `<ButtonLink>`. */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-surface px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink-muted [&>svg]:size-6"
        >
          {icon}
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="text-base font-semibold text-ink">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
