"use client";

/**
 * A page inside the application threw. The shell survives, so the tab bar is still the way out and
 * this only has to replace the content — hence no home link.
 *
 * There was no error boundary anywhere in the app before this file: any failing query took the
 * whole screen to Next's built-in error page, in English and with no navigation.
 */

import { ErrorScreen } from "@/components/errors/error-screen";

export default function AppError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Next's third boundary prop. `ErrorScreen` takes it and explains why it does not use it. */
  retry: () => void;
}) {
  return <ErrorScreen error={error} reset={reset} retry={retry} />;
}
