"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AtlasCluster, Mechanic } from "@/lib/types";
import { MECHANIC_LABELS } from "@/lib/constants";
import { Tag } from "@/components/shared/Tag";
import { ClusterNode } from "./ClusterNode";

const MECHANICS: Mechanic[] = ["abyss", "breach", "expedition", "ritual", "delirium"];

function isMechanic(value: string | null): value is Mechanic {
  return !!value && (MECHANICS as string[]).includes(value);
}

export function MechanicSubTreeList({ clusters }: { clusters: AtlasCluster[] }) {
  const searchParams = useSearchParams();
  const mechanicParam = searchParams.get("mechanic");
  const [active, setActive] = useState<Mechanic>(
    isMechanic(mechanicParam) ? mechanicParam : "abyss"
  );

  // Search results for a mechanic sub-tree cluster carry ?mechanic=<x> since
  // this tab picker only renders the active mechanic's clusters in the DOM —
  // re-sync whenever that param changes (covers navigating between two
  // different mechanic search results while already on this page). Adjusting
  // during render (React's recommended pattern) instead of an effect avoids
  // an extra commit/re-render cycle.
  const [prevMechanicParam, setPrevMechanicParam] = useState(mechanicParam);
  if (mechanicParam !== prevMechanicParam) {
    setPrevMechanicParam(mechanicParam);
    if (isMechanic(mechanicParam)) setActive(mechanicParam);
  }

  const activeNodes = clusters
    .filter((c) => c.group === "mechanic-subtree" && c.mechanic === active)
    .sort((a, b) => a.order - b.order);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5 rounded-lg border border-[color-mix(in oklab, var(--line) 55%, transparent)] bg-[var(--surface-sunken)] p-1.5">
        {MECHANICS.map((mechanic) => (
          <button
            key={mechanic}
            onClick={() => setActive(mechanic)}
            className={`rounded-md px-1 py-1 transition-all ${
              active === mechanic
                ? "bg-surface-sunken ring-1 ring-line"
                : "opacity-50 hover:opacity-80"
            }`}
          >
            <Tag mechanic={mechanic} />
          </button>
        ))}
      </div>
      <p className="mb-3 rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-mute">
        Priority order for {MECHANIC_LABELS[active]}. Guide-wide rule: don&apos;t
        run this mechanic&apos;s own tablets while questing it — it slows down
        finishing the quest.
      </p>
      <ul className="space-y-2">
        {activeNodes.map((cluster) => (
          <ClusterNode key={cluster.id} cluster={cluster} />
        ))}
      </ul>
    </div>
  );
}
