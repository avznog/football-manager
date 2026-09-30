"use client";

import { useSyncExternalStore } from "react";

/**
 * The wall clock, once a second, shared by every subscriber.
 *
 * Game mode needs "now" for two things: to advance the displayed clock, and to stamp an action the
 * moment it is tapped. Neither may be read during render — `Date.now()` in a component body makes
 * the render impure and, worse, makes the server render and the first client render disagree, which
 * is a hydration mismatch on the biggest number on the screen.
 *
 * So it is an external store: `null` until the browser has mounted (both renders then compute the
 * match state as of its last event, which is identical on both sides), then a value that changes
 * once a second. One interval for the whole page, started on the first subscription and stopped with
 * the last, so a backgrounded tab is not paying for a clock nobody is reading.
 */
let current = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const notify of listeners) notify();
    }, 1_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Cached on purpose: `useSyncExternalStore` compares snapshots by identity. */
function getSnapshot(): number {
  return current;
}

function getServerSnapshot(): number {
  return 0;
}

export function useNowMs(): number | null {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return value === 0 ? null : value;
}
