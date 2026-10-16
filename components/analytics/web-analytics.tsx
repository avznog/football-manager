"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

import { redactAnalyticsUrl } from "@/lib/analytics/redact";

/**
 * Vercel Web Analytics, with the identifiers taken out of the path.
 *
 * This wrapper exists only because `beforeSend` is a **function**, and a function cannot be handed
 * from a Server Component to a Client Component — so the root layout renders this instead of
 * `<Analytics />` directly. The redaction itself lives in `lib/analytics/redact.ts`, pure and
 * tested; see the comment there for why the dashboard must never see a match or player id.
 */
export function WebAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}

/**
 * Never returns `null`: that would drop the page view entirely, and we want the count, just not
 * the id. Declared at module scope rather than inline so the prop is referentially stable across
 * renders — `<Analytics />` re-registers the callback whenever it changes.
 */
function beforeSend(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: redactAnalyticsUrl(event.url) };
}
