"use client";

import Link from "next/link";
import { useChecklistState } from "@/hooks/useChecklistState";
import { useAtlasProgress } from "@/hooks/useAtlasProgress";
import { ProgressBar } from "@/components/shared/ProgressBar";

export function ProgressSummary() {
  const { completionPercent } = useChecklistState();
  const { allocationPercent } = useAtlasProgress();
  const started = completionPercent > 0 || allocationPercent > 0;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-ink">
          {started ? "Your progress" : "Track your progress"}
        </h2>
        <span className="text-xs text-ink-mute">Saved in this browser</span>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <ProgressBar percent={completionPercent} label="Checklist" />
          <Link
            href="/checklist"
            className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:underline"
          >
            {completionPercent > 0 ? "Continue checklist" : "Start checklist"} →
          </Link>
        </div>
        <div>
          <ProgressBar percent={allocationPercent} label="Atlas allocation" />
          <Link
            href="/atlas"
            className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:underline"
          >
            {allocationPercent > 0 ? "Continue planning" : "Start planning"} →
          </Link>
        </div>
      </div>
    </div>
  );
}
