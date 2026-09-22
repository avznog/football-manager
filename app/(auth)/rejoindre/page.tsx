import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/dal";
import { JoinWithExistingAccountForm, JoinWithNewAccountForm } from "./join-form";

export const metadata = { title: "Rejoindre une équipe" };

/**
 * Two situations land here (decision 008):
 *  - a stranger with an invite code, who creates their account and joins in one step;
 *  - a signed-in player with no team, or joining a second one — they only type the code.
 *
 * The code can also come from the invite link the coach shares on WhatsApp, as `?code=`.
 */
export default async function JoinPage({ searchParams }: PageProps<"/rejoindre">) {
  const [user, { code }] = await Promise.all([getCurrentUser(), searchParams]);
  const prefilledCode = typeof code === "string" ? code : "";

  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">Rejoindre une équipe</h2>

      {user ? (
        <>
          <p className="mt-1 mb-6 text-sm text-ink-muted">
            Salut {user.displayName} ! Entre le code d’invitation envoyé par ton coach.
          </p>
          <JoinWithExistingAccountForm prefilledCode={prefilledCode} />
        </>
      ) : (
        <>
          <p className="mt-1 mb-6 text-sm text-ink-muted">
            Ton coach t’a envoyé un code d’invitation. Choisis tes identifiants, et c’est parti.
          </p>
          <JoinWithNewAccountForm prefilledCode={prefilledCode} />

          <p className="mt-6 border-t border-border/60 pt-4 text-sm text-ink-muted">
            Tu as déjà un compte ?{" "}
            <Link href="/connexion" className="font-medium text-accent underline">
              Se connecter
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
