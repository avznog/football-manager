import { describe, expect, it } from "vitest";

import {
  inviteCodeSchema,
  joinWithNewAccountSchema,
  loginSchema,
  toFormState,
  usernameSchema,
} from "./validation";

describe("usernameSchema", () => {
  it("lowercases and trims, so KARIM and karim are the same account", () => {
    expect(usernameSchema.parse("  KaRiM ")).toBe("karim");
  });

  it("rejects spaces and accents — it is typed on a phone keyboard at speed", () => {
    expect(usernameSchema.safeParse("ka rim").success).toBe(false);
    expect(usernameSchema.safeParse("karím").success).toBe(false);
  });

  it("accepts the punctuation people actually use", () => {
    expect(usernameSchema.parse("karim.b_7-fc")).toBe("karim.b_7-fc");
  });
});

describe("inviteCodeSchema", () => {
  it("normalises what somebody pastes out of WhatsApp", () => {
    expect(inviteCodeSchema.parse(" abcd-1234 ")).toBe("ABCD1234");
    expect(inviteCodeSchema.parse("ab cd 12")).toBe("ABCD12");
  });

  it("measures length after normalising, not before", () => {
    // "a-b" is 3 characters of code, however it is spaced out.
    expect(inviteCodeSchema.safeParse("a-b").success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("does not apply the password policy to an existing password", () => {
    // A password set before a rule change must still let its owner in; a wrong one is
    // reported uniformly by the action instead.
    expect(loginSchema.safeParse({ username: "karim", password: "old" }).success).toBe(true);
  });

  it("still requires a password to be typed", () => {
    expect(loginSchema.safeParse({ username: "karim", password: "" }).success).toBe(false);
  });
});

describe("joinWithNewAccountSchema", () => {
  it("enforces the password minimum on a new account", () => {
    const base = { code: "ABCD1234", username: "karim", displayName: "Karim" };
    expect(joinWithNewAccountSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(joinWithNewAccountSchema.safeParse({ ...base, password: "assezlong" }).success).toBe(
      true,
    );
  });
});

describe("toFormState", () => {
  it("keys errors by field name so each input can show its own", () => {
    const result = joinWithNewAccountSchema.safeParse({
      code: "x",
      username: "K",
      displayName: "",
      password: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const state = toFormState(result.error);
    expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual([
      "code",
      "displayName",
      "password",
      "username",
    ]);
    expect(state.fieldErrors?.code?.[0]).toMatch(/trop court/);
  });
});
