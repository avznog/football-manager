import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Stats" };

/** Placeholder. Real statistics are M5 (`docs/ROADMAP.md`). */
export default function StatsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight text-ink">Statistiques</h1>
      <EmptyState
        title="Pas encore de statistiques"
        description="Buts, minutes jouées et clean sheets apparaîtront ici (jalon M5)."
      />
    </div>
  );
}
