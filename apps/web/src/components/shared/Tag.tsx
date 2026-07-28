import { MECHANIC_COLORS, MECHANIC_LABELS } from "@/lib/constants";
import type { Mechanic } from "@/lib/types";

export function Tag({ mechanic }: { mechanic: Mechanic | string }) {
  const colorClass =
    MECHANIC_COLORS[mechanic] ??
    "bg-ink-mute/20 text-ink-dim border-line/40";
  const label = MECHANIC_LABELS[mechanic] ?? mechanic;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {label}
    </span>
  );
}
