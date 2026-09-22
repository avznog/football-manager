"use client";

/**
 * The coach's relance, ready to paste into the team's WhatsApp group.
 *
 * There are no push notifications and no e-mails by design (decision 015): the app's job is to
 * say exactly who still owes an answer, in a form that leaves in one tap. The message itself is
 * built by `buildReminderMessage`, on the server, so it is unit tested — this component only
 * shows it and copies it.
 *
 * The text sits in a read-only `<textarea>` rather than a `<p>`: with the Clipboard API
 * unavailable (an old browser, an insecure origin) it is still selectable and copyable by hand.
 */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type ReminderCardProps = {
  /** Already formatted, French, multi-line. */
  message: string;
  /** How many players still owe an answer. Zero turns the card into a reassurance. */
  pending: number;
};

export function ReminderCard({ message, pending }: ReminderCardProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (permission, insecure origin). The textarea below is the fallback.
      setCopied(false);
    }
  }

  return (
    <Card
      title="Relancer les absents"
      description={
        pending === 0
          ? "Tout le monde a répondu. Rien à faire."
          : `${pending} joueur${pending > 1 ? "s" : ""} n’${pending > 1 ? "ont" : "a"} pas répondu.`
      }
    >
      <div className="space-y-3">
        <textarea
          readOnly
          value={message}
          rows={4}
          aria-label="Message de relance"
          className="block w-full resize-y rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink"
        />
        <Button type="button" variant="secondary" fullWidth onClick={copy}>
          {copied ? "Copié !" : "Copier le message"}
        </Button>
      </div>
    </Card>
  );
}
