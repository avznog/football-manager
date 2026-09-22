import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Calendrier" };

/** Placeholder. The real calendar is M2 (`docs/ROADMAP.md`). */
export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight text-ink">Calendrier</h1>
      <EmptyState
        title="Le calendrier arrive"
        description="Matchs, entraînements et disponibilités seront ici (jalon M2)."
      />
    </div>
  );
}
