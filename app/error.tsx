"use client";

/**
 * The boundary above the shell, and the one that matters most in production.
 *
 * `app/(app)/error.tsx` cannot catch a failure in the layout that renders it: an error thrown by
 * `requireTeamContext()` in `app/(app)/layout.tsx` is caught by the *parent* boundary, which is this
 * file. That is not a hypothetical — it is what a Neon connection limit or a cold database looks
 * like, and it takes down the header and the tab bar with it. So this one stands alone and has to
 * offer its own way back.
 *
 * There is deliberately no `global-error.tsx`: it would only ever fire on a failure of the root
 * layout, which holds no data and awaits nothing, and an unreachable screen cannot be verified at
 * 390 px in both themes the way `CLAUDE.md` asks.
 */

import { ErrorScreen } from "@/components/errors/error-screen";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="gutter-px flex min-h-svh flex-col items-center justify-center">
      <ErrorScreen digest={error.digest} reset={reset} withHomeLink />
    </main>
  );
}
