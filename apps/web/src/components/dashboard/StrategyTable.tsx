"use client";

import { useMemo, useState } from "react";
import type { FarmingStrategy } from "@/lib/types";
import { Tag } from "@/components/shared/Tag";

type SortKey = "rank" | "investment" | "risk";
const TIER_ORDINAL: Record<string, number> = { low: 0, medium: 1, high: 2 };

export function StrategyTable({ strategies }: { strategies: FarmingStrategy[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");

  const sorted = useMemo(() => {
    return [...strategies].sort((a, b) => {
      if (sortKey === "rank") return a.rank - b.rank;
      return TIER_ORDINAL[a[sortKey]] - TIER_ORDINAL[b[sortKey]];
    });
  }, [strategies, sortKey]);

  const headerButton = (key: SortKey, label: string) => (
    <button
      onClick={() => setSortKey(key)}
      className={`text-left font-medium transition-colors ${
        sortKey === key ? "text-[var(--accent)]" : "text-ink-mute hover:text-ink-dim"
      }`}
    >
      {label}
      {sortKey === key ? " ▾" : ""}
    </button>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-[var(--line)] bg-[var(--surface-sunken)]">
          <tr>
            <th className="px-3 py-2.5 text-left">{headerButton("rank", "Strategy")}</th>
            <th className="px-3 py-2.5 text-left">Mechanics</th>
            <th className="px-3 py-2.5 text-left">
              {headerButton("investment", "Investment")}
            </th>
            <th className="px-3 py-2.5 text-left">Expected return</th>
            <th className="px-3 py-2.5 text-left">{headerButton("risk", "Risk")}</th>
            <th className="px-3 py-2.5 text-left">LS / Late</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((strategy) => (
            <tr
              key={strategy.id}
              className="border-b border-line transition-colors last:border-0 hover:bg-surface-sunken"
            >
              <td className="px-3 py-2 font-medium text-ink">
                {strategy.name}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {strategy.mechanics.map((m) => (
                    <Tag key={m} mechanic={m} />
                  ))}
                </div>
              </td>
              <td className="px-3 py-2 text-ink-dim">{strategy.investment}</td>
              <td className="px-3 py-2 text-ink-mute">
                {strategy.expectedReturn}
              </td>
              <td className="px-3 py-2 text-ink-dim">{strategy.risk}</td>
              <td className="px-3 py-2 text-ink-mute">
                {strategy.leagueStartViable ? "LS" : "—"} /{" "}
                {strategy.lateGameViable ? "Late" : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
