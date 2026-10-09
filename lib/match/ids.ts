/**
 * Ids derived from what they identify rather than drawn at random.
 *
 * Invariant 6 makes `client_event_id` the key of idempotency: the same id twice is one row. A random
 * uuid is right for a tap — two taps are two goals — and wrong for anything the app writes on its own
 * or from a form, where « the same thing, sent twice » must collapse into one. Two places need that:
 * the retro sheet (`lib/retro/log.ts`, a submission is a pure function of the form) and the
 * composition game mode applies when it opens (decision 153: two phones opening at once write one
 * event). Here, in `lib/match`, because both depend on it and neither should depend on the other.
 *
 * FNV-1a, four times over the same seed with four different offset bases. Not a cryptographic hash
 * and not meant to be one — a collision would mean two *different* inputs for the same match hashing
 * together. The version and variant nibbles are forced, so the result is a well-formed uuid for
 * `matchEventInputSchema`.
 */
export function deterministicUuid(parts: readonly (string | number | null | undefined)[]): string {
  const seed = parts.map((part) => (part === null || part === undefined ? "" : part)).join("");
  const words = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((base) => fnv1a(seed, base));
  const hex = words.map((word) => word.toString(16).padStart(8, "0")).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function fnv1a(input: string, base: number): number {
  let hash = base >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
