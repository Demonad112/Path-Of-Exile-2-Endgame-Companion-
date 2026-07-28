/**
 * Recommendation shapes.
 *
 * V1's biggest failure was emitting templated strings ("chaos res is low").
 * V2 emits structured, quantified, costed, evidence-backed objects. The UI
 * renders them; the MCP server serialises them; neither invents prose.
 *
 * THE RULE: never invent a number. If a value cannot be derived from the
 * payload, emit an `unresolved` entry naming exactly what is missing.
 */

import type { Provenance } from '../model/types.js'

export type RecommendationCategory =
  | 'survivability'
  | 'damage'
  | 'efficiency'
  | 'gear'
  | 'question'

export type CostKind =
  /** Costs nothing but a click — an unspent anoint, a reallocated point. */
  | 'free'
  /** Costs passive skill points. */
  | 'passive'
  /** Requires replacing or crafting an item. */
  | 'gear'
  /** Requires currency to craft or buy. */
  | 'currency'
  /** Cannot be priced from the data available. */
  | 'unknown'

export type CurrencyTier = 'trivial' | 'low' | 'moderate' | 'high' | 'unknown'

export interface Cost {
  kind: CostKind
  /** Points / slots. 0 for `free`. */
  amount: number
  /** Rough currency tier where relevant. */
  currencyTier?: CurrencyTier
  /** Plain statement of what is being spent. */
  detail: string
}

export interface Impact {
  /** Which stat moves. */
  stat: string
  label: string
  from: number
  to: number
  delta: number
  unit: 'flat' | 'percent' | 'points' | 'ratio'
  /**
   * Normalised 0-1 significance, used for ranking. Derived from the size of
   * the change relative to the stat's own scale — never a hand-tuned constant
   * per recommendation.
   */
  significance: number
}

/** A traceable justification. Every claim points at real payload data. */
export type Evidence =
  | { kind: 'stat'; stat: string; value: number; note: string }
  | { kind: 'breakdown'; stat: string; source: string; value: number; note: string }
  | { kind: 'item'; slotId: number; slotLabel: string; itemName: string; note: string }
  | { kind: 'skill'; skill: string; dps: number; note: string }
  | { kind: 'passive'; count: number; note: string }
  | { kind: 'simulation'; before: number; after: number; note: string }

export interface Recommendation {
  id: string
  category: RecommendationCategory
  /** The concrete action, imperative and specific. */
  action: string
  /** Why it matters, in one sentence, stating measured facts only. */
  rationale: string
  /** The measured gain. Null only for `question` entries. */
  impact: Impact | null
  cost: Cost
  /** What is given up. Null when nothing is. */
  tradeoff: string | null
  evidence: Evidence[]
  provenance: Provenance
  /** impact significance / cost weight. Higher ranks first. */
  score: number
}

/**
 * Something worth saying that could not be quantified. Emitted INSTEAD of a
 * guessed number, and rendered distinctly so it never reads as a measurement.
 */
export interface Unresolved {
  id: string
  /** What we wanted to determine. */
  question: string
  /** Exactly what is missing, so the user knows what would fix it. */
  missing: string
}

export interface RecommendationReport {
  recommendations: Recommendation[]
  unresolved: Unresolved[]
  /** True when nothing actionable was found — say so plainly, don't pad. */
  buildIsSound: boolean
  /** One-line honest summary. */
  summary: string
}
