import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/dal";
import { EXPIRED_FLAG_PARAM } from "@/lib/auth/session-state";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  // Already signed in: nothing to do here.
  if (await getCurrentUser()) redirect("/");

  // Next 16: searchParams is a Promise.
  const params = await searchParams;
  const next = typeof params.suivant === "string" ? params.suivant : undefined;

  /**
   * Set by `/deconnexion` when the guard found a session cookie that identified nobody
   * (decision 143). Without it the repair is silent: the user is dropped on the login screen with
   * no idea why, which reads as the app having forgotten them.
   */
  const expired = params[EXPIRED_FLAG_PARAM] === "1";

  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">Connexion</h2>
      {/*
        « les identifiants que tu as choisis en rejoignant l'équipe » was true of nobody by the time
        decision 208 landed: sixteen of the eighteen accounts were created from the old app rather than
        by invitation, so they chose neither their username nor the address they can now type. The
        sentence names both ways in instead of describing how the account came to exist.
      */}
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        Ton nom d’utilisateur ou ton e-mail, et ton mot de passe.
      </p>

      {expired ? (
        <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink">
          Ta session a expiré, reconnecte-toi.
        </p>
      ) : null}

      <LoginForm next={next} />

      <p className="mt-6 border-t border-border/60 pt-4 text-sm text-ink-muted">
        Pas encore de compte ?{" "}
        <Link href="/rejoindre" className="font-medium text-accent underline">
          Rejoindre une équipe
        </Link>
      </p>
    </div>
  );
}
