export const EXPEDITION_RESOURCE_KEYS = ['fuel', 'ammo', 'steel', 'bauxite'] as const
export const EXPEDITION_UTILITY_RESOURCE_KEYS = [...EXPEDITION_RESOURCE_KEYS, 'bucket'] as const
const DEFAULT_PLAN_LIMIT = 1
const MAX_PLAN_LIMIT = 5
const UTILITY_SCORE_EPSILON = 1e-9
const RESOURCE_CONSTRAINT_EPSILON = 1e-9

export type ExpeditionResourceKey = (typeof EXPEDITION_RESOURCE_KEYS)[number]
export type ResourceKey = (typeof EXPEDITION_UTILITY_RESOURCE_KEYS)[number]
export type ExpeditionResources = Readonly<Record<ExpeditionResourceKey, number>>
export type PriorityRank = 1 | 2 | 3 | 4 | 5
export type ResourcePriorityMap = Readonly<Record<ResourceKey, PriorityRank | null>>
export type ResourcePreference =
  | {
      readonly mode: 'optimize'
      readonly rank: PriorityRank
    }
  | {
      readonly mode: 'constraint'
      readonly minimumNetYieldPerHour: number
    }
  | {
      readonly mode: 'ignore'
    }
export type ResourcePreferenceMap = Readonly<Record<ResourceKey, ResourcePreference>>

export interface PriorityPreference {
  readonly mode: 'priority'
  readonly preferences: ResourcePreferenceMap
}

export interface CustomWeightPreference {
  readonly mode: 'customWeight'
  readonly weights: ResourceVector
}

export type OptimizationPreference = PriorityPreference | CustomWeightPreference

export interface ResourceVector {
  readonly fuel: number
  readonly ammo: number
  readonly steel: number
  readonly bauxite: number
  readonly bucket: number
}

export const PRIORITY_WEIGHT_BY_RANK: Readonly<Record<PriorityRank, number>> = {
  1: 100,
  2: 70,
  3: 45,
  4: 25,
  5: 10,
}

export type ExpeditionItemRewardSlot = 'left' | 'right' | 'unknown'
export type ExpeditionItemRewardRule = 'random' | 'great-success-guaranteed'

export interface ExpeditionBucketRewardSnapshot {
  readonly item: 'bucket'
  readonly min: number
  readonly max: number
  readonly itemSlot: ExpeditionItemRewardSlot
  readonly rewardRule: ExpeditionItemRewardRule
  readonly acquisitionProbability: number | null
}

export interface ExpeditionPlannerRequest {
  readonly resourceWeights: ExpeditionResources
  readonly afkMinutes: number
  readonly fleetCount: number
  readonly candidateIds: readonly number[]
  readonly bucketWeight: number
  readonly preference?: OptimizationPreference
  readonly planLimit?: number
  readonly debug?: boolean
  readonly incomeModifier: {
    readonly greatSuccess: boolean
    readonly daihatsuCount: number
  }
}

export interface ExpeditionCostShip {
  readonly masterId: number
  readonly level: number
  readonly stype: number
  readonly maxFuel: number
  readonly maxAmmo: number
}

export interface ExpeditionCurrentMission {
  readonly id: number
  readonly displayNo: string
  readonly name: string
  readonly completesAt: number
}

export interface ExpeditionRequirements {
  readonly flagShipLevel: number
  readonly flagShipTypeOf: readonly string[] | null
  readonly shipCount: number
  readonly levelCount: number | null
  readonly totalAsw: number | null
  readonly totalLos: number | null
  readonly totalAa: number | null
  readonly totalFp: number | null
  readonly totalTorp: number | null
  readonly drumCount: number | null
  readonly drumCarrierCount: number | null
  readonly fleetSType: readonly {
    readonly count: number
    readonly oneOf: readonly string[]
  }[]
  readonly sampleFleet: readonly string[]
}

export interface ExpeditionRequirementResult {
  readonly flagShipLevel: boolean
  readonly flagShipTypeOf: boolean | null
  readonly shipCount: boolean
  readonly levelCount: boolean | null
  readonly totalAsw: boolean | null
  readonly totalLos: boolean | null
  readonly totalAa: boolean | null
  readonly totalFp: boolean | null
  readonly totalTorp: boolean | null
  readonly drumCount: boolean | null
  readonly drumCarrierCount: boolean | null
  readonly fleetSType: readonly boolean[]
}

export interface ExpeditionFleetActual {
  readonly flagShipLevel: number
  readonly flagShipType: string
  readonly shipCount: number
  readonly levelCount: number
  readonly totalAsw: number
  readonly totalLos: number
  readonly totalAa: number
  readonly totalFp: number
  readonly totalTorp: number
  readonly drumCount: number
  readonly drumCarrierCount: number
  readonly sparkledCount: number
  readonly types: readonly string[]
}

export interface ExpeditionFleetCheckSnapshot {
  readonly fleetNumber: number
  readonly fleetName: string
  readonly busy: boolean
  readonly currentMission: ExpeditionCurrentMission | null
  readonly shipCount: number
  readonly isSupplied: boolean
  readonly actual: ExpeditionFleetActual
  readonly result: ExpeditionRequirementResult
}

export interface ExpeditionCandidateSnapshot {
  readonly id: number
  readonly displayNo: string
  readonly name: string
  readonly durationMinutes: number
  readonly baseIncome: ExpeditionResources
  readonly bucketMaxPerTrip: number
  readonly bucketReward: ExpeditionBucketRewardSnapshot | null
  readonly fuelPercent: number
  readonly ammoPercent: number
  readonly requirements: ExpeditionRequirements
  readonly greatSuccessCondition:
    | { readonly type: 'drums'; readonly count: number }
    | { readonly type: 'flagship-level' | 'all-sparkle' | 'unknown' }
  readonly monthly: boolean
  readonly fleetChecks: readonly ExpeditionFleetCheckSnapshot[]
}

export interface ExpeditionPlannerSnapshot {
  readonly generatedAt: string
  readonly current: ExpeditionResources
  readonly maxResource: number
  readonly modifierFactor: number
  readonly accountShips: readonly ExpeditionCostShip[]
  readonly fleetNumbers: readonly number[]
  readonly candidates: readonly ExpeditionCandidateSnapshot[]
}

export interface ExpeditionFleetResult extends ExpeditionFleetCheckSnapshot {
  readonly meetsRequirements: boolean
  readonly fitScore: number
}

export interface ExpeditionPlanPairing {
  readonly fleet: ExpeditionFleetResult
  readonly expedition: {
    readonly id: number
    readonly displayNo: string
    readonly name: string
    readonly durationMinutes: number
    readonly effectiveCycleMinutes: number
    readonly baseIncome: ExpeditionResources
    readonly netIncome: ExpeditionResources
    readonly hourlyIncome: ExpeditionResources
    readonly bucketPotential: {
      readonly maxPerTrip: number
      readonly expectedPerTrip: number
      readonly hourly: number
    }
    readonly bucketReward: ExpeditionBucketRewardSnapshot | null
    readonly estimatedResupplyCost: { readonly fuel: number; readonly ammo: number }
    readonly requirements: ExpeditionRequirements
    readonly modifier: {
      readonly type: 'kancepts-account'
      readonly greatSuccess: boolean
      readonly daihatsuCount: number
      readonly factor: number
    }
    readonly greatSuccessCondition: ExpeditionCandidateSnapshot['greatSuccessCondition']
    readonly monthly: boolean
  }
}

export interface ExpeditionPlanScoreDetails {
  readonly expectedNetYield: ResourceVector
  readonly benchmark: ResourceVector
  readonly satisfaction: ResourceVector
  readonly utility: ResourceVector
  readonly normalizedWeight: ResourceVector
  readonly weightedContribution: ResourceVector
  readonly totalScore: number
}

export interface ExpeditionPlan {
  readonly weightedHourlyIncome: number
  readonly weightedExpectedNetYield: number
  readonly utilityScore: number
  readonly normalizedYield: ResourceVector
  readonly satisfaction: ResourceVector
  readonly utility: ResourceVector
  readonly normalizedWeights: ResourceVector
  readonly weightedContribution: ResourceVector
  readonly scoreDetails: ExpeditionPlanScoreDetails
  readonly bucketPotentialHourly: number
  readonly bucketWeight: number
  readonly comparisonWindowMinutes: number
  readonly projectedIncome: ExpeditionResources
  readonly hourlyIncome: ExpeditionResources
  readonly estimatedResupplyCost: { readonly fuel: number; readonly ammo: number }
  readonly negativeYieldCount: number
  readonly fallbackUtilityScore: number
  readonly pairingScore: number
  readonly pairings: readonly ExpeditionPlanPairing[]
}

export interface ResourceScoreDebug {
  readonly rawYieldPerHour: number
  readonly benchmarkPerHour: number
  readonly satisfaction: number
  readonly utility: number
  readonly rawWeight: number
  readonly normalizedWeight: number
  readonly weightedContribution: number
  readonly contributionRatio: number
}

export type ResourceScoreDebugMap = Readonly<Record<ResourceKey, ResourceScoreDebug>>

export interface ExpeditionItemRewardDebug extends ExpeditionBucketRewardSnapshot {
  readonly itemPosition: ExpeditionItemRewardSlot
  readonly successMode: 'normalSuccess' | 'greatSuccess'
  readonly acquisitionProbability: number
  readonly expectedPerRun: number
  readonly expectedPerHour: number
}

export interface ExpeditionYieldDebug {
  readonly id: number
  readonly displayNo: string
  readonly name: string
  readonly durationMinutes: number
  readonly effectiveCycleMinutes: number
  readonly baseReward: ExpeditionResources
  readonly resourceRewardAfterSuccessMultiplier: ExpeditionResources
  readonly resourceRewardAfterDaihatsu: ExpeditionResources
  readonly bucketExpectedPerRun: number
  readonly supplyCostPerRun: { readonly fuel: number; readonly ammo: number }
  readonly netRewardPerRun: ExpeditionResources
  readonly expectedNetPerHour: ResourceVector
  readonly itemRewardDebug: ExpeditionItemRewardDebug | null
  readonly selectedReasons: readonly string[]
}

export interface CombinationScoreDebug {
  readonly expeditionIds: readonly string[]
  readonly expeditionNames: readonly string[]
  readonly resourceScores: ResourceScoreDebugMap
  readonly totalScore: number
  readonly totalNetYield: ResourceVector
  readonly negativeResources: readonly ResourceKey[]
  readonly rank: number
}

export interface DetailedCombinationScoreDebug extends CombinationScoreDebug {
  readonly expeditionYields: readonly ExpeditionYieldDebug[]
}

export interface ResourceBenchmarkDebug {
  readonly resource: ResourceKey
  readonly bestPerHour: number
  readonly bestCombination: readonly string[]
}

export type ResourceBenchmarkDebugMap = Readonly<Record<ResourceKey, ResourceBenchmarkDebug>>

export interface OptimizationContextDebug {
  readonly fleetCount: number
  readonly weights: ResourceVector
  readonly preferenceMode: OptimizationPreference['mode']
  readonly preferences?: ResourcePreferenceMap
  readonly priorityOrder: readonly ResourcePriorityDebug[]
  readonly normalizedWeights: ResourceVector
  readonly collectionIntervalMinutes: number
  readonly successMode: 'normalSuccess' | 'greatSuccess'
  readonly baseRewardMultiplier: number
  readonly daihatsuBonus: number
  readonly effectiveResourceMultiplier: number
  readonly availableExpeditionCount: number
  readonly validCombinationCount: number
  readonly constraintRejectedCount: number
  readonly feasibleCombinationCount: number
  readonly scoredCombinationCount: number
  readonly totalCombinationCount: number
  readonly paretoRemovedCount: number
  readonly paretoRemainingCount: number
  readonly remainingCombinationCount: number
  readonly comparisonWindowMinutes: number
}

