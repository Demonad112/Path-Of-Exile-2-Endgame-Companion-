import type { PinnacleBoss } from "@/lib/types";
import { Tag } from "@/components/shared/Tag";
import { SourceFlag } from "@/components/shared/SourceFlag";

export function BossCard({ boss }: { boss: PinnacleBoss }) {
  return (
    <div
      id={boss.id}
      className="scroll-mt-24 flex flex-col gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] p-4 transition-colors hover:border-line"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-ink">{boss.name}</h3>
        {boss.mechanic && !["apex", "trial"].includes(boss.mechanic) && (
          <Tag mechanic={boss.mechanic} />
        )}
        <SourceFlag source={boss.source} />
      </div>

      {boss.hpFloor && (
        <p className="text-xs text-ink-mute">HP floor: {boss.hpFloor}</p>
      )}

      {boss.fragmentCost.length > 0 && (
        <ul className="text-sm text-ink-dim">
          {boss.fragmentCost.map((f) => (
            <li key={f.itemName}>
              {f.quantity}× {f.itemName}
            </li>
          ))}
        </ul>
      )}

      <ul className="list-disc pl-4 text-xs text-ink-mute">
        {boss.gatingRequirements.map((req) => (
          <li key={req}>{req}</li>
        ))}
      </ul>

      {boss.notes && <p className="text-xs text-ink-mute">{boss.notes}</p>}
    </div>
  );
}
