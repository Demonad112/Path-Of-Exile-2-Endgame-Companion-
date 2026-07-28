import type { MetaBuild } from "@/lib/types";
import { SourceFlag } from "@/components/shared/SourceFlag";

const BUDGET_LABELS: Record<string, string> = {
  "league-start": "League-start",
  mid: "Mid-budget",
  high: "High-budget",
};

export function MetaBuildList({ builds }: { builds: MetaBuild[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {builds.map((build) => (
        <li
          key={build.id}
          id={build.id}
          className="scroll-mt-24 rounded-md border border-[var(--line)] bg-[var(--surface-raised)] p-3 transition-colors hover:border-line"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{build.name}</span>
            <span className="text-xs text-ink-mute">{build.ascendancy}</span>
            {build.playratePercent !== undefined && (
              <span className="rounded border border-good/40 px-1.5 py-0.5 text-xs text-[var(--good)]">
                ~{build.playratePercent}% playrate
              </span>
            )}
            <span className="text-xs text-ink-mute">
              {BUDGET_LABELS[build.budgetTier]}
            </span>
            <SourceFlag source={build.source} />
          </div>
          <p className="mt-1 text-xs text-ink-mute">{build.role}</p>
        </li>
      ))}
    </ul>
  );
}
