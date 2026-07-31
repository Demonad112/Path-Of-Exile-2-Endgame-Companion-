import type { CharacterSnapshot } from "@poe2/core";

export type SourceDoc = "atlas-tree-fundamentals" | "strategy-guide";
export type Verification = "confirmed" | "unverified" | "conflicting";

export interface SourceRef {
  sourceDoc: SourceDoc;
  asOfPatch: string;
  verified: Verification;
  note?: string;
}

export type RoadmapPhase =
  | "campaign-end"
  | "precursor-fortress"
  | "arbiter-of-ash"
  | "t11-checkpoint"
  | "arbiter-of-divinity-loop"
  | "full-tree"
  | "juiced-farming";

export interface RoadmapStep {
  id: string;
  order: number;
  phase: RoadmapPhase;
  title: string;
  description: string;
  actionItems?: string[];
  benchmarkGateIds?: string[];
  relatedMistakeIds?: string[];
  source: SourceRef;
}

export type BenchmarkSeverity = "soft-guideline" | "hard-gate";

export interface BenchmarkGate {
  id: string;
  label: string;
  severity: BenchmarkSeverity;
  appliesBeforeStepId?: string;
  source: SourceRef;
}

export type Stage = "roadmap" | "atlas" | "dashboard";

export interface CommonMistake {
  id: string;
  title: string;
  description: string;
  appliesToStage: Stage[];
  relatedMechanics?: Mechanic[];
  source: SourceRef;
}

export type Mechanic =
  | "breach"
  | "abyss"
  | "delirium"
  | "ritual"
  | "expedition";

export type AtlasClusterGroup =
  | "early-progression"
  | "memory-fork"
  | "mechanic-subtree"
  | "general";

export interface AtlasCluster {
  id: string;
  name: string;
  /** Recommended allocation sequence within its group — NOT a spatial/pixel position. */
  order: number;
  group: AtlasClusterGroup;
  mechanic?: Mechanic;
  description: string;
  parentClusterId?: string;
  pointCost?: number;
  killGated?: boolean;
  source: SourceRef;
}

export type MemoryForkBranchId = "top-left" | "top-right" | "top";

export interface MemoryFork {
  id: string;
  branch: MemoryForkBranchId;
  title: string;
  nodes: string[];
  description: string;
  source: SourceRef;
}

export type RiskTier = "low" | "medium" | "high";
export type InvestmentTier = "low" | "medium" | "high";

export interface FarmingStrategy {
  id: string;
  name: string;
  mechanics: Mechanic[];
  atlasSetup: string;
  investment: InvestmentTier;
  expectedReturn: string;
  risk: RiskTier;
  leagueStartViable: boolean;
  lateGameViable: boolean;
  rank: number;
  source: SourceRef;
}

export interface FragmentCost {
  itemName: string;
  quantity: number;
}

export interface PinnacleBoss {
  id: string;
  name: string;
  mechanic?: Mechanic | "trial" | "apex";
  hpFloor?: string;
  fragmentCost: FragmentCost[];
  gatingRequirements: string[];
  notes?: string;
  source: SourceRef;
}

export type BudgetTier = "league-start" | "mid" | "high";

export interface MetaBuild {
  id: string;
  name: string;
  ascendancy: string;
  playratePercent?: number;
  budgetTier: BudgetTier;
  role: string;
  source: SourceRef;
}

export interface CurrencyMilestone {
  id: string;
  label: string;
  description: string;
  source: SourceRef;
}

export interface PersistedState {
  version: number;
  checklist: {
    completedStepIds: string[];
    completedActionItemKeys: string[];
  };
  atlas: {
    allocatedClusterIds: string[];
    allocatedForkIds: string[];
  };
  dashboard: {
    lastQuizAnswers: Record<string, string>;
    pinnedStrategyId?: string;
  };
  /**
   * Character history.
   *
   * Deliberately its own slice, and deliberately only snapshots: a stored
   * analysis would be hundreds of kilobytes and would put real pressure on a
   * budget shared with checklist and Atlas progress. Keeping it separate also
   * means a schema change here can never discard those.
   *
   * Added without a version bump on purpose — the reader merges over defaults,
   * so an older payload missing this key gets the empty history rather than
   * being discarded wholesale along with everything the player has ticked off.
   */
  character: {
    snapshots: CharacterSnapshot[];
  };
  updatedAt: string;
}
