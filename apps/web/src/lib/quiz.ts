import type { FarmingStrategy, InvestmentTier, RiskTier } from "./types";

export type QuizStageAnswer = "league-start" | "late-game";

export interface QuizAnswers {
  budget?: InvestmentTier;
  tankiness?: RiskTier;
  stage?: QuizStageAnswer;
}

const TIER_ORDINAL: Record<InvestmentTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function tierProximityScore(a: string, b: string): number {
  const diff = Math.abs(
    TIER_ORDINAL[a as InvestmentTier] - TIER_ORDINAL[b as InvestmentTier]
  );
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

/**
 * Scores strategies directly against their existing data-file attributes
 * (investment/risk/leagueStart/lateGame) rather than a separate answer-weight
 * table, so the quiz can never drift out of sync with the strategies list.
 */
export function scoreStrategies(
  strategies: FarmingStrategy[],
  answers: QuizAnswers
): FarmingStrategy[] {
  const scored = strategies.map((strategy) => {
    let score = 0;
    if (answers.budget) {
      score += tierProximityScore(strategy.investment, answers.budget);
    }
    if (answers.tankiness) {
      score += tierProximityScore(strategy.risk, answers.tankiness);
    }
    if (answers.stage === "league-start" && strategy.leagueStartViable) {
      score += 2;
    }
    if (answers.stage === "late-game" && strategy.lateGameViable) {
      score += 2;
    }
    return { strategy, score };
  });

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.strategy.rank - b.strategy.rank;
    })
    .map((s) => s.strategy);
}