export interface ResourcePriorityDebug {
  readonly resource: ResourceKey
  readonly mode: ResourcePreference['mode']
  readonly rank: PriorityRank | null
  readonly minimumNetYieldPerHour?: number
  readonly internalWeight: number
  readonly normalizedWeight: number
}

export interface ResourceConstraintViolation {
  readonly resource: ResourceKey
  readonly actual: number
  readonly required: number
}

export interface ConstraintRejectedCombinationDebug {
  readonly expeditionIds: readonly string[]
  readonly expeditions: string
  readonly constraintViolations: readonly ResourceConstraintViolation[]
  readonly totalNetYield: ResourceVector
}

export interface OptimizationExplanationResourceDelta {
  readonly resource: ResourceKey
  readonly contributionDifference: number
  readonly yieldDifferencePerHour: number
  readonly explanation: string
}

export interface OptimizationExplanation {
  readonly winner: string
  readonly runnerUp: string
  readonly scoreDifference: number
  readonly advantages: readonly OptimizationExplanationResourceDelta[]
  readonly disadvantages: readonly OptimizationExplanationResourceDelta[]
  readonly summary: string
}

export interface OptimizationNearTieDebug {
  readonly scoreGap: number
  readonly contributionGaps: readonly OptimizationExplanationResourceDelta[]
}

export interface OptimizationParetoCombinationDebug {
  readonly requestedExpeditionIds: readonly string[]
  readonly expeditionIds: readonly string[]
  readonly validBeforePruning: boolean
  readonly paretoDominated: boolean
  readonly presentAfterPruning: boolean
  readonly dominatedBy: readonly string[] | null
  readonly rankAfterPruning: number | null
  readonly score: DetailedCombinationScoreDebug | null
}

export interface OptimizationParetoDebug {
  readonly totalCombinationCount: number
  readonly paretoRemovedCount: number
  readonly remainingCombinationCount: number
  readonly watchedCombinations: readonly OptimizationParetoCombinationDebug[]
}

export interface OptimizationCombinationComparisonResource {
  readonly resource: ResourceKey
  readonly leftYieldPerHour: number
  readonly rightYieldPerHour: number
  readonly yieldDifferencePerHour: number
  readonly leftContribution: number
  readonly rightContribution: number
  readonly contributionDifference: number
}

export interface OptimizationCombinationComparison {
  readonly left: string
  readonly right: string
  readonly leftScore: number
  readonly rightScore: number
  readonly winner: 'left' | 'right' | 'tie'
  readonly scoreDifference: number
  readonly resourceDeltas: readonly OptimizationCombinationComparisonResource[]
  readonly explanation: OptimizationExplanation | null
}

export interface OptimizationDebugViolation {
  readonly code: string
  readonly message: string
  readonly context: unknown
}

export interface OptimizationDebugReport {
  readonly context: OptimizationContextDebug
  readonly benchmarks: ResourceBenchmarkDebugMap
  readonly pareto: OptimizationParetoDebug
  readonly constraintRejectedCombinations: readonly ConstraintRejectedCombinationDebug[]
  readonly rankedCombinations: readonly CombinationScoreDebug[]
  readonly topCombinations: readonly CombinationScoreDebug[]
  readonly detailedCombinations: readonly DetailedCombinationScoreDebug[]
  readonly winnerExplanation: OptimizationExplanation | null
  readonly nearTie: OptimizationNearTieDebug | null
}

export type ExpeditionPlannerResult =
  | {
      readonly status: 'success'
      readonly generatedAt: string
      readonly current: ExpeditionResources
      readonly resourceWeights: ExpeditionResources
      readonly maxResource: number
      readonly candidateCount: number
      readonly combinationCount: number
      readonly prunedCombinationCount: number
      readonly settings: {
        readonly afkMinutes: number
        readonly fleetCount: number
        readonly comparisonWindowMinutes: number
        readonly resourceWeights: ExpeditionResources
        readonly bucketWeight: number
        readonly mode: 'online' | 'afk'
        readonly incomeModifier: {
          readonly greatSuccess: boolean
          readonly daihatsuCount: number
          readonly factor: number
        }
        readonly usesExpeditionTableCostConfig: false
        readonly resupplyCostModel: 'kancepts-account'
      }
      readonly plans: readonly ExpeditionPlan[]
      readonly optimizationDebug?: OptimizationDebugReport
    }
  | {
      readonly status: 'no-solution'
      readonly reason: string
      readonly reasonCode: 'INSUFFICIENT_FLEETS' | 'INSUFFICIENT_EXPEDITIONS'
      readonly reasonValues: Readonly<Record<string, number>>
      readonly generatedAt: string
      readonly current: ExpeditionResources
      readonly maxResource: number
    }
  | {
      readonly status: 'no-feasible-plan'
      readonly reason: string
      readonly reasonCode: 'RESOURCE_CONSTRAINTS'
      readonly reasonValues: Readonly<Record<string, number>>
      readonly generatedAt: string
      readonly current: ExpeditionResources
      readonly maxResource: number
      readonly constraintRejectedCount: number
      readonly feasibleCombinationCount: number
      readonly closestViolations: readonly ResourceConstraintViolation[]
      readonly optimizationDebug?: OptimizationDebugReport
    }

type UnknownRecord = Record<string, unknown>

const asRecord = (value: unknown, path: string): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} 必須是物件`)
  }
  return value as UnknownRecord
}

const asArray = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${path} 必須是陣列`)
  return value
}

const asNumber = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} 必須是數字`)
  return value
}

const asString = (value: unknown, path: string): string => {
  if (typeof value !== 'string') throw new Error(`${path} 必須是字串`)
  return value
}

const asBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${path} 必須是布林值`)
  return value
}

const nullableNumber = (value: unknown, path: string): number | null =>
  value === null ? null : asNumber(value, path)

const nullableBoolean = (value: unknown, path: string): boolean | null =>
  value === null ? null : asBoolean(value, path)

const parseResources = (value: unknown, path: string): ExpeditionResources => {
  const record = asRecord(value, path)
  return Object.fromEntries(
    EXPEDITION_RESOURCE_KEYS.map((key) => [key, asNumber(record[key], `${path}.${key}`)]),
  ) as unknown as ExpeditionResources
}

const parseCurrentMission = (value: unknown, path: string): ExpeditionCurrentMission | null => {
  if (value === null) return null
  const record = asRecord(value, path)
  return {
    id: asNumber(record.id, `${path}.id`),
    displayNo: asString(record.displayNo, `${path}.displayNo`),
    name: asString(record.name, `${path}.name`),
    completesAt: asNumber(record.completesAt, `${path}.completesAt`),
  }
}

const parseRequirements = (value: unknown, path: string): ExpeditionRequirements => {
  const record = asRecord(value, path)
  return {
    flagShipLevel: asNumber(record.flagShipLevel, `${path}.flagShipLevel`),
    flagShipTypeOf:
      record.flagShipTypeOf === null
        ? null
        : asArray(record.flagShipTypeOf, `${path}.flagShipTypeOf`).map((item, index) =>
            asString(item, `${path}.flagShipTypeOf[${index}]`),
          ),
    shipCount: asNumber(record.shipCount, `${path}.shipCount`),
    levelCount: nullableNumber(record.levelCount, `${path}.levelCount`),
    totalAsw: nullableNumber(record.totalAsw, `${path}.totalAsw`),
    totalLos: nullableNumber(record.totalLos, `${path}.totalLos`),
    totalAa: nullableNumber(record.totalAa, `${path}.totalAa`),
    totalFp: nullableNumber(record.totalFp, `${path}.totalFp`),
    totalTorp: nullableNumber(record.totalTorp, `${path}.totalTorp`),
    drumCount: nullableNumber(record.drumCount, `${path}.drumCount`),
    drumCarrierCount: nullableNumber(record.drumCarrierCount, `${path}.drumCarrierCount`),
    fleetSType: asArray(record.fleetSType, `${path}.fleetSType`).map((item, index) => {
      const group = asRecord(item, `${path}.fleetSType[${index}]`)
      return {
        count: asNumber(group.count, `${path}.fleetSType[${index}].count`),
        oneOf: asArray(group.oneOf, `${path}.fleetSType[${index}].oneOf`).map((entry, itemIndex) =>
          asString(entry, `${path}.fleetSType[${index}].oneOf[${itemIndex}]`),
        ),
      }
    }),
    sampleFleet: asArray(record.sampleFleet, `${path}.sampleFleet`).map((item, index) =>
      asString(item, `${path}.sampleFleet[${index}]`),
    ),
  }
}

const parseRequirementResult = (value: unknown, path: string): ExpeditionRequirementResult => {
  const record = asRecord(value, path)
  return {
    flagShipLevel: asBoolean(record.flagShipLevel, `${path}.flagShipLevel`),
    flagShipTypeOf: nullableBoolean(record.flagShipTypeOf, `${path}.flagShipTypeOf`),
    shipCount: asBoolean(record.shipCount, `${path}.shipCount`),
    levelCount: nullableBoolean(record.levelCount, `${path}.levelCount`),
    totalAsw: nullableBoolean(record.totalAsw, `${path}.totalAsw`),
    totalLos: nullableBoolean(record.totalLos, `${path}.totalLos`),
    totalAa: nullableBoolean(record.totalAa, `${path}.totalAa`),
    totalFp: nullableBoolean(record.totalFp, `${path}.totalFp`),
    totalTorp: nullableBoolean(record.totalTorp, `${path}.totalTorp`),
    drumCount: nullableBoolean(record.drumCount, `${path}.drumCount`),
    drumCarrierCount: nullableBoolean(record.drumCarrierCount, `${path}.drumCarrierCount`),
    fleetSType: asArray(record.fleetSType, `${path}.fleetSType`).map((item, index) =>
      asBoolean(item, `${path}.fleetSType[${index}]`),
    ),
  }
}

const parseFleetActual = (value: unknown, path: string): ExpeditionFleetActual => {
  const record = asRecord(value, path)
  return {
    flagShipLevel: asNumber(record.flagShipLevel, `${path}.flagShipLevel`),
    flagShipType: asString(record.flagShipType, `${path}.flagShipType`),
    shipCount: asNumber(record.shipCount, `${path}.shipCount`),
    levelCount: asNumber(record.levelCount, `${path}.levelCount`),
    totalAsw: asNumber(record.totalAsw, `${path}.totalAsw`),
    totalLos: asNumber(record.totalLos, `${path}.totalLos`),
    totalAa: asNumber(record.totalAa, `${path}.totalAa`),
    totalFp: asNumber(record.totalFp, `${path}.totalFp`),
    totalTorp: asNumber(record.totalTorp, `${path}.totalTorp`),
    drumCount: asNumber(record.drumCount, `${path}.drumCount`),
    drumCarrierCount: asNumber(record.drumCarrierCount, `${path}.drumCarrierCount`),
    sparkledCount: asNumber(record.sparkledCount, `${path}.sparkledCount`),
    types: asArray(record.types, `${path}.types`).map((item, index) =>
      asString(item, `${path}.types[${index}]`),
    ),
  }
}

