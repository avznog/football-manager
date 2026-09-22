/**
 * Invite codes.
 *
 * A coach reads one out or pastes it into WhatsApp, and a player types it on a phone keyboard
 * (decision 008). So: uppercase only, and no character that can be misread for another —
 * no O/0, no I/1/L, no S/5, no B/8, no Z/2. What is left is unambiguous out loud and in print.
 *
 * Pure: no database, no crypto import at module scope, so it is trivially testable. The
 * randomness source is injected, which is how the tests get determinism.
 */

/** 24 characters. Ambiguous glyphs removed on purpose — see above. */
export const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY3467";

/** Long enough that guessing is pointless: 24^8 ≈ 1.1e11 for a code that lives seven days. */
export const CODE_LENGTH = 8;

export type RandomBytes = (size: number) => Uint8Array;

/**
 * Builds a code from the given entropy source.
 *
 * Rejection sampling, not modulo: 256 is not a multiple of 24, so `byte % 24` would make the
 * first 16 letters of the alphabet slightly likelier than the last 8. It costs nothing to do
 * it properly.
 */
export function generateInviteCode(randomBytes: RandomBytes, length = CODE_LENGTH): string {
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length; // 240
  let code = "";

  while (code.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= limit) continue; // would bias the result — draw again
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === length) break;
    }
  }

  return code;
}

/** How a code is displayed: grouped in fours, because that is how people read one aloud. */
export function formatInviteCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

/** How long a fresh invite stays valid. Short enough that a leaked WhatsApp export is stale. */
export const INVITE_TTL_DAYS = 7;
