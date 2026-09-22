import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  // Already signed in: nothing to do here.
  if (await getCurrentUser()) redirect("/");

  // Next 16: searchParams is a Promise.
  const { suivant } = await searchParams;
  const next = typeof suivant === "string" ? suivant : undefined;

  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">Connexion</h2>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        Entre les identifiants que tu as choisis en rejoignant l’équipe.
      </p>

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
