import { commonMistakes } from "@/data/commonMistakes";
import { WarningPanel } from "@/components/shared/WarningPanel";

export function CommonMistakesPanel() {
  return (
    <WarningPanel
      mistakes={commonMistakes}
      stage="roadmap"
      title="Common progression mistakes"
    />
  );
}
