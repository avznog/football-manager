"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createInvite, revokeInvite } from "@/lib/team/actions";
import { formatInviteCode } from "@/lib/team/invite-code";
import type { ActiveInvite } from "@/lib/team/queries";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

export function InviteManager({
  teamId,
  invites,
}: {
  teamId: string;
  invites: ActiveInvite[];
}) {
  const [state, action] = useActionState(createInvite, undefined);
  const freshCode = state && "code" in state ? state.code : undefined;
  const error = state && "error" in state ? state.error : undefined;

  return (
    <Card
      title="Inviter des joueurs"
      description="Génère un code et envoie-le sur WhatsApp. Le joueur choisit lui-même son mot de passe."
    >
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="teamId" value={teamId} />

        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Rôle
          <select
            name="role"
            defaultValue="player"
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-base"
          >
            <option value="player">Joueur</option>
            <option value="coach">Coach</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Utilisations
          <input
            name="maxUses"
            type="number"
            min={1}
            max={50}
            defaultValue={1}
            inputMode="numeric"
            className="w-24 rounded-xl border border-border bg-surface px-3 py-2.5 text-base tabular-nums"
          />
        </label>

        <GenerateButton />
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {freshCode ? (
        <p className="mt-4 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          Code créé :{" "}
          <strong className="font-mono text-base tracking-widest">
            {formatInviteCode(freshCode)}
          </strong>
        </p>
      ) : null}

      {invites.length > 0 ? (
        <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
          {invites.map((invite) => (
            <li key={invite.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-base tracking-widest text-ink">
                  {formatInviteCode(invite.code)}
                </p>
                <p className="text-xs text-ink-subtle">
                  {invite.role === "coach" ? "Coach" : "Joueur"} · {invite.uses}/{invite.maxUses}{" "}
                  utilisé{invite.uses > 1 ? "s" : ""} · expire le{" "}
                  {DATE_FORMAT.format(invite.expiresAt)}
                </p>
              </div>
              <form action={revokeInvite}>
                <input type="hidden" name="teamId" value={teamId} />
                <input type="hidden" name="inviteId" value={invite.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Annuler
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink-subtle">Aucun code actif.</p>
      )}
    </Card>
  );
}

function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Génération…" : "Générer un code"}
    </Button>
  );
}
