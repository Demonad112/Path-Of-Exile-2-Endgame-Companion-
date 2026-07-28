"use client";

import type { FarmingStrategy } from "@/lib/types";
import { Tag } from "@/components/shared/Tag";
import { SourceFlag } from "@/components/shared/SourceFlag";
import { useStrategySelection } from "@/hooks/useStrategySelection";

const TIER_STYLES: Record<string, string> = {
  low: "text-[var(--good)]",
  medium: "text-accent",
  high: "text-danger",
};

export function StrategyCard({ strategy }: { strategy: FarmingStrategy }) {
  const { pinnedStrategyId, pinStrategy } = useStrategySelection();
  const pinned = pinnedStrategyId === strategy.id;

  return (
    <div
      id={strategy.id}
      className={`scroll-mt-24 flex flex-col gap-2 rounded-lg border p-4 transition-all ${
        pinned
          ? "border-[var(--accent)]/40 bg-[var(--accent-dim)] shadow-[0_0_16px_-4px_rgba(227,179,65,0.3)]"
          : "border-[var(--line)] bg-[var(--surface-raised)] hover:border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-ink">{strategy.name}</h3>
        <button
          onClick={() => pinStrategy(pinned ? undefined : strategy.id)}
          className={`shrink-0 rounded-md border px-2 py-1 text-xs transition-colors ${
            pinned
              ? "border-[var(--accent)]/40 text-[var(--accent)]"
              : "border-line text-ink-mute hover:border-line hover:text-ink-dim"
          }`}
        >
          {pinned ? "★ Pinned" : "☆ Pin"}
        </button>
      </div>

      {strategy.mechanics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {strategy.mechanics.map((m) => (
            <Tag key={m} mechanic={m} />
          ))}
        </div>
      )}

      <p className="text-sm text-ink-mute">{strategy.atlasSetup}</p>
      <p className="text-sm text-ink-dim">{strategy.expectedReturn}</p>

      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        <span>
          Investment:{" "}
          <span className={TIER_STYLES[strategy.investment]}>
            {strategy.investment}
          </span>
        </span>
        <span>
          Risk:{" "}
          <span className={TIER_STYLES[strategy.risk]}>{strategy.risk}</span>
        </span>
        {strategy.leagueStartViable && (
          <span className="text-ink-mute">League-start viable</span>
        )}
        {strategy.lateGameViable && (
          <span className="text-ink-mute">Late-game viable</span>
        )}
        <SourceFlag source={strategy.source} />
      </div>
    </div>
  );
}