const parseFleetCheck = (value: unknown, path: string): ExpeditionFleetCheckSnapshot => {
  const record = asRecord(value, path)
  const busy = asBoolean(record.busy, `${path}.busy`)
  const currentMission = parseCurrentMission(record.currentMission, `${path}.currentMission`)
  if (busy !== Boolean(currentMission)) {
    throw new Error(`${path}.busy 與 ${path}.currentMission 不一致`)
  }
  if (
    currentMission &&
    (currentMission.id <= 0 ||
      currentMission.displayNo.length === 0 ||
      currentMission.name.length === 0 ||
      currentMission.completesAt <= 0)
  ) {
    throw new Error(`${path}.currentMission 內容不完整`)
  }
  return {
    fleetNumber: asNumber(record.fleetNumber, `${path}.fleetNumber`),
    fleetName: asString(record.fleetName, `${path}.fleetName`),
    busy,
    currentMission,
    shipCount: asNumber(record.shipCount, `${path}.shipCount`),
    isSupplied: asBoolean(record.isSupplied, `${path}.isSupplied`),
    actual: parseFleetActual(record.actual, `${path}.actual`),
    result: parseRequirementResult(record.result, `${path}.result`),
  }
}

const parseGreatSuccessCondition = (
  value: unknown,
  path: string,
): ExpeditionCandidateSnapshot['greatSuccessCondition'] => {
  const record = asRecord(value, path)
  const type = asString(record.type, `${path}.type`)
  if (type === 'drums') return { type, count: asNumber(record.count, `${path}.count`) }
  if (type === 'flagship-level' || type === 'all-sparkle' || type === 'unknown') return { type }
  throw new Error(`${path}.type 不支援`)
}

const parseExpeditionItemRewardSlot = (value: unknown, path: string): ExpeditionItemRewardSlot => {
  const slot = asString(value, path)
  if (slot === 'left' || slot === 'right' || slot === 'unknown') return slot
  throw new Error(`${path} 不支援`)
}

const parseExpeditionItemRewardRule = (
  value: unknown,
  itemSlot: ExpeditionItemRewardSlot,
  path: string,
): ExpeditionItemRewardRule => {
  if (typeof value === 'undefined') {
    return itemSlot === 'right' ? 'great-success-guaranteed' : 'random'
  }
  const rule = asString(value, path)
  if (rule === 'random' || rule === 'great-success-guaranteed') return rule
  throw new Error(`${path} 不支援`)
}

const defaultBucketReward = (bucketMaxPerTrip: number): ExpeditionBucketRewardSnapshot | null =>
  bucketMaxPerTrip > 0
    ? {
        item: 'bucket',
        min: 0,
        max: bucketMaxPerTrip,
        itemSlot: 'unknown',
        rewardRule: 'random',
        acquisitionProbability: null,
      }
    : null

const parseBucketReward = (
  value: unknown,
  bucketMaxPerTrip: number,
  path: string,
): ExpeditionBucketRewardSnapshot | null => {
  if (typeof value === 'undefined') return defaultBucketReward(bucketMaxPerTrip)
  if (value === null) return null
  const record = asRecord(value, path)
  const item = asString(record.item, `${path}.item`)
  if (item !== 'bucket') throw new Error(`${path}.item 不支援`)
  const itemSlot = parseExpeditionItemRewardSlot(record.itemSlot, `${path}.itemSlot`)
  return {
    item,
    min: asNumber(record.min, `${path}.min`),
    max: asNumber(record.max, `${path}.max`),
    itemSlot,
    rewardRule: parseExpeditionItemRewardRule(record.rewardRule, itemSlot, `${path}.rewardRule`),
    acquisitionProbability:
      typeof record.acquisitionProbability === 'undefined' || record.acquisitionProbability === null
        ? null
        : asNumber(record.acquisitionProbability, `${path}.acquisitionProbability`),
  }
}

const parseCandidate = (value: unknown, path: string): ExpeditionCandidateSnapshot => {
  const record = asRecord(value, path)
  const bucketMaxPerTrip = asNumber(record.bucketMaxPerTrip, `${path}.bucketMaxPerTrip`)
  return {
    id: asNumber(record.id, `${path}.id`),
    displayNo: asString(record.displayNo, `${path}.displayNo`),
    name: asString(record.name, `${path}.name`),
    durationMinutes: asNumber(record.durationMinutes, `${path}.durationMinutes`),
    baseIncome: parseResources(record.baseIncome, `${path}.baseIncome`),
    bucketMaxPerTrip,
    bucketReward: parseBucketReward(record.bucketReward, bucketMaxPerTrip, `${path}.bucketReward`),
    fuelPercent: asNumber(record.fuelPercent, `${path}.fuelPercent`),
    ammoPercent: asNumber(record.ammoPercent, `${path}.ammoPercent`),
    requirements: parseRequirements(record.requirements, `${path}.requirements`),
    greatSuccessCondition: parseGreatSuccessCondition(
      record.greatSuccessCondition,
      `${path}.greatSuccessCondition`,
    ),
    monthly: asBoolean(record.monthly, `${path}.monthly`),
    fleetChecks: asArray(record.fleetChecks, `${path}.fleetChecks`).map((item, index) =>
      parseFleetCheck(item, `${path}.fleetChecks[${index}]`),
    ),
  }
}

export const parseKC3ExpeditionPlannerSnapshot = (value: unknown): ExpeditionPlannerSnapshot => {
  const record = asRecord(value, 'snapshot')
  return {
    generatedAt: asString(record.generatedAt, 'snapshot.generatedAt'),
    current: parseResources(record.current, 'snapshot.current'),
    maxResource: asNumber(record.maxResource, 'snapshot.maxResource'),
    modifierFactor: asNumber(record.modifierFactor, 'snapshot.modifierFactor'),
    accountShips: asArray(record.accountShips, 'snapshot.accountShips').map((item, index) => {
      const ship = asRecord(item, `snapshot.accountShips[${index}]`)
      return {
        masterId: asNumber(ship.masterId, `snapshot.accountShips[${index}].masterId`),
        level: asNumber(ship.level, `snapshot.accountShips[${index}].level`),
        stype: asNumber(ship.stype, `snapshot.accountShips[${index}].stype`),
        maxFuel: asNumber(ship.maxFuel, `snapshot.accountShips[${index}].maxFuel`),
        maxAmmo: asNumber(ship.maxAmmo, `snapshot.accountShips[${index}].maxAmmo`),
      }
    }),
    fleetNumbers: asArray(record.fleetNumbers, 'snapshot.fleetNumbers').map((item, index) =>
      asNumber(item, `snapshot.fleetNumbers[${index}]`),
    ),
    candidates: asArray(record.candidates, 'snapshot.candidates').map((item, index) =>
      parseCandidate(item, `snapshot.candidates[${index}]`),
    ),
  }
}

type CostComposition = Readonly<Record<string, number>>

const MINIMUM_COMPOSITIONS: Readonly<Record<number, CostComposition>> = {
  1: { any: 2 },
  2: { any: 4 },
  3: { any: 3 },
  4: { cl: 1, dd: 2 },
  5: { cl: 1, dd: 2, any: 1 },
  6: { any: 4 },
  7: { any: 6 },
  8: { any: 6 },
  9: { cl: 1, dd: 2, any: 1 },
  10: { cl: 2, any: 1 },
  11: { dd: 2, any: 2 },
  12: { dd: 2, any: 2 },
  13: { cl: 1, dd: 4, any: 1 },
  14: { cl: 1, dd: 3, any: 2 },
  15: { cvLike: 2, dd: 2, any: 2 },
  16: { cl: 1, dd: 2, any: 3 },
  17: { cl: 1, dd: 3, any: 2 },
  18: { cvLike: 3, dd: 2, any: 1 },
  19: { bbv: 2, dd: 2, any: 2 },
  20: { ssLike: 1, cl: 1 },
  21: { cl: 1, dd: 4 },
  22: { ca: 1, cl: 1, dd: 2, any: 2 },
  23: { bbv: 2, dd: 2, any: 2 },
  24: { cl: 1, dd: 4, any: 1 },
  25: { ca: 2, dd: 2 },
  26: { cvLike: 1, cl: 1, dd: 2 },
  27: { ssLike: 2 },
  28: { ssLike: 3 },
  29: { ssLike: 3 },
  30: { ssLike: 4 },
  31: { ssLike: 4 },
  32: { ct: 1, dd: 2 },
  33: { dd: 2 },
  34: { dd: 2 },
  35: { cvLike: 2, ca: 1, dd: 1, any: 2 },
  36: { av: 2, cl: 1, dd: 1, any: 2 },
  37: { cl: 1, dd: 5 },
  38: { dd: 5, any: 1 },
  39: { as: 1, ssLike: 4 },
  40: { cl: 1, av: 2, dd: 2, any: 1 },
  100: { dd: 3, any: 1 },
  101: { dd: 4 },
  102: { cl: 1, dd: 3, any: 1 },
  110: { cl: 1, av: 1, dd: 2, any: 2 },
}

const emptyResources = (): ExpeditionResources => ({ fuel: 0, ammo: 0, steel: 0, bauxite: 0 })

const emptyResourceVector = (): ResourceVector => ({
  fuel: 0,
  ammo: 0,
  steel: 0,
  bauxite: 0,
  bucket: 0,
})

const isPriorityRank = (value: number): value is PriorityRank =>
  Number.isInteger(value) && value >= 1 && value <= 5

export const priorityRankToWeight = (rank: PriorityRank | null): number =>
  rank === null ? 0 : PRIORITY_WEIGHT_BY_RANK[rank]

export const validateResourcePriorityMap = (priorities: ResourcePriorityMap): boolean => {
  const activeRanks = EXPEDITION_UTILITY_RESOURCE_KEYS.map((resource) => priorities[resource])
    .filter((rank): rank is PriorityRank => rank !== null)
    .sort((left, right) => left - right)
  return (
    activeRanks.every(isPriorityRank) &&
    new Set(activeRanks).size === activeRanks.length &&
    activeRanks.every((rank, index) => rank === index + 1)
  )
}

export const resourcePreferencesFromPriorityMap = (
  priorities: ResourcePriorityMap,
): ResourcePreferenceMap => ({
  fuel: priorities.fuel === null ? { mode: 'ignore' } : { mode: 'optimize', rank: priorities.fuel },
  ammo: priorities.ammo === null ? { mode: 'ignore' } : { mode: 'optimize', rank: priorities.ammo },
  steel:
    priorities.steel === null ? { mode: 'ignore' } : { mode: 'optimize', rank: priorities.steel },
  bauxite:
    priorities.bauxite === null
      ? { mode: 'ignore' }
      : { mode: 'optimize', rank: priorities.bauxite },
  bucket:
    priorities.bucket === null ? { mode: 'ignore' } : { mode: 'optimize', rank: priorities.bucket },
})

export const validateResourcePreferenceMap = (preferences: ResourcePreferenceMap): boolean => {
  const optimizeRanks = EXPEDITION_UTILITY_RESOURCE_KEYS.map((resource) => {
    const preference = preferences[resource]
    return preference.mode === 'optimize' ? preference.rank : null
  })
    .filter((rank): rank is PriorityRank => rank !== null)
    .sort((left, right) => left - right)
  return (
    optimizeRanks.every(isPriorityRank) &&
    new Set(optimizeRanks).size === optimizeRanks.length &&
    optimizeRanks.every((rank, index) => rank === index + 1) &&
    EXPEDITION_UTILITY_RESOURCE_KEYS.every((resource) => {
      const preference = preferences[resource]
      return preference.mode !== 'constraint' || Number.isFinite(preference.minimumNetYieldPerHour)
    })
  )
}

export const priorityPreferenceToWeights = (priorities: ResourcePriorityMap): ResourceVector => {
  if (!validateResourcePriorityMap(priorities)) {
    throw new Error('Resource priority ranks must be unique and continuous from 1.')
  }
  return resourcePreferencesToWeights(resourcePreferencesFromPriorityMap(priorities))
}

