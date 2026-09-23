/**
 * Makes an empty production database usable. Run once, after `npm run db:migrate`:
 *
 *   SUPER_ADMIN_USERNAME=benjamin SUPER_ADMIN_PASSWORD='…' npm run db:bootstrap
 *
 * ## Why this script has to exist
 *
 * Signing up is invite-only by design (decision 008): you join a team with a code, and codes are
 * issued by a coach. In a fresh database there is no coach, so there is no code, so no account can
 * be created — and `npm run db:seed`, which is where the super admin was being created, refuses to
 * run in production and rightly so: nobody wants a demo season in their real season's stats.
 *
 * So a freshly deployed instance had reference data and no way in. This closes that loop, and
 * nothing more: it creates **one** account, marks it super admin, and stops. The team, the players
 * and their invites are then made from the application, by a human, the way every later team will
 * be.
 *
 * ## Properties
 *
 * - **Idempotent.** Run it twice and the second run re-hashes the password and confirms the flag.
 *   That makes it the password reset of last resort for the one account that cannot ask a coach.
 * - **Safe in production.** It writes no fixture data, only the positions, the built-in formations
 *   and the one user.
 * - **Refuses a weak password**, and refuses the `change-me` the demo seed defaults to: this
 *   account can read and rewrite every team on the instance.
 */

// Must come first: nothing below may read `process.env` before `.env.local` is loaded.
import "./load-env";

import { eq } from "drizzle-orm";

import { db } from "./client";
import { seedReference } from "./seed-reference";
import { users } from "./schema";
import { hashPassword } from "../lib/auth/password";
import { PASSWORD_MIN_LENGTH, usernameSchema } from "../lib/auth/validation";

/** Defaults that exist for the demo seed's convenience and must never reach a real instance. */
const FORBIDDEN_PASSWORDS = new Set(["change-me", "changeme", "password", "motdepasse"]);

async function main(): Promise<void> {
  const rawUsername = process.env.SUPER_ADMIN_USERNAME;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!rawUsername || !password) {
    throw new Error(
      "SUPER_ADMIN_USERNAME et SUPER_ADMIN_PASSWORD sont requis.\n" +
        "  Exemple : SUPER_ADMIN_USERNAME=benjamin SUPER_ADMIN_PASSWORD='…' npm run db:bootstrap",
    );
  }

  const parsed = usernameSchema.safeParse(rawUsername);
  if (!parsed.success) {
    throw new Error(`SUPER_ADMIN_USERNAME invalide : ${parsed.error.issues[0].message}`);
  }
  const username = parsed.data;

  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `SUPER_ADMIN_PASSWORD doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`,
    );
  }
  if (FORBIDDEN_PASSWORDS.has(password.toLowerCase())) {
    throw new Error(
      "SUPER_ADMIN_PASSWORD est un mot de passe d'exemple. Ce compte peut tout lire et tout " +
        "réécrire : choisis-en un vrai.",
    );
  }

  console.log("Données de référence…");
  await seedReference();

  const existing = await db.query.users.findFirst({
    where: eq(users.username, username),
    columns: { id: true, isSuperAdmin: true },
  });

  const passwordHash = await hashPassword(password);

  if (existing) {
    // Re-running is how the owner resets their own password: there is no coach above them to ask.
    await db
      .update(users)
      .set({ passwordHash, isSuperAdmin: true })
      .where(eq(users.id, existing.id));
    console.log(`Compte « ${username} » mis à jour (mot de passe réinitialisé, super admin).`);
  } else {
    await db.insert(users).values({
      username,
      displayName: "Coach",
      passwordHash,
      isSuperAdmin: true,
    });
    console.log(`Compte « ${username} » créé (super admin).`);
  }

  console.log(
    "\nProchaine étape : connecte-toi sur /connexion, puis crée ton équipe depuis l'écran " +
      "« Rejoindre une équipe » et invite tes joueurs depuis « Équipe ».",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
