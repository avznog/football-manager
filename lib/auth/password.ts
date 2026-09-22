import "server-only";

import { hash, verify } from "@node-rs/argon2";

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

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain, OPTIONS);
  } catch {
    // A malformed hash must read as "wrong password", never as an exception that leaks detail.
    return false;
  }
}