export const resourcePreferencesToWeights = (
  preferences: ResourcePreferenceMap,
): ResourceVector => {
  if (!validateResourcePreferenceMap(preferences)) {
    throw new Error('Optimized resource ranks must be unique and continuous from 1.')
  }
  const weightForResource = (resource: ResourceKey): number => {
    const preference = preferences[resource]
    return preference.mode === 'optimize' ? priorityRankToWeight(preference.rank) : 0
  }
  return {
    fuel: weightForResource('fuel'),
    ammo: weightForResource('ammo'),
    steel: weightForResource('steel'),
    bauxite: weightForResource('bauxite'),
    bucket: weightForResource('bucket'),
  }
}

export const resourceConstraintViolations = (
  yieldValue: ResourceVector,
  preferences: ResourcePreferenceMap,
): readonly ResourceConstraintViolation[] =>
  EXPEDITION_UTILITY_RESOURCE_KEYS.flatMap((resource): readonly ResourceConstraintViolation[] => {
    const preference = preferences[resource]
    if (preference.mode !== 'constraint') return []
    const actual = finiteOrZero(yieldValue[resource])
    const required = preference.minimumNetYieldPerHour
    return actual + RESOURCE_CONSTRAINT_EPSILON >= required ? [] : [{ resource, actual, required }]
  })

export const satisfiesResourceConstraints = (
  yieldValue: ResourceVector,
  preferences: ResourcePreferenceMap,
): boolean => resourceConstraintViolations(yieldValue, preferences).length === 0

const finiteOrZero = (value: number): number => (Number.isFinite(value) ? value : 0)

export const clampSatisfaction = (value: number): number =>
  Math.max(-1, Math.min(1, finiteOrZero(value)))

const calculateSatisfactionValue = (yieldValue: number, benchmark: number): number => {
  const safeYield = finiteOrZero(yieldValue)
  const safeBenchmark = finiteOrZero(benchmark)
  if (safeBenchmark <= 0) return 0
  return clampSatisfaction(safeYield / safeBenchmark)
}

export const resourceUtility = (satisfaction: number): number => {
  const clamped = clampSatisfaction(satisfaction)
  return 1 - (1 - clamped) ** 2
}

export const calculateResourceBenchmarks = (
  yieldValues: readonly ResourceVector[],
): ResourceVector =>
  yieldValues.reduce(
    (maximums, yieldValue) => ({
      fuel: Math.max(maximums.fuel, finiteOrZero(yieldValue.fuel)),
      ammo: Math.max(maximums.ammo, finiteOrZero(yieldValue.ammo)),
      steel: Math.max(maximums.steel, finiteOrZero(yieldValue.steel)),
      bauxite: Math.max(maximums.bauxite, finiteOrZero(yieldValue.bauxite)),
      bucket: Math.max(maximums.bucket, finiteOrZero(yieldValue.bucket)),
    }),
    emptyResourceVector(),
  )

export const calculateResourceYieldMaximums = calculateResourceBenchmarks

export const calculateSatisfaction = (
  yieldValue: ResourceVector,
  benchmarks: ResourceVector,
): ResourceVector => ({
  fuel: calculateSatisfactionValue(yieldValue.fuel, benchmarks.fuel),
  ammo: calculateSatisfactionValue(yieldValue.ammo, benchmarks.ammo),
  steel: calculateSatisfactionValue(yieldValue.steel, benchmarks.steel),
  bauxite: calculateSatisfactionValue(yieldValue.bauxite, benchmarks.bauxite),
  bucket: calculateSatisfactionValue(yieldValue.bucket, benchmarks.bucket),
})

export const normalizeResourceYield = (
  yieldValue: ResourceVector,
  benchmarks: ResourceVector,
): ResourceVector => calculateSatisfaction(yieldValue, benchmarks)

export const calculateResourceUtility = (satisfaction: ResourceVector): ResourceVector => ({
  fuel: resourceUtility(satisfaction.fuel),
  ammo: resourceUtility(satisfaction.ammo),
  steel: resourceUtility(satisfaction.steel),
  bauxite: resourceUtility(satisfaction.bauxite),
  bucket: resourceUtility(satisfaction.bucket),
})

export const calculateTotalWeight = (weights: ResourceVector): number =>
  EXPEDITION_UTILITY_RESOURCE_KEYS.reduce(
    (total, key) => total + Math.abs(finiteOrZero(weights[key])),
    0,
  )

export const normalizeResourceWeights = (weights: ResourceVector): ResourceVector => {
  const totalWeight = calculateTotalWeight(weights)
  if (totalWeight <= 0) return emptyResourceVector()
  return {
    fuel: finiteOrZero(weights.fuel) / totalWeight,
    ammo: finiteOrZero(weights.ammo) / totalWeight,
    steel: finiteOrZero(weights.steel) / totalWeight,
    bauxite: finiteOrZero(weights.bauxite) / totalWeight,
    bucket: finiteOrZero(weights.bucket) / totalWeight,
  }
}

export const calculateWeightedContribution = (
  utility: ResourceVector,
  normalizedWeights: ResourceVector,
): ResourceVector => ({
  fuel: utility.fuel * normalizedWeights.fuel,
  ammo: utility.ammo * normalizedWeights.ammo,
  steel: utility.steel * normalizedWeights.steel,
  bauxite: utility.bauxite * normalizedWeights.bauxite,
  bucket: utility.bucket * normalizedWeights.bucket,
})

const sumResourceVector = (values: ResourceVector): number =>
  EXPEDITION_UTILITY_RESOURCE_KEYS.reduce((sum, key) => sum + values[key], 0)

export const calculateCombinationScore = (
  satisfaction: ResourceVector,
  weights: ResourceVector,
): number =>
  sumResourceVector(
    calculateWeightedContribution(
      calculateResourceUtility(satisfaction),
      normalizeResourceWeights(weights),
    ),
  )

export const calculateUtilityScore = calculateCombinationScore

export const calculatePlanScoreDetails = (
  expectedNetYield: ResourceVector,
  benchmark: ResourceVector,
  weights: ResourceVector,
): ExpeditionPlanScoreDetails => {
  const satisfaction = calculateSatisfaction(expectedNetYield, benchmark)
  const utility = calculateResourceUtility(satisfaction)
  const normalizedWeight = normalizeResourceWeights(weights)
  const weightedContribution = calculateWeightedContribution(utility, normalizedWeight)
  return {
    expectedNetYield,
    benchmark,
    satisfaction,
    utility,
    normalizedWeight,
    weightedContribution,
    totalScore: sumResourceVector(weightedContribution),
  }
}

const DEFAULT_DEBUG_RANK_LIMIT = 10
const DETAILED_DEBUG_RANK_LIMIT = 5
const NEAR_TIE_SCORE_THRESHOLD = 0.01
const SCORING_INVARIANT_EPSILON = 1e-9
const DEBUG_WATCHED_COMBINATIONS: readonly (readonly string[])[] = [
  ['02', '05', '38'],
  ['A2', '05', '38'],
  ['02', 'A2', '38'],
  ['05', 'A2', 'B1'],
  ['02', 'A2', 'B1'],
]

const resourceVectorFromWeights = (
  resourceWeights: ExpeditionResources,
  bucketWeight: number,
): ResourceVector => ({
  ...resourceWeights,
  bucket: bucketWeight,
})

const optimizationPreferenceFromLegacyWeights = (
  resourceWeights: ExpeditionResources,
  bucketWeight: number,
): CustomWeightPreference => ({
  mode: 'customWeight',
  weights: resourceVectorFromWeights(resourceWeights, bucketWeight),
})

const weightsFromOptimizationPreference = (preference: OptimizationPreference): ResourceVector =>
  preference.mode === 'priority'
    ? resourcePreferencesToWeights(preference.preferences)
    : preference.weights

const constraintPreferencesFromOptimizationPreference = (
  preference: OptimizationPreference,
): ResourcePreferenceMap | null => (preference.mode === 'priority' ? preference.preferences : null)

const priorityOrderDebug = (
  preference: OptimizationPreference,
  normalizedWeights: ResourceVector,
): readonly ResourcePriorityDebug[] => {
  if (preference.mode !== 'priority') return []
  return EXPEDITION_UTILITY_RESOURCE_KEYS.map((resource) => {
    const resourcePreference = preference.preferences[resource]
    const rank = resourcePreference.mode === 'optimize' ? resourcePreference.rank : null
    return {
      resource,
      mode: resourcePreference.mode,
      rank,
      ...(resourcePreference.mode === 'constraint'
        ? { minimumNetYieldPerHour: resourcePreference.minimumNetYieldPerHour }
        : {}),
      internalWeight: priorityRankToWeight(rank),
      normalizedWeight: normalizedWeights[resource],
    }
  }).sort((left, right) => {
    if (left.rank === null && right.rank === null) {
      return (
        EXPEDITION_UTILITY_RESOURCE_KEYS.indexOf(left.resource) -
        EXPEDITION_UTILITY_RESOURCE_KEYS.indexOf(right.resource)
      )
    }
    if (left.rank === null) return 1
    if (right.rank === null) return -1
    return left.rank - right.rank
  })
}

const DEFAULT_RANDOM_ITEM_REWARD_PROBABILITY = 0.5

const clampProbability = (value: number): number => Math.max(0, Math.min(1, finiteOrZero(value)))

const bucketRewardBounds = (
  reward: ExpeditionBucketRewardSnapshot,
): { readonly min: number; readonly max: number } => {
  const min = Math.max(0, finiteOrZero(reward.min))
  return { min, max: Math.max(min, finiteOrZero(reward.max)) }
}

const bucketAcquisitionProbability = (
  reward: ExpeditionBucketRewardSnapshot,
  greatSuccess: boolean,
): number => {
  if (reward.rewardRule === 'great-success-guaranteed') return greatSuccess ? 1 : 0
  return clampProbability(reward.acquisitionProbability ?? DEFAULT_RANDOM_ITEM_REWARD_PROBABILITY)
}

export const calculateBucketExpectedPerRun = (
  reward: ExpeditionBucketRewardSnapshot | null,
  greatSuccess: boolean,
): number => {
  if (!reward) return 0
  const { min, max } = bucketRewardBounds(reward)
  const probability = bucketAcquisitionProbability(reward, greatSuccess)
  return min + (max - min) * probability
}

const finiteResourceValues = (values: ResourceVector): boolean =>
  EXPEDITION_UTILITY_RESOURCE_KEYS.every((key) => Number.isFinite(values[key]))

const combinationLabel = (ids: readonly string[]): string => ids.join(' + ')

const canonicalExpeditionId = (value: string): string => {
  const normalized = value.trim().toUpperCase()
  return /^\d+$/.test(normalized) ? String(Number(normalized)) : normalized
}

const combinationKey = (ids: readonly string[]): string =>
  ids.map(canonicalExpeditionId).sort().join('|')

const planDisplayIds = (plan: Pick<ExpeditionPlan, 'pairings'>): readonly string[] =>
  plan.pairings.map(({ expedition }) => expedition.displayNo).sort()

const scoreDeltaExplanation = (
  resource: ResourceKey,
  contributionDifference: number,
  yieldDifferencePerHour: number,
): string => {
  const direction = contributionDifference >= 0 ? 'advantage' : 'disadvantage'
  return `${resource} is a ${direction}: contribution ${contributionDifference >= 0 ? '+' : ''}${contributionDifference}, yield ${yieldDifferencePerHour >= 0 ? '+' : ''}${yieldDifferencePerHour}/h.`
}

