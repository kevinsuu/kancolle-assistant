export const EXPEDITION_RESOURCE_KEYS = ['fuel', 'ammo', 'steel', 'bauxite'] as const

export type ExpeditionResourceKey = (typeof EXPEDITION_RESOURCE_KEYS)[number]
export type ExpeditionResources = Readonly<Record<ExpeditionResourceKey, number>>

export interface ExpeditionPlannerRequest {
  readonly resourceWeights: ExpeditionResources
  readonly afkMinutes: number
  readonly fleetCount: number
  readonly candidateIds: readonly number[]
  readonly bucketWeight: number
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
    readonly bucketPotential: { readonly maxPerTrip: number; readonly hourly: number }
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

export interface ExpeditionPlan {
  readonly weightedHourlyIncome: number
  readonly bucketPotentialHourly: number
  readonly bucketWeight: number
  readonly comparisonWindowMinutes: number
  readonly projectedIncome: ExpeditionResources
  readonly hourlyIncome: ExpeditionResources
  readonly pairingScore: number
  readonly pairings: readonly ExpeditionPlanPairing[]
}

export type ExpeditionPlannerResult =
  | {
      readonly status: 'success'
      readonly generatedAt: string
      readonly current: ExpeditionResources
      readonly resourceWeights: ExpeditionResources
      readonly maxResource: number
      readonly candidateCount: number
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

const parseCandidate = (value: unknown, path: string): ExpeditionCandidateSnapshot => {
  const record = asRecord(value, path)
  return {
    id: asNumber(record.id, `${path}.id`),
    displayNo: asString(record.displayNo, `${path}.displayNo`),
    name: asString(record.name, `${path}.name`),
    durationMinutes: asNumber(record.durationMinutes, `${path}.durationMinutes`),
    baseIncome: parseResources(record.baseIncome, `${path}.baseIncome`),
    bucketMaxPerTrip: asNumber(record.bucketMaxPerTrip, `${path}.bucketMaxPerTrip`),
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

const normalizeAcrossPlans = (value: number, minimum: number, maximum: number): number =>
  maximum === minimum ? 0 : (value - minimum) / (maximum - minimum)

interface CalculatedExpedition extends ExpeditionCandidateSnapshot {
  readonly effectiveCycleMinutes: number
  readonly netIncome: ExpeditionResources
  readonly hourlyIncome: ExpeditionResources
  readonly bucketPotential: { readonly maxPerTrip: number; readonly hourly: number }
  readonly estimatedResupplyCost: { readonly fuel: number; readonly ammo: number }
  readonly modifier: ExpeditionPlanPairing['expedition']['modifier']
  readonly calculatedFleetChecks: readonly ExpeditionFleetResult[]
}

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
            hourly: (candidate.bucketMaxPerTrip * 60) / effectiveCycleMinutes,
          },
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

  const resourceWeights = mapResources(request.resourceWeights, (value) => value)
  const comparisonWindowMinutes = Math.max(60, request.afkMinutes)
  const plans: ExpeditionPlan[] = combinations(candidates, request.fleetCount).map(
    (expeditions) => {
      const hourlyIncome = expeditions.reduce(
        (sum, expedition) => addResources(sum, expedition.hourlyIncome),
        emptyResources(),
      )
      const projectedIncome = mapResources(
        hourlyIncome,
        (value) => (value * comparisonWindowMinutes) / 60,
      )
      const weightedHourlyIncome = EXPEDITION_RESOURCE_KEYS.reduce(
        (sum, key) => sum + hourlyIncome[key] * resourceWeights[key],
        0,
      )
      const bucketPotentialHourly = expeditions.reduce(
        (sum, expedition) => sum + expedition.bucketPotential.hourly,
        0,
      )
      const pairing = bestPairing(expeditions)
      return {
        weightedHourlyIncome,
        bucketPotentialHourly,
        bucketWeight: request.bucketWeight,
        comparisonWindowMinutes,
        projectedIncome,
        hourlyIncome,
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

  const resourceRanges = Object.fromEntries(
    EXPEDITION_RESOURCE_KEYS.map((key) => [
      key,
      plans.reduce(
        (range, plan) => ({
          minimum: Math.min(range.minimum, plan.hourlyIncome[key]),
          maximum: Math.max(range.maximum, plan.hourlyIncome[key]),
        }),
        { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY },
      ),
    ]),
  ) as Record<ExpeditionResourceKey, { minimum: number; maximum: number }>
  const bucketRange = plans.reduce(
    (range, plan) => ({
      minimum: Math.min(range.minimum, plan.bucketPotentialHourly),
      maximum: Math.max(range.maximum, plan.bucketPotentialHourly),
    }),
    { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY },
  )
  const preferenceScore = (plan: ExpeditionPlan): number =>
    EXPEDITION_RESOURCE_KEYS.reduce(
      (score, key) =>
        score +
        normalizeAcrossPlans(
          plan.hourlyIncome[key],
          resourceRanges[key].minimum,
          resourceRanges[key].maximum,
        ) *
          resourceWeights[key],
      0,
    ) +
    normalizeAcrossPlans(plan.bucketPotentialHourly, bucketRange.minimum, bucketRange.maximum) *
      request.bucketWeight

  plans.sort((left, right) => {
    const preferenceDifference = preferenceScore(right) - preferenceScore(left)
    const bucketTieBreaker =
      request.bucketWeight === 0
        ? 0
        : Math.sign(request.bucketWeight) *
          (right.bucketPotentialHourly - left.bucketPotentialHourly)
    return (
      preferenceDifference ||
      right.weightedHourlyIncome - left.weightedHourlyIncome ||
      bucketTieBreaker ||
      right.pairingScore - left.pairingScore
    )
  })

  return {
    status: 'success',
    generatedAt: snapshot.generatedAt,
    current: snapshot.current,
    resourceWeights,
    maxResource: snapshot.maxResource,
    candidateCount: candidates.length,
    settings: {
      afkMinutes: request.afkMinutes,
      fleetCount: request.fleetCount,
      comparisonWindowMinutes,
      resourceWeights,
      bucketWeight: request.bucketWeight,
      mode: request.afkMinutes === 0 ? 'online' : 'afk',
      incomeModifier: {
        greatSuccess: request.incomeModifier.greatSuccess,
        daihatsuCount: request.incomeModifier.daihatsuCount,
        factor: snapshot.modifierFactor,
      },
      usesExpeditionTableCostConfig: false,
      resupplyCostModel: 'kancepts-account',
    },
    plans: plans.slice(0, 1),
  }
}
