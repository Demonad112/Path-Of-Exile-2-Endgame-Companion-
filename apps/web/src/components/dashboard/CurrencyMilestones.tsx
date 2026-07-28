import type { CurrencyMilestone } from "@/lib/types";
import { SourceFlag } from "@/components/shared/SourceFlag";

export function CurrencyMilestones({
  milestones,
}: {
  milestones: CurrencyMilestone[];
}) {
  return (
    <ul className="space-y-2">
      {milestones.map((milestone) => (
        <li
          key={milestone.id}
          className="rounded-md border border-[var(--line)] bg-[var(--surface-raised)] p-3 transition-colors hover:border-line"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">
              {milestone.label}
            </span>
            <SourceFlag source={milestone.source} />
          </div>
          <p className="mt-1 text-xs text-ink-mute">{milestone.description}</p>
        </li>
      ))}
    </ul>
  );
}