const resourceDelta = (
  winner: CombinationScoreDebug,
  runnerUp: CombinationScoreDebug,
  resource: ResourceKey,
): OptimizationExplanationResourceDelta => {
  const contributionDifference =
    winner.resourceScores[resource].weightedContribution -
    runnerUp.resourceScores[resource].weightedContribution
  const yieldDifferencePerHour =
    winner.resourceScores[resource].rawYieldPerHour -
    runnerUp.resourceScores[resource].rawYieldPerHour
  return {
    resource,
    contributionDifference,
    yieldDifferencePerHour,
    explanation: scoreDeltaExplanation(resource, contributionDifference, yieldDifferencePerHour),
  }
}

export const explainWinner = (
  winner: CombinationScoreDebug,
  runnerUp: CombinationScoreDebug,
): OptimizationExplanation => {
  const deltas = EXPEDITION_UTILITY_RESOURCE_KEYS.map((resource) =>
    resourceDelta(winner, runnerUp, resource),
  ).sort(
    (left, right) => Math.abs(right.contributionDifference) - Math.abs(left.contributionDifference),
  )
  const advantages = deltas.filter((delta) => delta.contributionDifference > 0)
  const disadvantages = deltas.filter((delta) => delta.contributionDifference < 0)
  const topAdvantages = advantages
    .slice(0, 2)
    .map((delta) => delta.resource)
    .join(' and ')
  const tradeOffs = disadvantages
    .slice(0, 2)
    .map((delta) => delta.resource)
    .join(' and ')
  const summary =
    topAdvantages.length === 0
      ? `${combinationLabel(winner.expeditionIds)} wins by tie-breakers or very small contribution gaps.`
      : `${combinationLabel(winner.expeditionIds)} wins mainly from ${topAdvantages}${tradeOffs.length > 0 ? `, enough to offset lower ${tradeOffs}` : ''}.`

  return {
    winner: combinationLabel(winner.expeditionIds),
    runnerUp: combinationLabel(runnerUp.expeditionIds),
    scoreDifference: winner.totalScore - runnerUp.totalScore,
    advantages,
    disadvantages,
    summary,
  }
}

const createResourceScoreDebugMap = (
  scoreDetails: ExpeditionPlanScoreDetails,
  weights: ResourceVector,
): ResourceScoreDebugMap => {
  const create = (resource: ResourceKey): ResourceScoreDebug => {
    const weightedContribution = scoreDetails.weightedContribution[resource]
    return {
      rawYieldPerHour: scoreDetails.expectedNetYield[resource],
      benchmarkPerHour: scoreDetails.benchmark[resource],
      satisfaction: scoreDetails.satisfaction[resource],
      utility: scoreDetails.utility[resource],
      rawWeight: weights[resource],
      normalizedWeight: scoreDetails.normalizedWeight[resource],
      weightedContribution,
      contributionRatio:
        scoreDetails.totalScore === 0 ? 0 : weightedContribution / scoreDetails.totalScore,
    }
  }
  return {
    fuel: create('fuel'),
    ammo: create('ammo'),
    steel: create('steel'),
    bauxite: create('bauxite'),
    bucket: create('bucket'),
  }
}

const createCombinationScoreDebug = (
  plan: Pick<ExpeditionPlan, 'pairings' | 'scoreDetails'>,
  weights: ResourceVector,
  rank: number,
): CombinationScoreDebug => ({
  expeditionIds: planDisplayIds(plan),
  expeditionNames: plan.pairings.map(({ expedition }) => expedition.name),
  resourceScores: createResourceScoreDebugMap(plan.scoreDetails, weights),
  totalScore: plan.scoreDetails.totalScore,
  totalNetYield: plan.scoreDetails.expectedNetYield,
  negativeResources: EXPEDITION_UTILITY_RESOURCE_KEYS.filter(
    (resource) => plan.scoreDetails.expectedNetYield[resource] < 0,
  ),
  rank,
})

const expeditionResourceRewardAfterSuccess = (
  expedition: ExpeditionPlanPairing['expedition'],
): ExpeditionResources => {
  const successMultiplier = expedition.modifier.greatSuccess ? 1.5 : 1
  return mapResources(expedition.baseIncome, (value) => Math.floor(value * successMultiplier))
}

const expeditionResourceRewardAfterDaihatsu = (
  expedition: ExpeditionPlanPairing['expedition'],
): ExpeditionResources => ({
  fuel: expedition.netIncome.fuel + expedition.estimatedResupplyCost.fuel,
  ammo: expedition.netIncome.ammo + expedition.estimatedResupplyCost.ammo,
  steel: expedition.netIncome.steel,
  bauxite: expedition.netIncome.bauxite,
})

const selectedReasonsForExpedition = (
  expedition: ExpeditionPlanPairing['expedition'],
  weights: ResourceVector,
): readonly string[] => {
  const expectedNetPerHour: ResourceVector = {
    ...expedition.hourlyIncome,
    bucket: expedition.bucketPotential.hourly,
  }
  const weightedPositiveResources = EXPEDITION_UTILITY_RESOURCE_KEYS.filter(
    (resource) => weights[resource] > 0 && expectedNetPerHour[resource] > 0,
  ).sort(
    (left, right) =>
      expectedNetPerHour[right] * weights[right] - expectedNetPerHour[left] * weights[left],
  )
  if (weightedPositiveResources.length === 0) {
    return [
      'Included by the winning combination trade-off, not by a positive weighted yield alone.',
    ]
  }
  return weightedPositiveResources
    .slice(0, 3)
    .map((resource) => `Adds positive ${resource} yield for a weighted objective.`)
}

const createExpeditionYieldDebug = (
  pairing: ExpeditionPlanPairing,
  weights: ResourceVector,
): ExpeditionYieldDebug => {
  const { expedition } = pairing
  const expectedNetPerHour: ResourceVector = {
    ...expedition.hourlyIncome,
    bucket: expedition.bucketPotential.hourly,
  }
  const itemRewardDebug: ExpeditionItemRewardDebug | null = expedition.bucketReward
    ? {
        ...expedition.bucketReward,
        itemPosition: expedition.bucketReward.itemSlot,
        successMode: expedition.modifier.greatSuccess ? 'greatSuccess' : 'normalSuccess',
        acquisitionProbability: bucketAcquisitionProbability(
          expedition.bucketReward,
          expedition.modifier.greatSuccess,
        ),
        expectedPerRun: expedition.bucketPotential.expectedPerTrip,
        expectedPerHour: expedition.bucketPotential.hourly,
      }
    : null

  return {
    id: expedition.id,
    displayNo: expedition.displayNo,
    name: expedition.name,
    durationMinutes: expedition.durationMinutes,
    effectiveCycleMinutes: expedition.effectiveCycleMinutes,
    baseReward: expedition.baseIncome,
    resourceRewardAfterSuccessMultiplier: expeditionResourceRewardAfterSuccess(expedition),
    resourceRewardAfterDaihatsu: expeditionResourceRewardAfterDaihatsu(expedition),
    bucketExpectedPerRun: expedition.bucketPotential.expectedPerTrip,
    supplyCostPerRun: expedition.estimatedResupplyCost,
    netRewardPerRun: expedition.netIncome,
    expectedNetPerHour,
    itemRewardDebug,
    selectedReasons: selectedReasonsForExpedition(expedition, weights),
  }
}

const createDetailedCombinationScoreDebug = (
  plan: Pick<ExpeditionPlan, 'pairings' | 'scoreDetails'>,
  weights: ResourceVector,
  rank: number,
): DetailedCombinationScoreDebug => ({
  ...createCombinationScoreDebug(plan, weights, rank),
  expeditionYields: plan.pairings.map((pairing) => createExpeditionYieldDebug(pairing, weights)),
})

const createDetailedCombinationScoreDebugFromDraft = (
  plan: ExpeditionPlanDraft,
  weights: ResourceVector,
  benchmark: ResourceVector,
  rank: number,
): DetailedCombinationScoreDebug => ({
  ...createCombinationScoreDebug(
    {
      pairings: plan.pairings,
      scoreDetails: calculatePlanScoreDetails(planYieldVector(plan), benchmark, weights),
    },
    weights,
    rank,
  ),
  expeditionYields: plan.pairings.map((pairing) => createExpeditionYieldDebug(pairing, weights)),
})

const createResourceBenchmarkDebugMap = (
  plans: readonly ExpeditionPlan[],
  benchmark: ResourceVector,
  weights: ResourceVector,
): ResourceBenchmarkDebugMap => {
  const create = (resource: ResourceKey): ResourceBenchmarkDebug => {
    if (weights[resource] === 0) {
      return {
        resource,
        bestPerHour: 0,
        bestCombination: [],
      }
    }
    const leader = plans.reduce<ExpeditionPlan | null>(
      (best, plan) =>
        !best ||
        plan.scoreDetails.expectedNetYield[resource] > best.scoreDetails.expectedNetYield[resource]
          ? plan
          : best,
      null,
    )
    return {
      resource,
      bestPerHour: benchmark[resource],
      bestCombination: leader ? planDisplayIds(leader) : [],
    }
  }
  return {
    fuel: create('fuel'),
    ammo: create('ammo'),
    steel: create('steel'),
    bauxite: create('bauxite'),
    bucket: create('bucket'),
  }
}

const findPlanByCombinationKey = <TPlan extends Pick<ExpeditionPlan, 'pairings'>>(
  plans: readonly TPlan[],
  key: string,
): TPlan | null => plans.find((plan) => combinationKey(planDisplayIds(plan)) === key) ?? null

const createParetoDebug = ({
  planDrafts,
  prunedPlanDrafts,
  rankedPlans,
  activeWeights,
  weights,
  benchmark,
}: {
  readonly planDrafts: readonly ExpeditionPlanDraft[]
  readonly prunedPlanDrafts: readonly ExpeditionPlanDraft[]
  readonly rankedPlans: readonly ExpeditionPlan[]
  readonly activeWeights: ResourceVector
  readonly weights: ResourceVector
  readonly benchmark: ResourceVector
}): OptimizationParetoDebug => {
  const remainingCombinationCount = prunedPlanDrafts.length
  return {
    totalCombinationCount: planDrafts.length,
    paretoRemovedCount: planDrafts.length - remainingCombinationCount,
    remainingCombinationCount,
    watchedCombinations: DEBUG_WATCHED_COMBINATIONS.map((requestedExpeditionIds) => {
      const key = combinationKey(requestedExpeditionIds)
      const prePrunePlan = findPlanByCombinationKey(planDrafts, key)
      const rankedPlan = findPlanByCombinationKey(rankedPlans, key)
      const dominator = prePrunePlan
        ? findParetoDominator(prePrunePlan, planDrafts, activeWeights)
        : null
      const rankAfterPruning = rankedPlan ? rankedPlans.indexOf(rankedPlan) + 1 : null
      const score = rankedPlan
        ? createDetailedCombinationScoreDebug(rankedPlan, weights, rankAfterPruning ?? 0)
        : prePrunePlan
          ? createDetailedCombinationScoreDebugFromDraft(prePrunePlan, weights, benchmark, 0)
          : null
      return {
        requestedExpeditionIds,
        expeditionIds: score?.expeditionIds ?? requestedExpeditionIds,
        validBeforePruning: prePrunePlan !== null,
        paretoDominated: dominator !== null,
        presentAfterPruning: rankedPlan !== null,
        dominatedBy: dominator ? planDisplayIds(dominator) : null,
        rankAfterPruning,
        score,
      }
    }),
  }
}

const createNearTieDebug = (
  winner: CombinationScoreDebug | undefined,
  runnerUp: CombinationScoreDebug | undefined,
): OptimizationNearTieDebug | null => {
  if (!winner || !runnerUp) return null
  const scoreGap = Math.abs(winner.totalScore - runnerUp.totalScore)
  if (scoreGap >= NEAR_TIE_SCORE_THRESHOLD) return null
  return {
    scoreGap,
    contributionGaps: EXPEDITION_UTILITY_RESOURCE_KEYS.map((resource) =>
      resourceDelta(winner, runnerUp, resource),
    ).sort(
      (left, right) =>
        Math.abs(right.contributionDifference) - Math.abs(left.contributionDifference),
    ),
  }
}

