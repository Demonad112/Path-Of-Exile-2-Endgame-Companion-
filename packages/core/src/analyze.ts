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
import { attributeToItems, type AttributionReport } from './model/attribution.js'
import { normalizePassives, type PassiveAllocation } from './model/passives.js'
import { normalizeItems, type EquippedItem } from './model/slots.js'
import { keystoneEffectsOf, NO_KEYSTONE_EFFECTS, type KeystoneEffects } from './keystones/index.js'
import { gearRecommendations, mergeGearRecommendations, recommend } from './recommend/index.js'
import type { RecommendationReport } from './recommend/types.js'
import { reconcile, type ReconciliationReport } from './reconcile/index.js'
import type { ModTiers } from './gear/tiers.js'
import { decodePobExport, readPlayerStats } from './pob/export.js'
import { readPobConfig, type PobConfig } from './pob/config.js'
import { assessBuild, type BuildAssessment } from './score/index.js'
import { resolveAllocation, type PassiveTree } from './tree/index.js'
import type { LadderSummary } from './ninja/ladder.js'
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
  /**
   * What each equipped item is holding up, and what the sheet would read
   * without it. Empty of items when the tree of contributions did not add up —
   * see model/attribution.ts, which reports why.
   */
  attribution: AttributionReport
  /**
   * Corrections implied by allocated keystones, applied only where the
   * character's own stats corroborate them. Neutral when no tree was supplied:
   * keystone names come from the tree data, so without it none can be resolved.
   */
  keystones: KeystoneEffects
  recommendations: RecommendationReport
  /** The overall verdict, and the reasons behind it. */
  assessment: BuildAssessment
  /** Present when a PoB export was attached and decoded. */
  reconciliation: ReconciliationReport | null
  /** PoB's own computed stats, when available — an independent second opinion. */
  pobStats: Record<string, number> | null
  /**
   * The configuration the attached PoB export was saved with. This is what
   * turns "110k DPS" into "110k DPS against a non-boss enemy that is chilled,
   * ignited and bleeding".
   */
  pobConfig: PobConfig | null
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
 * Every one is optional, and every one only ever makes the analysis MORE
 * specific. Omitted, the findings stand as they were: vaguer, never wrong.
 *
 * `tiers` is optional because the affix artifact is 2 MB and neither adapter
 * wants it loaded unconditionally. Supplied, the recommendations become
 * concrete — "recraft this suffix on that item into this affix" instead of
 * "source resistance from gear".
 *
 * `tree` is what resolves allocated node ids to keystone NAMES. Without it no
 * keystone correction can be applied, so a Chaos Inoculation build reads as an
 * ordinary one — which is why both adapters pass it.
 *
 * `ladder` is a sample of observed damage figures. Without it the offence half
 * of the assessment is left unscored rather than graded against thresholds
 * nobody measured.
 */
export interface AnalyzeOptions {
  tiers?: ModTiers
  tree?: PassiveTree
  ladder?: LadderSummary | null
}

/**
 * Findings, made concrete when the affix data is available and corrected when
 * an allocated keystone invalidates one.
 *
 * The gear pass never widens the set on its own — it replaces the engine's
 * generic entry for a resistance with a specific one about a specific item, and
 * adds tier upgrades the engine could not see. If the affix data resolves
 * nothing for this character, the original findings are returned unchanged.
 */
function recommendationsFor(
  model: CharModel,
  options: AnalyzeOptions,
  keystones: KeystoneEffects,
): RecommendationReport {
  const report = recommend(model, keystones)
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

/**
 * Whether poe.ninja's damage figure and Path of Building's are the same number.
 *
 * Undefined when there is nothing to compare. This decides whether the PoB
 * export's saved configuration may be used to qualify poe.ninja's DPS: the
 * configuration describes what PoB computed, and attaching it to a figure PoB
 * disagrees with would caveat the wrong number.
 */
export function pobDpsAgreement(report: ReconciliationReport | null): boolean | undefined {
  const check = report?.checks.find((c) => c.stat.startsWith('dps:'))
  if (!check || check.severity === 'unresolved') return undefined
  return check.severity === 'match'
}

export async function analyzeCharacter(
  input: CharModelResponse | CharModel | unknown,
  options: AnalyzeOptions = {},
): Promise<Analysis> {
  const model = unwrapCharModel(input)
  const warnings: string[] = []

  let pobStats: Record<string, number> | null = null
  let pobConfig: PobConfig | null = null
  if (model.pathOfBuildingExport) {
    try {
      const xml = await decodePobExport(model.pathOfBuildingExport)
      pobStats = readPlayerStats(xml)
      pobConfig = readPobConfig(xml)
    } catch (err) {
      warnings.push(
        `The attached Path of Building export could not be decoded (${(err as Error).message}), so poe.ninja's numbers could not be cross-checked.`,
      )
    }
  }

  const defense = analyzeDefense(model)
  const dps = analyzeDps(model)
  const passives = normalizePassives(model)
  const items = normalizeItems(model)
  const breakdowns = indexBreakdowns(model)

  // Keystone names live in the tree data, so without it nothing can be
  // resolved. Report the neutral result rather than a guess: an uncorrected
  // reading is merely less specific, while a guessed keystone would be wrong.
  const keystones = options.tree
    ? keystoneEffectsOf(resolveAllocation(options.tree, passives).keystones, defense)
    : NO_KEYSTONE_EFFECTS

  const reconciliation = pobStats ? reconcile(model, pobStats) : null
  const dpsAgrees = pobDpsAgreement(reconciliation)

  const analysis: Analysis = {
    identity: {
      name: model.name ?? '',
      account: model.account ?? '',
      league: model.league ?? '',
      level: typeof model.level === 'number' ? model.level : null,
      className: model.class ?? null,
      updatedUtc: model.updatedUtc ?? null,
    },
    defense,
    dps,
    passives,
    items,
    breakdowns,
    attribution: attributeToItems(breakdowns, items, defense),
    keystones,
    model,
    recommendations: recommendationsFor(model, options, keystones),
    assessment: assessBuild({
      defense,
      dps,
      keystones,
      pobConfig,
      // Omitted rather than defaulted when there is nothing to compare: false
      // would assert the two engines disagree, which is a different claim.
      ...(dpsAgrees === undefined ? {} : { pobDpsAgrees: dpsAgrees }),
      ladder: options.ladder ?? null,
    }),
    reconciliation,
    pobStats,
    pobConfig,
    warnings,
  }

  if (analysis.reconciliation && analysis.reconciliation.major > 0) {
    warnings.push(
      `${analysis.reconciliation.major} stat${analysis.reconciliation.major === 1 ? '' : 's'} disagree between poe.ninja and the attached Path of Building export. See the reconciliation report before trusting those figures.`,
    )
  }

  // An allocated keystone that the character's own stats contradict is worth
  // saying out loud: it usually means the profile has not been reindexed since
  // the tree changed, and every conclusion that keystone would have corrected
  // was left uncorrected on purpose.
  for (const unverified of keystones.unverified) {
    warnings.push(
      `${unverified.keystone} is allocated on the passive tree, but ${unverified.reason}. Its corrections were not applied — poe.ninja may not have reindexed this character since the tree changed.`,
    )
  }

  return analysis
}
