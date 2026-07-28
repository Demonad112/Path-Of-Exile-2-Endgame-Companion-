import type { Metadata } from "next";
import { roadmapSteps } from "@/data/roadmap";
import { benchmarkGates } from "@/data/benchmarks";
import { ChecklistSection } from "@/components/checklist/ChecklistSection";
import { ChecklistProgressHeader } from "@/components/checklist/ChecklistProgressHeader";
import { CommonMistakesPanel } from "@/components/checklist/CommonMistakesPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import type { RoadmapPhase } from "@/lib/types";

export const metadata: Metadata = {
  title: "Progression Checklist — PoE2 Endgame Companion",
};

const PHASE_ORDER: RoadmapPhase[] = [
  "campaign-end",
  "precursor-fortress",
  "arbiter-of-ash",
  "t11-checkpoint",
  "arbiter-of-divinity-loop",
  "full-tree",
  "juiced-farming",
];

export default function ChecklistPage() {
  const stepsByPhase = PHASE_ORDER.map((phase) => ({
    phase,
    steps: roadmapSteps
      .filter((step) => step.phase === phase)
      .sort((a, b) => a.order - b.order),
  })).filter((group) => group.steps.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Progression Checklist"
        description="Campaign end through the full 301-point Atlas tree. Check off steps as you complete them — progress is saved in this browser."
      />

      <ChecklistProgressHeader />
      <CommonMistakesPanel />

      <div className="flex flex-col gap-8">
        {stepsByPhase.map(({ phase, steps }) => (
          <ChecklistSection
            key={phase}
            phase={phase}
            steps={steps}
            benchmarkGates={benchmarkGates}
          />
        ))}
      </div>
    </div>
  );
}