const createOptimizationDebugReport = ({
  request,
  preference,
  weights,
  planDrafts,
  feasiblePlanDrafts,
  constraintRejectedCombinations,
  prunedPlanDrafts,
  plans,
  candidateCount,
  activeWeights,
  comparisonWindowMinutes,
}: {
  readonly request: ExpeditionPlannerRequest
  readonly preference: OptimizationPreference
  readonly weights: ResourceVector
  readonly planDrafts: readonly ExpeditionPlanDraft[]
  readonly feasiblePlanDrafts: readonly ExpeditionPlanDraft[]
  readonly constraintRejectedCombinations: readonly ConstraintRejectedCombinationDebug[]
  readonly prunedPlanDrafts: readonly ExpeditionPlanDraft[]
  readonly plans: readonly ExpeditionPlan[]
  readonly candidateCount: number
  readonly activeWeights: ResourceVector
  readonly comparisonWindowMinutes: number
}): OptimizationDebugReport => {
  const normalizedWeights = normalizeResourceWeights(weights)
  const benchmark = plans[0]?.scoreDetails.benchmark ?? emptyResourceVector()
  const pareto = createParetoDebug({
    planDrafts: feasiblePlanDrafts,
    prunedPlanDrafts,
    rankedPlans: plans,
    activeWeights,
    weights,
    benchmark,
  })
  const rankedCombinations = plans.map((plan, index) =>
    createCombinationScoreDebug(plan, weights, index + 1),
  )
  const topCombinations = rankedCombinations.slice(0, DEFAULT_DEBUG_RANK_LIMIT)
  const detailedCombinations = plans
    .slice(0, DETAILED_DEBUG_RANK_LIMIT)
    .map((plan, index) => createDetailedCombinationScoreDebug(plan, weights, index + 1))
  const winner = rankedCombinations[0]
  const runnerUp = rankedCombinations[1]
  return {
    context: {
      fleetCount: request.fleetCount,
      weights,
      preferenceMode: preference.mode,
      ...(preference.mode === 'priority' ? { preferences: preference.preferences } : {}),
      priorityOrder: priorityOrderDebug(preference, normalizedWeights),
      normalizedWeights,
      collectionIntervalMinutes: request.afkMinutes,
      successMode: request.incomeModifier.greatSuccess ? 'greatSuccess' : 'normalSuccess',
      baseRewardMultiplier: request.incomeModifier.greatSuccess ? 1.5 : 1,
      daihatsuBonus: request.incomeModifier.daihatsuCount * 0.05,
      effectiveResourceMultiplier:
        (request.incomeModifier.greatSuccess ? 1.5 : 1) *
        (1 + request.incomeModifier.daihatsuCount * 0.05),
      availableExpeditionCount: candidateCount,
      validCombinationCount: feasiblePlanDrafts.length,
      constraintRejectedCount: constraintRejectedCombinations.length,
      feasibleCombinationCount: feasiblePlanDrafts.length,
      scoredCombinationCount: pareto.remainingCombinationCount,
      totalCombinationCount: planDrafts.length,
      paretoRemovedCount: pareto.paretoRemovedCount,
      paretoRemainingCount: pareto.remainingCombinationCount,
      remainingCombinationCount: pareto.remainingCombinationCount,
      comparisonWindowMinutes,
    },
    benchmarks: createResourceBenchmarkDebugMap(plans, benchmark, weights),
    pareto,
    constraintRejectedCombinations,
    rankedCombinations,
    topCombinations,
    detailedCombinations,
    winnerExplanation: winner && runnerUp ? explainWinner(winner, runnerUp) : null,
    nearTie: createNearTieDebug(winner, runnerUp),
  }
}

export const compareOptimizationCombinations = (
  report: OptimizationDebugReport,
  leftExpeditionIds: readonly string[],
  rightExpeditionIds: readonly string[],
): OptimizationCombinationComparison | null => {
  const leftKey = combinationKey(leftExpeditionIds)
  const rightKey = combinationKey(rightExpeditionIds)
  const findCombination = (key: string): CombinationScoreDebug | null =>
    report.rankedCombinations.find(
      (combination) => combinationKey(combination.expeditionIds) === key,
    ) ??
    report.pareto.watchedCombinations.find(
      (combination) => combination.score && combinationKey(combination.score.expeditionIds) === key,
    )?.score ??
    null
  const left = findCombination(leftKey)
  const right = findCombination(rightKey)
  if (!left || !right) return null
  const scoreDifference = right.totalScore - left.totalScore
  const winner =
    Math.abs(scoreDifference) < SCORING_INVARIANT_EPSILON
      ? 'tie'
      : scoreDifference > 0
        ? 'right'
        : 'left'
  const resourceDeltas = EXPEDITION_UTILITY_RESOURCE_KEYS.map((resource) => ({
    resource,
    leftYieldPerHour: left.resourceScores[resource].rawYieldPerHour,
    rightYieldPerHour: right.resourceScores[resource].rawYieldPerHour,
    yieldDifferencePerHour:
      right.resourceScores[resource].rawYieldPerHour -
      left.resourceScores[resource].rawYieldPerHour,
    leftContribution: left.resourceScores[resource].weightedContribution,
    rightContribution: right.resourceScores[resource].weightedContribution,
    contributionDifference:
      right.resourceScores[resource].weightedContribution -
      left.resourceScores[resource].weightedContribution,
  }))
  return {
    left: combinationLabel(left.expeditionIds),
    right: combinationLabel(right.expeditionIds),
    leftScore: left.totalScore,
    rightScore: right.totalScore,
    winner,
    scoreDifference,
    resourceDeltas,
    explanation:
      winner === 'right'
        ? explainWinner(right, left)
        : winner === 'left'
          ? explainWinner(left, right)
          : null,
  }
}

const scoreDebugValues = (combination: CombinationScoreDebug): readonly number[] => [
  combination.totalScore,
  ...EXPEDITION_UTILITY_RESOURCE_KEYS.flatMap((resource) => {
    const score = combination.resourceScores[resource]
    return [
      score.rawYieldPerHour,
      score.benchmarkPerHour,
      score.satisfaction,
      score.utility,
      score.rawWeight,
      score.normalizedWeight,
      score.weightedContribution,
      score.contributionRatio,
    ]
  }),
]

export const validateOptimizationDebugReport = (
  report: OptimizationDebugReport,
): readonly OptimizationDebugViolation[] => {
  const violations: OptimizationDebugViolation[] = []
  if (
    report.context.totalCombinationCount !== report.pareto.totalCombinationCount ||
    report.context.remainingCombinationCount !== report.pareto.remainingCombinationCount ||
    report.context.paretoRemovedCount !== report.pareto.paretoRemovedCount
  ) {
    violations.push({
      code: 'PARETO_STATISTICS_MISMATCH',
      message: 'Context and pareto debug statistics disagree.',
      context: {
        context: report.context,
        pareto: {
          totalCombinationCount: report.pareto.totalCombinationCount,
          paretoRemovedCount: report.pareto.paretoRemovedCount,
          remainingCombinationCount: report.pareto.remainingCombinationCount,
        },
      },
    })
  }
  if (
    report.pareto.totalCombinationCount - report.pareto.remainingCombinationCount !==
    report.pareto.paretoRemovedCount
  ) {
    violations.push({
      code: 'PARETO_COUNT_MISMATCH',
      message: 'Pareto removed count must equal total combinations minus remaining combinations.',
      context: report.pareto,
    })
  }

  report.rankedCombinations.forEach((combination) => {
    if (!scoreDebugValues(combination).every(Number.isFinite)) {
      violations.push({
        code: 'NON_FINITE_SCORE_DEBUG',
        message: 'Combination score debug contains a non-finite value.',
        context: combination,
      })
    }
    const contributionSum = EXPEDITION_UTILITY_RESOURCE_KEYS.reduce(
      (sum, resource) => sum + combination.resourceScores[resource].weightedContribution,
      0,
    )
    if (Math.abs(contributionSum - combination.totalScore) > SCORING_INVARIANT_EPSILON) {
      violations.push({
        code: 'CONTRIBUTION_SUM_MISMATCH',
        message: 'Resource contributions do not add up to the total score.',
        context: {
          combination: combination.expeditionIds,
          contributionSum,
          totalScore: combination.totalScore,
        },
      })
    }
    EXPEDITION_UTILITY_RESOURCE_KEYS.forEach((resource) => {
      const score = combination.resourceScores[resource]
      if (
        score.rawWeight === 0 &&
        Math.abs(score.weightedContribution) > SCORING_INVARIANT_EPSILON
      ) {
        violations.push({
          code: 'ZERO_WEIGHT_CONTRIBUTION',
          message: 'A zero-weight resource contributed to the total score.',
          context: { combination: combination.expeditionIds, resource, score },
        })
      }
    })
    if (!finiteResourceValues(combination.totalNetYield)) {
      violations.push({
        code: 'NON_FINITE_EXPECTED_YIELD',
        message: 'Combination expected net yield contains a non-finite value.',
        context: combination,
      })
    }
  })

  report.pareto.watchedCombinations.forEach((combination) => {
    if (!combination.score) return
    if (!scoreDebugValues(combination.score).every(Number.isFinite)) {
      violations.push({
        code: 'NON_FINITE_WATCHED_SCORE_DEBUG',
        message: 'Watched combination score debug contains a non-finite value.',
        context: combination,
      })
    }
  })

  report.detailedCombinations.forEach((combination) => {
    combination.expeditionYields.forEach((expedition) => {
      if (!finiteResourceValues(expedition.expectedNetPerHour)) {
        violations.push({
          code: 'NON_FINITE_EXPEDITION_YIELD',
          message: 'Expedition expected net hourly yield contains a non-finite value.',
          context: expedition,
        })
      }
      const expectedFuelNet =
        expedition.resourceRewardAfterDaihatsu.fuel - expedition.supplyCostPerRun.fuel
      const expectedAmmoNet =
        expedition.resourceRewardAfterDaihatsu.ammo - expedition.supplyCostPerRun.ammo
      if (
        expectedFuelNet !== expedition.netRewardPerRun.fuel ||
        expectedAmmoNet !== expedition.netRewardPerRun.ammo
      ) {
        violations.push({
          code: 'SUPPLY_COST_MULTIPLIER_MISMATCH',
          message: 'Supply cost appears inconsistent with post-multiplier resource rewards.',
          context: { expedition, expectedFuelNet, expectedAmmoNet },
        })
      }
      if (
        expedition.itemRewardDebug &&
        expedition.itemRewardDebug.expectedPerRun > expedition.itemRewardDebug.max
      ) {
        violations.push({
          code: 'BUCKET_ITEM_MULTIPLIER_MISMATCH',
          message: 'Bucket item expectation is greater than the KC3 item slot maximum.',
          context: expedition.itemRewardDebug,
        })
      }
    })
  })
  return violations
}

const mapResources = (
  resources: ExpeditionResources,
  transform: (value: number, key: ExpeditionResourceKey) => number,
): ExpeditionResources =>
  Object.fromEntries(
    EXPEDITION_RESOURCE_KEYS.map((key) => [key, transform(Number(resources[key]) || 0, key)]),
  ) as unknown as ExpeditionResources

const addResources = (left: ExpeditionResources, right: ExpeditionResources): ExpeditionResources =>
  mapResources(left, (value, key) => value + Number(right[key] || 0))

