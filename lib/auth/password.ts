import "server-only";

import { hash, verify } from "@node-rs/argon2";
import { verify as verifyBcrypt } from "@node-rs/bcrypt";

/**
 * Argon2id parameters. OWASP's recommended baseline (19 MiB, 2 iterations, 1 lane) — strong
 * enough for a password-only login (decision 008) while staying under a serverless function's
 * memory and time budget.
 */
const OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * The three bcrypt prefixes that can appear in a hash imported from the team's previous app
 * (decision 200). `$2a$` and `$2b$` are what that database actually holds; `$2y$` is the PHP
 * variant, accepted because it is the same algorithm and costs nothing to recognise.
 *
 * `$2x$` is deliberately absent: it exists only to reproduce a 2011 PHP bug, no hash we are
 * importing carries it, and a hash we cannot name reads as a wrong password rather than as a
 * guess.
 */
const BCRYPT_PREFIXES = ["$2a$", "$2b$", "$2y$"] as const;

/** Whether a stored hash is a bcrypt one, decided from its prefix and never by trying it. */
export function isBcryptHash(storedHash: string): boolean {
  return BCRYPT_PREFIXES.some((prefix) => storedHash.startsWith(prefix));
}

/**
 * The outcome of checking a password against a stored hash.
 *
 * `needsUpgrade` is true only when `ok` is: re-hashing needs the plaintext to have been proved
 * right, so a failed attempt never rewrites anything.
 */
export type PasswordVerification = {
  ok: boolean;
  needsUpgrade: boolean;
};

/** Always argon2id. Nothing in this application ever writes a bcrypt hash. */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/**
 * Checks a password against whatever algorithm the stored hash was made with, and says whether
 * that hash should be rewritten.
 *
 * The algorithm is read from the prefix, not discovered by trying argon2 and catching the
 * failure: a fallback on an exception cannot tell « this hash is bcrypt » from « this hash is
 * corrupt », and we want the second to stay a wrong password. Anything without a bcrypt prefix
 * goes to argon2, which is what this function has always done with a malformed hash — it fails
 * there and reads as a wrong password.
 */
export async function verifyPassword(
  storedHash: string,
  plain: string,
): Promise<PasswordVerification> {
  if (isBcryptHash(storedHash)) {
    try {
      // Note the argument order: `@node-rs/bcrypt` takes the password first, argon2 the hash.
      const ok = await verifyBcrypt(plain, storedHash);
      return { ok, needsUpgrade: ok };
    } catch {
      // A malformed hash must read as "wrong password", never as an exception that leaks detail.
      return { ok: false, needsUpgrade: false };
    }
  }

  try {
    return { ok: await verify(storedHash, plain, OPTIONS), needsUpgrade: false };
  } catch {
    // Same here: argon2 throws on a hash it cannot parse, and that is a refusal, not an error.
    return { ok: false, needsUpgrade: false };
  }
}
