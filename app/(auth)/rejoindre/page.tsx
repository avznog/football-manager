import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/dal";
import { CreateTeamForm } from "./create-team-form";
import { JoinWithExistingAccountForm, JoinWithNewAccountForm } from "./join-form";

export const metadata = { title: "Rejoindre une équipe" };

/**
 * Three situations land here (decision 008):
 *  - a stranger with an invite code, who creates their account and joins in one step;
 *  - a signed-in player with no team, or joining a second one — they only type the code;
 *  - the super admin of a brand-new instance, who has nobody to be invited by and creates the
 *    first team here (decision 052).
 *
 * That last case is why this screen carries a form that has nothing to do with joining: invariant 5
 * sends a user with no team to this page and nowhere else, so a screen offering only an invite code
 * is a dead end for the one account entitled to create a team.
 *
 * The code can also come from the invite link the coach shares on WhatsApp, as `?code=`.
 */
export default async function JoinPage({ searchParams }: PageProps<"/rejoindre">) {
  const [user, { code }] = await Promise.all([getCurrentUser(), searchParams]);
  const prefilledCode = typeof code === "string" ? code : "";

  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">
        {user?.isSuperAdmin ? "Crée ton équipe" : "Rejoindre une équipe"}
      </h2>

      {user?.isSuperAdmin ? (
        /* The first person on a new instance has no coach to be invited by, so creating comes
           first and the invite code second. Telling them to « entre le code envoyé par ton coach »
           would be addressing somebody who does not exist. */
        <>
          <p className="mt-1 mb-6 text-sm text-ink-muted">
            Salut {user.displayName} ! Tu es administrateur : donne un nom à ton équipe et tu en
            seras le coach. Tes joueurs, tu les inviteras depuis « Équipe ».
          </p>
          <CreateTeamForm />

          <div className="mt-8 border-t border-border/60 pt-6">
            <h3 className="text-base font-semibold text-ink">Ou rejoins une équipe existante</h3>
            <p className="mt-1 mb-4 text-sm text-ink-muted">
              Si quelqu’un t’a envoyé un code d’invitation, il va ici.
            </p>
            <JoinWithExistingAccountForm prefilledCode={prefilledCode} />
          </div>
        </>
      ) : user ? (
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