const matchesCostType = (ship: ExpeditionCostShip, type: string): boolean => {
  if (type === 'dd') return ship.stype === 2
  if (type === 'cl') return ship.stype === 3
  if (type === 'ct') return ship.stype === 21
  if (type === 'ca') return ship.stype === 5
  if (type === 'as') return ship.stype === 20
  if (type === 'av') return ship.stype === 16
  if (type === 'bbv') return ship.stype === 10
  if (type === 'ssLike') return ship.stype === 13 || ship.stype === 14
  if (type === 'cvLike') return [7, 11, 16, 18].includes(ship.stype)
  return false
}

const shipCost = (
  ship: ExpeditionCostShip,
  fuelPercent: number,
  ammoPercent: number,
): { readonly fuel: number; readonly ammo: number } => {
  const marriageModifier = (value: number): number =>
    value === 0 || ship.level <= 99 ? value : Math.max(1, Math.floor(value * 0.85))
  return {
    fuel: marriageModifier(Math.floor(ship.maxFuel * fuelPercent)),
    ammo: marriageModifier(Math.floor(ship.maxAmmo * ammoPercent)),
  }
}

const computeAccountCost = (
  expedition: ExpeditionCandidateSnapshot,
  accountShips: readonly ExpeditionCostShip[],
): { readonly fuel: number; readonly ammo: number } | null => {
  const sourceComposition = MINIMUM_COMPOSITIONS[expedition.id]
  if (!sourceComposition) return null
  const composition = { ...sourceComposition }
  if (composition.any) {
    composition.dd = Number(composition.dd || 0) + composition.any
    delete composition.any
  }
  const selectedGroups = Object.entries(composition).map(([type, count]) => {
    const seenMasterIds = new Set<number>()
    const matches = accountShips
      .filter((ship) => matchesCostType(ship, type))
      .map((ship) => ({
        ...ship,
        cost: shipCost(ship, expedition.fuelPercent, expedition.ammoPercent),
      }))
      .sort((left, right) => left.cost.fuel + left.cost.ammo - (right.cost.fuel + right.cost.ammo))
      .filter((ship) => {
        if (seenMasterIds.has(ship.masterId)) return false
        seenMasterIds.add(ship.masterId)
        return true
      })
    return matches.length >= count ? matches.slice(0, count) : null
  })
  if (selectedGroups.some((group) => group === null)) return null
  return selectedGroups
    .flatMap((group) => group || [])
    .reduce((sum, ship) => ({ fuel: sum.fuel + ship.cost.fuel, ammo: sum.ammo + ship.cost.ammo }), {
      fuel: 0,
      ammo: 0,
    })
}

const checkValues = (result: ExpeditionRequirementResult): readonly boolean[] =>
  [
    result.flagShipLevel,
    result.shipCount,
    result.flagShipTypeOf,
    result.levelCount,
    result.totalAsw,
    result.totalLos,
    result.totalAa,
    result.totalFp,
    result.totalTorp,
    result.drumCount,
    result.drumCarrierCount,
    ...result.fleetSType,
  ].filter((value): value is boolean => value !== null)

const createFleetResult = (snapshot: ExpeditionFleetCheckSnapshot): ExpeditionFleetResult => {
  const checks = checkValues(snapshot.result)
  const passedCount = checks.filter(Boolean).length
  const meetsRequirements = checks.length > 0 && passedCount === checks.length
  return {
    ...snapshot,
    meetsRequirements,
    fitScore:
      passedCount * 10 +
      (meetsRequirements ? 100 : 0) +
      (!snapshot.busy && snapshot.isSupplied ? 5 : 0) +
      (snapshot.busy ? 0 : 2),
  }
}

const combinations = <T>(values: readonly T[], count: number): readonly (readonly T[])[] => {
  const output: T[][] = []
  const selected: T[] = []
  const visit = (start: number): void => {
    if (selected.length === count) {
      output.push([...selected])
      return
    }
    for (let index = start; index <= values.length - (count - selected.length); index += 1) {
      selected.push(values[index])
      visit(index + 1)
      selected.pop()
    }
  }
  visit(0)
  return output
}

const permutations = <T>(values: readonly T[], count: number): readonly (readonly T[])[] => {
  if (count === 0) return [[]]
  return values.flatMap((value, index) =>
    permutations(
      values.filter((_, candidateIndex) => candidateIndex !== index),
      count - 1,
    ).map((tail) => [value, ...tail]),
  )
}

interface CalculatedExpedition extends ExpeditionCandidateSnapshot {
  readonly effectiveCycleMinutes: number
  readonly netIncome: ExpeditionResources
  readonly hourlyIncome: ExpeditionResources
  readonly bucketPotential: {
    readonly maxPerTrip: number
    readonly expectedPerTrip: number
    readonly hourly: number
  }
  readonly estimatedResupplyCost: { readonly fuel: number; readonly ammo: number }
  readonly modifier: ExpeditionPlanPairing['expedition']['modifier']
  readonly calculatedFleetChecks: readonly ExpeditionFleetResult[]
}

type ExpeditionPlanDraft = Omit<
  ExpeditionPlan,
  | 'weightedHourlyIncome'
  | 'weightedExpectedNetYield'
  | 'utilityScore'
  | 'normalizedYield'
  | 'satisfaction'
  | 'utility'
  | 'normalizedWeights'
  | 'weightedContribution'
  | 'scoreDetails'
  | 'negativeYieldCount'
  | 'fallbackUtilityScore'
>

const planYieldVector = (
  plan: Pick<ExpeditionPlanDraft, 'hourlyIncome' | 'bucketPotentialHourly'>,
): ResourceVector => ({
  fuel: plan.hourlyIncome.fuel,
  ammo: plan.hourlyIncome.ammo,
  steel: plan.hourlyIncome.steel,
  bauxite: plan.hourlyIncome.bauxite,
  bucket: plan.bucketPotentialHourly,
})

const createConstraintRejectedCombinationDebug = (
  plan: ExpeditionPlanDraft,
  preferences: ResourcePreferenceMap,
): ConstraintRejectedCombinationDebug => {
  const totalNetYield = planYieldVector(plan)
  const expeditionIds = planDisplayIds(plan)
  return {
    expeditionIds,
    expeditions: combinationLabel(expeditionIds),
    constraintViolations: resourceConstraintViolations(totalNetYield, preferences),
    totalNetYield,
  }
}

const scopedBenchmark = (benchmark: ResourceVector, weights: ResourceVector): ResourceVector => ({
  fuel: weights.fuel === 0 ? 0 : benchmark.fuel,
  ammo: weights.ammo === 0 ? 0 : benchmark.ammo,
  steel: weights.steel === 0 ? 0 : benchmark.steel,
  bauxite: weights.bauxite === 0 ? 0 : benchmark.bauxite,
  bucket: weights.bucket === 0 ? 0 : benchmark.bucket,
})

const weightedExpectedNetYield = (
  yieldValue: ResourceVector,
  normalizedWeights: ResourceVector,
): number =>
  EXPEDITION_UTILITY_RESOURCE_KEYS.reduce(
    (score, key) => score + yieldValue[key] * normalizedWeights[key],
    0,
  )

const negativeYieldCount = (yieldValue: ResourceVector, weights: ResourceVector): number =>
  EXPEDITION_UTILITY_RESOURCE_KEYS.filter((key) => weights[key] !== 0 && yieldValue[key] < 0).length

const resupplyCostTotal = (cost: { readonly fuel: number; readonly ammo: number }): number =>
  cost.fuel + cost.ammo

const planExpeditionIds = (plan: Pick<ExpeditionPlan, 'pairings'>): readonly number[] =>
  plan.pairings.map(({ expedition }) => expedition.id).sort((left, right) => left - right)

const compareExpeditionIdOrder = (
  left: Pick<ExpeditionPlan, 'pairings'>,
  right: Pick<ExpeditionPlan, 'pairings'>,
): number => {
  const leftIds = planExpeditionIds(left)
  const rightIds = planExpeditionIds(right)
  for (let index = 0; index < Math.min(leftIds.length, rightIds.length); index += 1) {
    const difference = leftIds[index] - rightIds[index]
    if (difference !== 0) return difference
  }
  return leftIds.length - rightIds.length
}

const paretoDominates = (
  left: ResourceVector,
  right: ResourceVector,
  activeWeights: ResourceVector,
): boolean => {
  const activeResourceKeys = EXPEDITION_UTILITY_RESOURCE_KEYS.filter(
    (key) => activeWeights[key] !== 0,
  )
  if (activeResourceKeys.length === 0) return false
  const preferenceDelta = (key: ResourceKey): number =>
    activeWeights[key] > 0 ? left[key] - right[key] : right[key] - left[key]
  const improvesWeightedResource = activeResourceKeys.some((key) => preferenceDelta(key) > 0)
  if (!improvesWeightedResource) return false
  return activeResourceKeys.every((key) => preferenceDelta(key) >= 0)
}

const findParetoDominator = (
  plan: ExpeditionPlanDraft,
  plans: readonly ExpeditionPlanDraft[],
  activeWeights: ResourceVector,
): ExpeditionPlanDraft | null => {
  const yieldValue = planYieldVector(plan)
  return (
    plans.find(
      (other) =>
        other !== plan && paretoDominates(planYieldVector(other), yieldValue, activeWeights),
    ) ?? null
  )
}

const paretoPrunePlans = (
  plans: readonly ExpeditionPlanDraft[],
  activeWeights: ResourceVector,
): readonly ExpeditionPlanDraft[] =>
  plans.filter((plan) => findParetoDominator(plan, plans, activeWeights) === null)

