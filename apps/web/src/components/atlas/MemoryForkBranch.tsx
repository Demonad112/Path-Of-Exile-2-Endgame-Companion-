"use client";

import type { MemoryFork } from "@/lib/types";
import { SourceFlag } from "@/components/shared/SourceFlag";
import { useAtlasProgress } from "@/hooks/useAtlasProgress";

export function MemoryForkBranch({ fork }: { fork: MemoryFork }) {
  const { isForkAllocated, toggleFork } = useAtlasProgress();
  const allocated = isForkAllocated(fork.id);

  return (
    <div
      id={fork.id}
      className={`scroll-mt-24 flex-1 rounded-lg border p-4 transition-all hover:-translate-y-0.5 ${
        allocated
          ? "border-good/30 bg-good/5"
          : "border-chaos/30 bg-chaos/[0.06] hover:border-chaos/50 hover:shadow-[0_8px_24px_-10px_rgba(129,140,248,0.35)]"
      }`}
    >
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={allocated}
          onChange={() => toggleFork(fork.id)}
          className="size-3.5 accent-emerald-500"
        />
        <h4 className="font-semibold text-chaos">{fork.title}</h4>
        <SourceFlag source={fork.source} />
      </label>
      <ul className="mt-2 ml-6 list-disc space-y-1 text-sm text-ink-dim">
        {fork.nodes.map((node) => (
          <li key={node}>{node}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-mute">{fork.description}</p>
    </div>
  );
}
