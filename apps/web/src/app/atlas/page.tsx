import type { Metadata } from "next";
import { ClusterFlow } from "@/components/atlas/ClusterFlow";
import { AtlasSequenceTracker } from "@/components/atlas/AtlasSequenceTracker";
import { WarningPanel } from "@/components/shared/WarningPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { commonMistakes } from "@/data/commonMistakes";

export const metadata: Metadata = {
  title: "Atlas Tree Planner — PoE2 Endgame Companion",
};

export default function AtlasPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Atlas Tree Planner"
        description="No real node-graph data exists for the 301-point Atlas tree in the source guides, so this is an ordered/grouped flow of the named clusters and sequencing they describe — not a pixel-accurate recreation of the in-game tree layout."
      />

      <AtlasSequenceTracker />
      <WarningPanel mistakes={commonMistakes} stage="atlas" />
      <ClusterFlow />
    </div>
  );
}
