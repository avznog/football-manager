import { describe, expect, it } from "vitest";

import { inviteCodeSchema } from "@/lib/auth/validation";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  formatInviteCode,
  generateInviteCode,
} from "./invite-code";

/** A deterministic stand-in for `randomBytes`, cycling through the values it is given. */
function bytesFrom(values: number[]): (size: number) => Uint8Array {
  let cursor = 0;
  return (size) =>
    Uint8Array.from({ length: size }, () => values[cursor++ % values.length]);
}

describe("generateInviteCode", () => {
  it("produces a code of the expected length, from the safe alphabet only", () => {
    const code = generateInviteCode(bytesFrom([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code).toHaveLength(CODE_LENGTH);
    for (const character of code) expect(CODE_ALPHABET).toContain(character);
  });

  it("contains no glyph that can be misread over WhatsApp", () => {
    // O/0, I/1/L, S/5, B/8, Z/2 are all excluded (decision 008).
    for (const banned of "OI1LS5B8Z20") {
      expect(CODE_ALPHABET).not.toContain(banned);
    }
  });

  it("discards biased bytes instead of folding them with a modulo", () => {
    // 240..255 would map back onto the first 16 letters. They must be skipped, so a source
    // that yields 250 then 0 gives the same letter as a source that yields just 0.
    expect(generateInviteCode(bytesFrom([250, 0]), 2)).toBe(
      generateInviteCode(bytesFrom([0]), 2),
    );
  });

  it("keeps drawing until it has enough usable bytes", () => {
    // Every byte in the first draw is unusable; the loop must ask for more rather than
    // returning a short code.
    const code = generateInviteCode(bytesFrom([255, 255, 255, 255, 255, 255, 255, 255, 7]), 4);
    expect(code).toBe(CODE_ALPHABET[7].repeat(4));
  });

  it("round-trips through the form validation, formatted or not", () => {
    const code = generateInviteCode(bytesFrom([3, 9, 14, 20, 1, 5, 11, 23]));
    expect(inviteCodeSchema.parse(code)).toBe(code);
    expect(inviteCodeSchema.parse(formatInviteCode(code))).toBe(code);
    expect(inviteCodeSchema.parse(formatInviteCode(code).toLowerCase())).toBe(code);
  });
});

describe("formatInviteCode", () => {
  it("groups in fours without a trailing separator", () => {
    expect(formatInviteCode("ACDEFGHJ")).toBe("ACDE-FGHJ");
    expect(formatInviteCode("ACDE")).toBe("ACDE");
    expect(formatInviteCode("ACDEF")).toBe("ACDE-F");
  });
});