export const planExpeditions = ({
  snapshot,
  request,
}: {
  readonly snapshot: ExpeditionPlannerSnapshot
  readonly request: ExpeditionPlannerRequest
}): ExpeditionPlannerResult => {
  const noSolution = (
    reason: string,
    reasonCode: 'INSUFFICIENT_FLEETS' | 'INSUFFICIENT_EXPEDITIONS',
    reasonValues: Readonly<Record<string, number>> = {},
  ): ExpeditionPlannerResult => ({
    status: 'no-solution',
    reason,
    reasonCode,
    reasonValues,
    generatedAt: snapshot.generatedAt,
    current: snapshot.current,
    maxResource: snapshot.maxResource,
  })

  if (snapshot.fleetNumbers.length < request.fleetCount) {
    return noSolution(
      `KC3 目前只有 ${snapshot.fleetNumbers.length} 支可用遠征艦隊，少於設定的 ${request.fleetCount} 支。`,
      'INSUFFICIENT_FLEETS',
      { available: snapshot.fleetNumbers.length, requested: request.fleetCount },
    )
  }

  const successFactor = request.incomeModifier.greatSuccess ? 1.5 : 1
  const daihatsuFactor = 1 + request.incomeModifier.daihatsuCount * 0.05
  const candidateIds = new Set(request.candidateIds)
  const candidates = snapshot.candidates
    .filter((candidate) => candidateIds.has(candidate.id))
    .flatMap((candidate): readonly CalculatedExpedition[] => {
      const resupplyCost = computeAccountCost(candidate, snapshot.accountShips)
      if (!resupplyCost) return []
      const grossIncome = mapResources(candidate.baseIncome, (value) =>
        Math.floor(value * successFactor * daihatsuFactor),
      )
      const netIncome: ExpeditionResources = {
        fuel: grossIncome.fuel - resupplyCost.fuel,
        ammo: grossIncome.ammo - resupplyCost.ammo,
        steel: grossIncome.steel,
        bauxite: grossIncome.bauxite,
      }
      const bucketExpectedPerTrip = calculateBucketExpectedPerRun(
        candidate.bucketReward,
        request.incomeModifier.greatSuccess,
      )
      const effectiveCycleMinutes =
        request.afkMinutes === 0
          ? candidate.durationMinutes
          : Math.ceil(candidate.durationMinutes / request.afkMinutes) * request.afkMinutes
      return [
        {
          ...candidate,
          effectiveCycleMinutes,
          netIncome,
          hourlyIncome: mapResources(netIncome, (value) => (value * 60) / effectiveCycleMinutes),
          bucketPotential: {
            maxPerTrip: candidate.bucketMaxPerTrip,
            expectedPerTrip: bucketExpectedPerTrip,
            hourly: (bucketExpectedPerTrip * 60) / effectiveCycleMinutes,
          },
          bucketReward: candidate.bucketReward,
          estimatedResupplyCost: resupplyCost,
          modifier: {
            type: 'kancepts-account',
            greatSuccess: request.incomeModifier.greatSuccess,
            daihatsuCount: request.incomeModifier.daihatsuCount,
            factor: snapshot.modifierFactor,
          },
          calculatedFleetChecks: candidate.fleetChecks.map(createFleetResult),
        },
      ]
    })

  if (candidates.length < request.fleetCount) {
    return noSolution(
      '可計算的遠征不足以分配所選艦隊；請確認候選已解鎖，且帳號內有足夠艦種建立 Kancepts 最低成本編成。',
      'INSUFFICIENT_EXPEDITIONS',
    )
  }

  const bestPairing = (expeditions: readonly CalculatedExpedition[]) =>
    permutations(snapshot.fleetNumbers, expeditions.length)
      .map((fleetNumbers) => {
        const pairings = expeditions.map((expedition, index) => {
          const fleet = expedition.calculatedFleetChecks.find(
            (item) => item.fleetNumber === fleetNumbers[index],
          )
          if (!fleet)
            throw new Error(`缺少遠征 ${expedition.id} 與艦隊 ${fleetNumbers[index]} 的檢查結果`)
          return { expedition, fleet }
        })
        return {
          pairings,
          score: pairings.reduce((sum, pairing) => sum + pairing.fleet.fitScore, 0),
        }
      })
      .sort((left, right) => right.score - left.score)[0]

  const preference =
    request.preference ??
    optimizationPreferenceFromLegacyWeights(request.resourceWeights, request.bucketWeight)
  const utilityWeights = weightsFromOptimizationPreference(preference)
  const constraintPreferences = constraintPreferencesFromOptimizationPreference(preference)
  const resourceWeights: ExpeditionResources = {
    fuel: utilityWeights.fuel,
    ammo: utilityWeights.ammo,
    steel: utilityWeights.steel,
    bauxite: utilityWeights.bauxite,
  }
  const bucketWeight = utilityWeights.bucket
  const normalizedWeights = normalizeResourceWeights(utilityWeights)
  const activeWeightTotal = calculateTotalWeight(utilityWeights)
  const activeWeights =
    activeWeightTotal > 0
      ? normalizedWeights
      : preference.mode === 'customWeight'
        ? { fuel: 1, ammo: 1, steel: 1, bauxite: 1, bucket: 1 }
        : emptyResourceVector()
  const comparisonWindowMinutes = Math.max(60, request.afkMinutes)
  const planDrafts: ExpeditionPlanDraft[] = combinations(candidates, request.fleetCount).map(
    (expeditions) => {
      const hourlyIncome = expeditions.reduce(
        (sum, expedition) => addResources(sum, expedition.hourlyIncome),
        emptyResources(),
      )
      const projectedIncome = mapResources(
        hourlyIncome,
        (value) => (value * comparisonWindowMinutes) / 60,
      )
      const bucketPotentialHourly = expeditions.reduce(
        (sum, expedition) => sum + expedition.bucketPotential.hourly,
        0,
      )
      const estimatedResupplyCost = expeditions.reduce(
        (sum, expedition) => ({
          fuel: sum.fuel + expedition.estimatedResupplyCost.fuel,
          ammo: sum.ammo + expedition.estimatedResupplyCost.ammo,
        }),
        { fuel: 0, ammo: 0 },
      )
      const pairing = bestPairing(expeditions)
      return {
        bucketPotentialHourly,
        bucketWeight,
        comparisonWindowMinutes,
        projectedIncome,
        hourlyIncome,
        estimatedResupplyCost,
        pairingScore: pairing.score,
        pairings: pairing.pairings.map(({ expedition, fleet }) => ({
          fleet,
          expedition: {
            id: expedition.id,
            displayNo: expedition.displayNo,
            name: expedition.name,
            durationMinutes: expedition.durationMinutes,
            effectiveCycleMinutes: expedition.effectiveCycleMinutes,
            baseIncome: expedition.baseIncome,
            netIncome: expedition.netIncome,
            hourlyIncome: expedition.hourlyIncome,
            bucketPotential: expedition.bucketPotential,
            bucketReward: expedition.bucketReward,
            estimatedResupplyCost: expedition.estimatedResupplyCost,
            requirements: expedition.requirements,
            modifier: expedition.modifier,
            greatSuccessCondition: expedition.greatSuccessCondition,
            monthly: expedition.monthly,
          },
        })),
      }
    },
  )

  const constrainedPlanDrafts = constraintPreferences
    ? planDrafts.reduce(
        (groups, plan) => {
          if (satisfiesResourceConstraints(planYieldVector(plan), constraintPreferences)) {
            groups.feasible.push(plan)
          } else {
            groups.rejected.push(
              createConstraintRejectedCombinationDebug(plan, constraintPreferences),
            )
          }
          return groups
        },
        {
          feasible: [] as ExpeditionPlanDraft[],
          rejected: [] as ConstraintRejectedCombinationDebug[],
        },
      )
    : { feasible: planDrafts, rejected: [] as ConstraintRejectedCombinationDebug[] }
  const constraintRejectedCombinations = constrainedPlanDrafts.rejected
  const feasiblePlanDrafts = constrainedPlanDrafts.feasible

  if (feasiblePlanDrafts.length === 0) {
    const closest = constraintRejectedCombinations
      .map((combination) => ({
        combination,
        gap: combination.constraintViolations.reduce(
          (sum, violation) => sum + Math.max(0, violation.required - violation.actual),
          0,
        ),
      }))
      .sort((left, right) => left.gap - right.gap)[0]
    const optimizationDebug = request.debug
      ? createOptimizationDebugReport({
          request,
          preference,
          weights: utilityWeights,
          planDrafts,
          feasiblePlanDrafts,
          constraintRejectedCombinations,
          prunedPlanDrafts: [],
          plans: [],
          candidateCount: candidates.length,
          activeWeights,
          comparisonWindowMinutes,
        })
      : undefined
    return {
      status: 'no-feasible-plan',
      reason: '目前沒有符合所有最低收益條件的遠征組合。',
      reasonCode: 'RESOURCE_CONSTRAINTS',
      reasonValues: {
        rejected: constraintRejectedCombinations.length,
        feasible: 0,
      },
      generatedAt: snapshot.generatedAt,
      current: snapshot.current,
      maxResource: snapshot.maxResource,
      constraintRejectedCount: constraintRejectedCombinations.length,
      feasibleCombinationCount: 0,
      closestViolations: closest?.combination.constraintViolations ?? [],
      ...(optimizationDebug ? { optimizationDebug } : {}),
    }
  }

  const prunedPlanDrafts = paretoPrunePlans(feasiblePlanDrafts, activeWeights)
  const benchmarks = scopedBenchmark(
    calculateResourceBenchmarks(prunedPlanDrafts.map(planYieldVector)),
    utilityWeights,
  )
  const fallbackWeights: ResourceVector =
    preference.mode === 'customWeight'
      ? { fuel: 1, ammo: 1, steel: 1, bauxite: 1, bucket: 1 }
      : emptyResourceVector()
  const plans: ExpeditionPlan[] = prunedPlanDrafts.map((plan) => {
    const expectedNetYield = planYieldVector(plan)
    const scoreDetails = calculatePlanScoreDetails(expectedNetYield, benchmarks, utilityWeights)
    const fallbackDetails = calculatePlanScoreDetails(expectedNetYield, benchmarks, fallbackWeights)
    return {
      ...plan,
      weightedHourlyIncome: weightedExpectedNetYield(expectedNetYield, normalizedWeights),
      weightedExpectedNetYield: weightedExpectedNetYield(expectedNetYield, normalizedWeights),
      utilityScore: scoreDetails.totalScore,
      normalizedYield: scoreDetails.satisfaction,
      satisfaction: scoreDetails.satisfaction,
      utility: scoreDetails.utility,
      normalizedWeights: scoreDetails.normalizedWeight,
      weightedContribution: scoreDetails.weightedContribution,
      scoreDetails,
      negativeYieldCount: negativeYieldCount(expectedNetYield, utilityWeights),
      fallbackUtilityScore: fallbackDetails.totalScore,
    }
  })

  plans.sort((left, right) => {
    const utilityDifference = right.utilityScore - left.utilityScore
    if (Math.abs(utilityDifference) >= UTILITY_SCORE_EPSILON) return utilityDifference
    const fallbackDifference =
      activeWeightTotal <= 0 && preference.mode === 'customWeight'
        ? right.fallbackUtilityScore - left.fallbackUtilityScore
        : 0
    if (Math.abs(fallbackDifference) >= UTILITY_SCORE_EPSILON) return fallbackDifference
    const weightedYieldDifference = right.weightedExpectedNetYield - left.weightedExpectedNetYield
    if (Math.abs(weightedYieldDifference) >= UTILITY_SCORE_EPSILON) return weightedYieldDifference
    const negativeCountDifference = left.negativeYieldCount - right.negativeYieldCount
    if (negativeCountDifference !== 0) return negativeCountDifference
    const costDifference =
      resupplyCostTotal(left.estimatedResupplyCost) - resupplyCostTotal(right.estimatedResupplyCost)
    if (costDifference !== 0) return costDifference
    return compareExpeditionIdOrder(left, right)
  })

  const requestedPlanLimit = request.planLimit
  const planLimit =
    typeof requestedPlanLimit === 'number' && Number.isInteger(requestedPlanLimit)
      ? Math.max(DEFAULT_PLAN_LIMIT, Math.min(MAX_PLAN_LIMIT, requestedPlanLimit))
      : DEFAULT_PLAN_LIMIT
  const optimizationDebug = request.debug
    ? createOptimizationDebugReport({
        request,
        preference,
        weights: utilityWeights,
        planDrafts,
        feasiblePlanDrafts,
        constraintRejectedCombinations,
        prunedPlanDrafts,
        plans,
        candidateCount: candidates.length,
        activeWeights,
        comparisonWindowMinutes,
      })
    : undefined

  return {
    status: 'success',
    generatedAt: snapshot.generatedAt,
    current: snapshot.current,
    resourceWeights,
    maxResource: snapshot.maxResource,
    candidateCount: candidates.length,
    combinationCount: planDrafts.length,
    prunedCombinationCount: prunedPlanDrafts.length,
    settings: {
      afkMinutes: request.afkMinutes,
      fleetCount: request.fleetCount,
      comparisonWindowMinutes,
      resourceWeights,
      bucketWeight,
      mode: request.afkMinutes === 0 ? 'online' : 'afk',
      incomeModifier: {
        greatSuccess: request.incomeModifier.greatSuccess,
        daihatsuCount: request.incomeModifier.daihatsuCount,
        factor: snapshot.modifierFactor,
      },
      usesExpeditionTableCostConfig: false,
      resupplyCostModel: 'kancepts-account',
    },
    plans: plans.slice(0, planLimit),
    ...(optimizationDebug ? { optimizationDebug } : {}),
  }
}
