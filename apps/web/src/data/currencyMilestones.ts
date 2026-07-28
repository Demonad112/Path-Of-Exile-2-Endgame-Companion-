import type { CurrencyMilestone } from "@/lib/types";
import { strategySource } from "./sourceMeta";

export const currencyMilestones: CurrencyMilestone[] = [
  {
    id: "functional-mapper",
    label: "Functional mapper",
    description:
      "Resist-capped, a few Divines of gear — targeted by early T11.",
    source: strategySource(),
  },
  {
    id: "smooth-red-mapper",
    label: "Smooth red-map mapper",
    description:
      "Lightning Arrow/Ice Shot with a several-Divine weapon — targeted by T15.",
    source: strategySource(),
  },
  {
    id: "pinnacle-ready-bosser",
    label: "Pinnacle-ready bosser",
    description:
      "Whirling Assault or a geared Deadeye at roughly 10+ Divines of gear.",
    source: strategySource(),
  },
  {
    id: "mirror-tier-tank",
    label: "Mirror-tier / CI tank",
    description: "Uncapped investment.",
    source: strategySource(),
  },
  {
    id: "juicing-audit-threshold",
    label: "Juicing audit thresholds",
    description:
      "If a Breach setup nets under 30 Div/hr, audit your tablets. If you're pulling only 8-10 Ex per juiced run, you're missing a juicing layer — usually sub-tree depth or Master pairing.",
    source: strategySource(),
  },
];
