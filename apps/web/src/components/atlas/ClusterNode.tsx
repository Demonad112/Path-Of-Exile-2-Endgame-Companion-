"use client";

import type { AtlasCluster } from "@/lib/types";
import { SourceFlag } from "@/components/shared/SourceFlag";
import { useAtlasProgress } from "@/hooks/useAtlasProgress";

export function ClusterNode({ cluster }: { cluster: AtlasCluster }) {
  const { isClusterAllocated, toggleCluster } = useAtlasProgress();
  const allocated = isClusterAllocated(cluster.id);

  return (
    <li
      id={cluster.id}
      className={`scroll-mt-24 rounded-md border p-3 transition-all ${
        allocated
          ? "border-good/30 bg-good/5"
          : "border-[var(--line)] bg-[var(--surface-raised)] hover:border-line"
      }`}
    >
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={allocated}
          onChange={() => toggleCluster(cluster.id)}
          className="mt-1 size-3.5 accent-emerald-500"
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken font-mono text-[10px] text-ink-mute">
              {cluster.order}
            </span>
            <span
              className={`text-sm font-medium ${allocated ? "text-ink-mute line-through" : "text-ink"}`}
            >
              {cluster.name}
            </span>
            {cluster.killGated && (
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-mute">
                kill-gated
              </span>
            )}
            <SourceFlag source={cluster.source} />
          </div>
          <p className="mt-1 text-xs text-ink-mute">{cluster.description}</p>
        </div>
      </label>
    </li>
  );
}
