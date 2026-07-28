/**
 * The single analysis entry point.
 *
 * Both `apps/mcp` and `apps/web` call this and render the result. Neither
 * contains analysis logic of its own — that was V1's fatal structural flaw,
 * where a vendored copy of the analyser meant the web app and the MCP server
 * could only agree by coincidence.
 */

import { analyzeDefense, type DefenseSummary } from './defense/index.js'
import { analyzeDps, type DpsSummary } from './dps/index.js'
import { indexBreakdowns, type BreakdownIndex } from './model/breakdowns.js'
import { normalizePassives, type PassiveAllocation } from './model/passives.js'
import { normalizeItems, type EquippedItem } from './model/slots.js'
import { gearRecommendations, mergeGearRecommendations, recommend } from './recommend/index.js'
import type { RecommendationReport } from './recommend/types.js'
import { reconcile, type ReconciliationReport } from './reconcile/index.js'
import type { ModTiers } from './gear/tiers.js'
import { decodePobExport, readPlayerStats } from './pob/export.js'
import type { CharModel, CharModelResponse } from './model/types.js'

export interface CharacterIdentity {
  name: string
  account: string
  league: string
  level: number | null
  /** Ascendancy, e.g. "Deadeye". */
  className: string | null
  updatedUtc: string | null
}

export interface Analysis {
  identity: CharacterIdentity
  /**
   * The unwrapped character model.
   *
   * Carried so consumers reading parts of the payload this summary does not
   * cover — jewels, sockets, gem quality — need not re-unwrap the envelope and
   * risk disagreeing with the analysis about which model they are looking at.
   */
  model: CharModel
  defense: DefenseSummary
  dps: DpsSummary
  passives: PassiveAllocation
  items: EquippedItem[]
  breakdowns: BreakdownIndex
  recommendations: RecommendationReport
  /** Present when a PoB export was attached and decoded. */
  reconciliation: ReconciliationReport | null
  /** PoB's own computed stats, when available — an independent second opinion. */
  pobStats: Record<string, number> | null
  /** Non-fatal problems worth telling the user about. */
  warnings: string[]
}

/** Accept either the raw `{type, charModel}` envelope or a bare charModel. */
export function unwrapCharModel(input: CharModelResponse | CharModel | unknown): CharModel {
  if (!input || typeof input !== 'object') {
    throw new Error('Expected a poe.ninja character model object.')
  }
  const maybe = input as CharModelResponse
  if (maybe.charModel && typeof maybe.charModel === 'object') return maybe.charModel
  return input as CharModel
}

/**
 * Options for the full analysis.
 *
 * `tiers` is optional because the affix artifact is 2 MB and neither adapter
 * wants it loaded unconditionally. Supplied, the recommendations become
 * concrete — "recraft this suffix on that item into this affix" instead of
 * "source resistance from gear". Omitted, the original findings stand: vaguer,
 * never wrong.
 */
export interface AnalyzeOptions {
  tiers?: ModTiers
}

/**
 * Findings, made concrete when the affix data is available.
 *
 * The gear pass never widens the set on its own — it replaces the engine's
 * generic entry for a resistance with a specific one about a specific item, and
 * adds tier upgrades the engine could not see. If the affix data resolves
 * nothing for this character, the original findings are returned unchanged.
 */
function recommendationsFor(model: CharModel, options: AnalyzeOptions): RecommendationReport {
  const report = recommend(model)
  if (!options.tiers) return report

  const gear = gearRecommendations({
    items: normalizeItems(model),
    defense: analyzeDefense(model),
    tiers: options.tiers,
  })
  if (!gear.length) return report

  const recommendations = mergeGearRecommendations(report.recommendations, gear)
  return {
    ...report,
    recommendations,
    buildIsSound: recommendations.length === 0,
  }
}

export async function analyzeCharacter(
  input: CharModelResponse | CharModel | unknown,
  options: AnalyzeOptions = {},
): Promise<Analysis> {
  const model = unwrapCharModel(input)
  const warnings: string[] = []

  let pobStats: Record<string, number> | null = null
  if (model.pathOfBuildingExport) {
    try {
      pobStats = readPlayerStats(await decodePobExport(model.pathOfBuildingExport))
    } catch (err) {
      warnings.push(
        `The attached Path of Building export could not be decoded (${(err as Error).message}), so poe.ninja's numbers could not be cross-checked.`,
      )
    }
  }

  const analysis: Analysis = {
    identity: {
      name: model.name ?? '',
      account: model.account ?? '',
      league: model.league ?? '',
      level: typeof model.level === 'number' ? model.level : null,
      className: model.class ?? null,
      updatedUtc: model.updatedUtc ?? null,
    },
    defense: analyzeDefense(model),
    dps: analyzeDps(model),
    passives: normalizePassives(model),
    items: normalizeItems(model),
    breakdowns: indexBreakdowns(model),
    model,
    recommendations: recommendationsFor(model, options),
    reconciliation: pobStats ? reconcile(model, pobStats) : null,
    pobStats,
    warnings,
  }

  if (analysis.reconciliation && analysis.reconciliation.major > 0) {
    warnings.push(
      `${analysis.reconciliation.major} stat${analysis.reconciliation.major === 1 ? '' : 's'} disagree between poe.ninja and the attached Path of Building export. See the reconciliation report before trusting those figures.`,
    )
  }

  return analysis
}
