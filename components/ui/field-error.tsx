import type { ComponentPropsWithRef } from "react";

import { cn } from "./cn";

export type FieldErrorProps = Omit<
  ComponentPropsWithRef<"p">,
  "children"
> & {
  /**
   * One message, or the list a Zod `flatten().fieldErrors` entry gives you.
   * Renders nothing when empty, so it can stay in the tree unconditionally.
   */
  children?: string | string[] | null | undefined;
};

export function FieldError({ children, className, ...props }: FieldErrorProps) {
  const messages = (Array.isArray(children) ? children : [children]).filter(
    (message): message is string => Boolean(message),
  );

  if (messages.length === 0) return null;

  return (
    <p
      // Announced immediately: a rejected field must interrupt, otherwise the
      // user keeps submitting. Also wire it up with `aria-describedby` (see
      // `Field`) so the message is read when the control regains focus.
      role="alert"
      className={cn(
        "flex items-start gap-1.5 text-sm font-medium text-danger",
        className,
      )}
      {...props}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="mt-0.5 size-4 shrink-0"
      >
        <path
          fillRule="evenodd"
          d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.75 4.5a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 1.5 0v-4ZM10 13a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
          clipRule="evenodd"
        />
      </svg>
      <span>{messages.join(" ")}</span>
    </p>
  );
}
