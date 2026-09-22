import { cn } from "./cn";

const SIZES = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
} as const;

export type SpinnerProps = {
  size?: keyof typeof SIZES;
  className?: string;
  /** Announced to screen readers while something is in flight. */
  label?: string;
};

/**
 * Functional (not decorative) motion: the only animation that survives
 * `prefers-reduced-motion: reduce`, via the `fm-spinner` class.
 */
export function Spinner({
  size = "sm",
  className,
  label = "Chargement…",
}: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className={cn("fm-spinner animate-spin", SIZES[size], className)}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="2.5"
          className="opacity-25"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
