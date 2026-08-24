import { calculateFleetMetrics, satisfiesCalculatedConstraints } from './metrics'
import { getRouteTemplates } from './rules'
import type {
  AccountSnapshot,
  EquipmentInstanceId,
  FleetRecommendation,
  FleetRole,
  OwnedEquipment,
  OwnedShip,
  RecommendFleetInput,
  RecommendFleetResult,
  RecommendationMessage,
  RecommendationObjective,
  RecommendationScore,
  RecommendedShipBuild,
  RouteTemplate,
  ScoreDimension,
  ShipInstanceId,
  UnsatisfiedRequirement,
} from './types'

export const SOLVER_VERSION = '0.1.0'

const FLEET_BEAM_WIDTH = 400
const FLEET_CANDIDATES_PER_ROLE = 14
const FLEETS_TO_EQUIP = 36
const GEAR_BEAM_WIDTH = 120
const GEAR_CANDIDATES_PER_SLOT = 10

interface FleetMember {
  readonly ship: OwnedShip
  readonly role: FleetRole
}

interface FleetSearchState {
  readonly members: readonly FleetMember[]
  readonly usedShipIds: ReadonlySet<ShipInstanceId>
  readonly score: number
  readonly lastCandidateIndex: number
}

type GearRequirementKind =
  | 'big-gun'
  | 'main-gun'
  | 'recon'
  | 'ap-shell'
  | 'fighter'
  | 'attack-aircraft'
  | 'radar'
  | 'torpedo'
  | 'small-gun'
  | 'sonar'
  | 'depth-charge'
  | 'landing-craft'
  | 'seaplane'
  | 'general'

interface GearRequirement {
  readonly key: string
  readonly shipIndex: number
  readonly slotIndex: number
  readonly slotSize: number
  readonly kind: GearRequirementKind
}

interface GearOption {
  readonly gear: OwnedEquipment
  readonly score: number
}

interface GearSearchState {
  readonly assignments: ReadonlyMap<string, OwnedEquipment | null>
  readonly usedEquipmentIds: ReadonlySet<EquipmentInstanceId>
  readonly score: number
}

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value))

const shipSignature = (members: readonly FleetMember[]): string =>
  members.map((member) => member.ship.id).join('-')

const gearSignature = (state: GearSearchState): string =>
  Array.from(state.assignments.values())
    .map((gear) => gear?.id ?? 0)
    .join('-')

const candidateShipScore = (
  ship: OwnedShip,
  role: FleetRole,
  objective: RecommendationObjective,
): number => {
  const level = Math.min(ship.level, 180) / 1.8
  const survival = ship.stats.hp * 0.8 + ship.stats.armor + ship.stats.evasion * 0.45
  let offense = ship.stats.firepower + ship.stats.torpedo * 0.45
  let roleFit = 0

  if (role === 'main-battleship') {
    roleFit = ship.stats.firepower * 1.1 + ship.stats.armor * 0.7 + ship.slotSizes.length * 4
  } else if (role === 'carrier-air-superiority') {
    roleFit = ship.slotSizes.reduce((total, slot) => total + Math.sqrt(slot) * 8, 0)
    offense += ship.slotSizes.reduce((total, slot) => total + slot, 0) * 0.6
  } else {
    roleFit = ship.stats.los * 0.8 + ship.stats.torpedo * 0.7 + ship.stats.luck * 0.35
  }

  if (objective === 'boss-clear') return roleFit * 0.55 + offense * 0.3 + survival * 0.1 + level
  if (objective === 'low-cost') {
    return roleFit * 0.4 + survival * 0.25 + level - (ship.fuelCost + ship.ammoCost) * 0.65
  }
  if (objective === 'leveling') {
    return roleFit * 0.2 + survival * 0.1 + (180 - Math.min(ship.level, 180)) * 1.5
  }
  if (objective.startsWith('resource-')) {
    return roleFit * 0.15 + survival * 0.1 + 180 - (ship.fuelCost + ship.ammoCost) * 1.4
  }
  return roleFit * 0.45 + survival * 0.25 + offense * 0.15 + level
}

const roleForShip = (ship: OwnedShip, route: RouteTemplate): FleetRole => {
  if (
    route.tags.some((tag) => ['asw', 'oasw'].includes(tag)) &&
    [1, 2, 3, 7, 10, 21].includes(ship.shipTypeId)
  ) {
    return 'anti-submarine'
  }
  if (route.category === 'resource' && [2, 6, 16, 22].includes(ship.shipTypeId)) {
    return 'resource-carrier'
  }
  if ([8, 9, 10, 12].includes(ship.shipTypeId)) return 'main-battleship'
  if ([7, 11, 18].includes(ship.shipTypeId)) return 'carrier-air-superiority'
  if ([13, 14].includes(ship.shipTypeId)) return 'submarine'
  if ([1, 2].includes(ship.shipTypeId)) return 'escort-destroyer'
  if ([3, 4, 5, 6, 16, 20, 21, 22].includes(ship.shipTypeId)) return 'utility-cruiser'
  return 'wildcard'
}

const satisfiesFleetConstraints = (
  members: readonly FleetMember[],
  route: RouteTemplate,
): boolean =>
  route.fleetConstraints.every((constraint) => {
    if (constraint.kind === 'ship-count') return members.length === constraint.exact
    if (constraint.kind === 'specific-ship-name') {
      const count = members.filter((member) =>
        constraint.names.some((name) => member.ship.name.includes(name)),
      ).length
      return count >= constraint.min
    }
    const count = members.filter((member) =>
      constraint.shipTypeIds.includes(member.ship.shipTypeId),
    ).length
    if (constraint.exact !== undefined && count !== constraint.exact) return false
    if (constraint.min !== undefined && count < constraint.min) return false
    if (constraint.max !== undefined && count > constraint.max) return false
    return true
  })

const violatesMaximumConstraints = (
  members: readonly FleetMember[],
  route: RouteTemplate,
): boolean =>
  route.fleetConstraints.some((constraint) => {
    if (constraint.kind !== 'ship-type-count') return false
    const maximum = constraint.exact ?? constraint.max
    if (maximum === undefined) return false
    const count = members.filter((member) =>
      constraint.shipTypeIds.includes(member.ship.shipTypeId),
    ).length
    return count > maximum
  })

const requiredConstraintBonus = (
  ship: OwnedShip,
  members: readonly FleetMember[],
  route: RouteTemplate,
): number =>
  route.fleetConstraints.reduce((bonus, constraint) => {
    if (constraint.kind === 'specific-ship-name') {
      const current = members.filter((member) =>
        constraint.names.some((name) => member.ship.name.includes(name)),
      ).length
      const matches = constraint.names.some((name) => ship.name.includes(name))
      return bonus + (current < constraint.min && matches ? 2000 : 0)
    }
    if (constraint.kind !== 'ship-type-count') return bonus
    const minimum = constraint.exact ?? constraint.min
    if (minimum === undefined) return bonus
    const current = members.filter((member) =>
      constraint.shipTypeIds.includes(member.ship.shipTypeId),
    ).length
    return bonus + (current < minimum && constraint.shipTypeIds.includes(ship.shipTypeId) ? 500 : 0)
  }, 0)

const fleetShipCount = (route: RouteTemplate): number =>
  route.fleetConstraints.find((constraint) => constraint.kind === 'ship-count')?.exact ?? 6

const genericCandidatePool = (
  account: AccountSnapshot,
  route: RouteTemplate,
  objective: RecommendationObjective,
): readonly OwnedShip[] => {
  const ranked = account.ships
    .map((ship) => ({
      ship,
      score: candidateShipScore(ship, roleForShip(ship, route), objective),
    }))
    .sort((left, right) => right.score - left.score || left.ship.id - right.ship.id)
  const byType = new Map<number, number>()
  const selected = ranked.filter(({ ship }) => {
    const count = byType.get(ship.shipTypeId) ?? 0
    const isNamedRequirement = route.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'specific-ship-name' &&
        constraint.names.some((name) => ship.name.includes(name)),
    )
    if (count >= FLEET_CANDIDATES_PER_ROLE && !isNamedRequirement) return false
    byType.set(ship.shipTypeId, count + 1)
    return true
  })
  return selected.slice(0, 180).map(({ ship }) => ship)
}

const generateFleetCandidates = (
  account: AccountSnapshot,
  route: RouteTemplate,
  objective: RecommendationObjective,
): readonly FleetSearchState[] => {
  const candidates = genericCandidatePool(account, route, objective)
  const targetShipCount = fleetShipCount(route)
  let states: readonly FleetSearchState[] = [
    {
      members: [],
      usedShipIds: new Set<ShipInstanceId>(),
      score: 0,
      lastCandidateIndex: -1,
    },
  ]

  for (let depth = 0; depth < targetShipCount; depth += 1) {
    const nextStates: FleetSearchState[] = []
    states.forEach((state) => {
      candidates.forEach((ship, candidateIndex) => {
        if (candidateIndex <= state.lastCandidateIndex) return
        if (state.usedShipIds.has(ship.id)) return
        const role = roleForShip(ship, route)
        const members = [...state.members, { ship, role }]
        if (violatesMaximumConstraints(members, route)) return
        const usedShipIds = new Set(state.usedShipIds)
        usedShipIds.add(ship.id)
        nextStates.push({
          members,
          usedShipIds,
          score:
            state.score +
            candidateShipScore(ship, role, objective) +
            requiredConstraintBonus(ship, state.members, route),
          lastCandidateIndex: candidateIndex,
        })
      })
    })
    states = nextStates
      .sort(
        (left, right) =>
          right.score - left.score ||
          shipSignature(left.members).localeCompare(shipSignature(right.members)),
      )
      .slice(0, FLEET_BEAM_WIDTH)
  }

  return states.filter((state) => satisfiesFleetConstraints(state.members, route))
}

const requirementsForMember = (
  member: FleetMember,
  shipIndex: number,
): readonly GearRequirement[] => {
  const slotCount = member.ship.slotSizes.length
  const requirementKinds: GearRequirementKind[] = []

  if (member.role === 'main-battleship') {
    requirementKinds.push('big-gun', 'big-gun', 'recon', 'ap-shell')
    while (requirementKinds.length < slotCount) requirementKinds.push('radar')
  } else if (member.role === 'utility-cruiser') {
    requirementKinds.push('main-gun', 'main-gun', 'recon', 'radar')
    while (requirementKinds.length < slotCount) requirementKinds.push('torpedo')
  } else if (member.role === 'carrier-air-superiority') {
    const orderedSlots = member.ship.slotSizes
      .map((slotSize, slotIndex) => ({ slotSize, slotIndex }))
      .sort((left, right) => right.slotSize - left.slotSize || left.slotIndex - right.slotIndex)
    const attackSlotIndexes = new Set(orderedSlots.slice(0, 2).map(({ slotIndex }) => slotIndex))
    return member.ship.slotSizes.map((slotSize, slotIndex) => ({
      key: `${shipIndex}:${slotIndex}`,
      shipIndex,
      slotIndex,
      slotSize,
      kind: attackSlotIndexes.has(slotIndex) ? 'attack-aircraft' : 'fighter',
    }))
  } else if (member.role === 'anti-submarine') {
    requirementKinds.push('sonar', 'depth-charge', 'sonar')
    while (requirementKinds.length < slotCount) requirementKinds.push('general')
  } else if (member.role === 'escort-destroyer') {
    requirementKinds.push('small-gun', 'small-gun', 'radar')
    while (requirementKinds.length < slotCount) requirementKinds.push('torpedo')
  } else if (member.role === 'submarine') {
    while (requirementKinds.length < slotCount) requirementKinds.push('torpedo')
  } else if (member.role === 'resource-carrier') {
    while (requirementKinds.length < slotCount) requirementKinds.push('landing-craft')
  } else {
    while (requirementKinds.length < slotCount) requirementKinds.push('general')
  }

  return member.ship.slotSizes.map((slotSize, slotIndex) => ({
    key: `${shipIndex}:${slotIndex}`,
    shipIndex,
    slotIndex,
    slotSize,
    kind: requirementKinds[slotIndex] ?? 'radar',
  }))
}

const gearMatchesRequirement = (gear: OwnedEquipment, kind: GearRequirementKind): boolean => {
  const acceptedTypes: Readonly<Record<GearRequirementKind, readonly number[]>> = {
    'big-gun': [3],
    'main-gun': [2, 3],
    recon: [9, 10],
    'ap-shell': [18],
    fighter: [6],
    'attack-aircraft': [7, 8],
    radar: [12, 13, 93],
    torpedo: [5],
    'small-gun': [1],
    sonar: [14, 40],
    'depth-charge': [15],
    'landing-craft': [24, 46],
    seaplane: [10, 11],
    general: [],
  }
  return kind === 'general' || acceptedTypes[kind].includes(gear.typeId)
}

const gearScore = (gear: OwnedEquipment, requirement: GearRequirement): number => {
  const stats = gear.stats
  const improvement = Math.sqrt(Math.max(gear.improvement, 0))
  switch (requirement.kind) {
    case 'fighter':
      return (gear.airPowerBySlotSize[String(requirement.slotSize)] ?? 0) * 4 + stats.evasion
    case 'attack-aircraft':
      return stats.torpedo * 4 + stats.bombing * 4 + stats.antiAir * 1.5 + stats.accuracy
    case 'recon':
      return stats.los * 6 + stats.accuracy * 2 + improvement
    case 'radar':
      return stats.los * 5 + stats.accuracy * 3 + stats.antiAir + improvement
    case 'torpedo':
      return stats.torpedo * 5 + stats.accuracy + improvement * 2
    case 'ap-shell':
      return stats.firepower * 4 + stats.accuracy * 2 + stats.armor + improvement * 2
    case 'big-gun':
    case 'main-gun':
      return stats.firepower * 5 + stats.accuracy * 2 + stats.antiAir + improvement * 2
    case 'small-gun':
      return stats.firepower * 4 + stats.accuracy * 2 + stats.antiAir + improvement * 2
    case 'sonar':
    case 'depth-charge':
      return stats.asw * 6 + stats.accuracy + improvement
    case 'landing-craft':
      return 50 + stats.firepower + stats.armor + improvement
    case 'seaplane':
      return stats.los * 4 + stats.bombing * 3 + stats.antiAir * 2
    case 'general':
      return (
        stats.firepower * 2 +
        stats.torpedo * 2 +
        stats.antiAir +
        stats.armor +
        stats.asw +
        stats.los +
        stats.bombing * 2 +
        improvement
      )
  }
}

const optionsForRequirement = (
  requirement: GearRequirement,
  members: readonly FleetMember[],
  account: AccountSnapshot,
  avoidCurrentFleetEquipment: boolean,
): readonly GearOption[] => {
  const ship = members[requirement.shipIndex].ship
  const currentFleetIds = new Set(account.currentFleetShipIds)
  return account.equipment
    .filter((gear) => ship.regularEquipableMasterIds.includes(gear.masterId))
    .filter((gear) => gearMatchesRequirement(gear, requirement.kind))
    .filter(
      (gear) =>
        !avoidCurrentFleetEquipment ||
        !gear.currentlyEquippedBy ||
        !currentFleetIds.has(gear.currentlyEquippedBy),
    )
    .map((gear) => ({ gear, score: gearScore(gear, requirement) }))
    .sort((left, right) => right.score - left.score || left.gear.id - right.gear.id)
    .slice(0, GEAR_CANDIDATES_PER_SLOT)
}

const buildGearSolutions = (
  fleet: FleetSearchState,
  account: AccountSnapshot,
  avoidCurrentFleetEquipment: boolean,
): readonly RecommendedShipBuild[][] => {
  const requirements = fleet.members.flatMap(requirementsForMember)
  const requirementsWithOptions = requirements
    .map((requirement) => ({
      requirement,
      options: optionsForRequirement(
        requirement,
        fleet.members,
        account,
        avoidCurrentFleetEquipment,
      ),
    }))
    .sort(
      (left, right) =>
        left.options.length - right.options.length ||
        left.requirement.key.localeCompare(right.requirement.key),
    )

  let states: readonly GearSearchState[] = [
    {
      assignments: new Map<string, OwnedEquipment | null>(),
      usedEquipmentIds: new Set<EquipmentInstanceId>(),
      score: 0,
    },
  ]

  requirementsWithOptions.forEach(({ requirement, options }) => {
    const nextStates: GearSearchState[] = []
    states.forEach((state) => {
      const availableOptions = options.filter(({ gear }) => !state.usedEquipmentIds.has(gear.id))
      const candidates: readonly (GearOption | null)[] = [...availableOptions, null]
      candidates.forEach((option) => {
        const assignments = new Map(state.assignments)
        assignments.set(requirement.key, option?.gear ?? null)
        const usedEquipmentIds = new Set(state.usedEquipmentIds)
        if (option) usedEquipmentIds.add(option.gear.id)
        nextStates.push({
          assignments,
          usedEquipmentIds,
          score: state.score + (option?.score ?? -80),
        })
      })
    })
    states = nextStates
      .sort(
        (left, right) =>
          right.score - left.score || gearSignature(left).localeCompare(gearSignature(right)),
      )
      .slice(0, GEAR_BEAM_WIDTH)
  })

  return states.slice(0, 6).map((state) =>
    fleet.members.map((member, shipIndex) => ({
      ship: member.ship,
      role: member.role,
      equipment: member.ship.slotSizes.map(
        (_, slotIndex) => state.assignments.get(`${shipIndex}:${slotIndex}`) ?? null,
      ),
      expansionSlot: null,
    })),
  )
}

const scoreFleet = (
  builds: readonly RecommendedShipBuild[],
  metrics: ReturnType<typeof calculateFleetMetrics>,
  objective: RecommendationObjective,
): RecommendationScore => {
  const totalShipFirepower = builds.reduce(
    (total, build) =>
      total +
      build.ship.stats.firepower +
      build.equipment.reduce(
        (equipmentTotal, gear) =>
          equipmentTotal + (gear?.stats.firepower ?? 0) + (gear?.stats.bombing ?? 0),
        0,
      ),
    0,
  )
  const totalSurvival = builds.reduce(
    (total, build) =>
      total + build.ship.stats.hp + build.ship.stats.armor + build.ship.stats.evasion * 0.5,
    0,
  )
  const movedEquipmentCount = builds.reduce(
    (total, build) =>
      total +
      build.equipment.filter(
        (gear) => gear?.currentlyEquippedBy && gear.currentlyEquippedBy !== build.ship.id,
      ).length,
    0,
  )
  const dimensions: Readonly<Record<ScoreDimension, number>> = {
    bossDamage: clamp((totalShipFirepower - 300) / 4),
    survival: clamp((totalSurvival - 500) / 4),
    airPowerMargin: metrics.airPowerRequired
      ? clamp(
          45 +
            ((metrics.airPower - metrics.airPowerMinimum) /
              Math.max(metrics.airPowerRecommended - metrics.airPowerMinimum, 1)) *
              55,
        )
      : 50,
    nightBattle: clamp(
      builds.reduce(
        (total, build) => total + build.ship.stats.torpedo + build.ship.stats.luck * 0.5,
        0,
      ) / 3,
    ),
    openingAsw: clamp(metrics.openingAswCount * 35),
    resourceCost: clamp(115 - (metrics.estimatedFuelCost + metrics.estimatedAmmoCost) / 20),
    equipmentOpportunityCost: clamp(100 - movedEquipmentCount * 7),
    routeReliability: clamp(
      (metrics.losRequired ? 70 + Math.min(metrics.los33 - metrics.losMinimum, 15) * 2 : 80) +
        (metrics.airPowerRequired
          ? Math.min(metrics.airPower - metrics.airPowerMinimum, 50) * 0.2
          : 0),
    ),
  }
  const weights: Readonly<
    Record<RecommendationObjective, Readonly<Record<ScoreDimension, number>>>
  > = {
    balanced: {
      bossDamage: 0.25,
      survival: 0.25,
      airPowerMargin: 0.15,
      nightBattle: 0.1,
      openingAsw: 0.05,
      resourceCost: 0.1,
      equipmentOpportunityCost: 0.05,
      routeReliability: 0.05,
    },
    'boss-clear': {
      bossDamage: 0.38,
      survival: 0.2,
      airPowerMargin: 0.15,
      nightBattle: 0.12,
      openingAsw: 0.02,
      resourceCost: 0.03,
      equipmentOpportunityCost: 0.02,
      routeReliability: 0.08,
    },
    'low-cost': {
      bossDamage: 0.15,
      survival: 0.2,
      airPowerMargin: 0.12,
      nightBattle: 0.08,
      openingAsw: 0.03,
      resourceCost: 0.25,
      equipmentOpportunityCost: 0.12,
      routeReliability: 0.05,
    },
    leveling: {
      bossDamage: 0.1,
      survival: 0.2,
      airPowerMargin: 0.05,
      nightBattle: 0.05,
      openingAsw: 0.2,
      resourceCost: 0.25,
      equipmentOpportunityCost: 0.1,
      routeReliability: 0.05,
    },
    'resource-fuel': {
      bossDamage: 0.08,
      survival: 0.17,
      airPowerMargin: 0.05,
      nightBattle: 0.03,
      openingAsw: 0.02,
      resourceCost: 0.45,
      equipmentOpportunityCost: 0.15,
      routeReliability: 0.05,
    },
    'resource-ammo': {
      bossDamage: 0.08,
      survival: 0.17,
      airPowerMargin: 0.05,
      nightBattle: 0.03,
      openingAsw: 0.02,
      resourceCost: 0.45,
      equipmentOpportunityCost: 0.15,
      routeReliability: 0.05,
    },
    'resource-steel': {
      bossDamage: 0.08,
      survival: 0.17,
      airPowerMargin: 0.05,
      nightBattle: 0.03,
      openingAsw: 0.02,
      resourceCost: 0.45,
      equipmentOpportunityCost: 0.15,
      routeReliability: 0.05,
    },
    'resource-bauxite': {
      bossDamage: 0.08,
      survival: 0.17,
      airPowerMargin: 0.05,
      nightBattle: 0.03,
      openingAsw: 0.02,
      resourceCost: 0.45,
      equipmentOpportunityCost: 0.15,
      routeReliability: 0.05,
    },
    'resource-bucket': {
      bossDamage: 0.08,
      survival: 0.17,
      airPowerMargin: 0.05,
      nightBattle: 0.03,
      openingAsw: 0.02,
      resourceCost: 0.45,
      equipmentOpportunityCost: 0.15,
      routeReliability: 0.05,
    },
    'resource-devmat': {
      bossDamage: 0.08,
      survival: 0.17,
      airPowerMargin: 0.05,
      nightBattle: 0.03,
      openingAsw: 0.02,
      resourceCost: 0.45,
      equipmentOpportunityCost: 0.15,
      routeReliability: 0.05,
    },
  }
  const total = (Object.keys(dimensions) as ScoreDimension[]).reduce(
    (sum, dimension) => sum + dimensions[dimension] * weights[objective][dimension],
    0,
  )
  return { total: Math.round(total * 10) / 10, dimensions }
}

const recommendationMessages = (
  builds: readonly RecommendedShipBuild[],
  metrics: ReturnType<typeof calculateFleetMetrics>,
  route: RouteTemplate,
): {
  readonly reasons: readonly RecommendationMessage[]
  readonly warnings: readonly RecommendationMessage[]
} => {
  const reasons: RecommendationMessage[] = [
    {
      code: 'ROUTE_FIXED_COMPOSITION',
      message: `採用「${route.name}」${route.nodes.length ? `（${route.nodes.join(' → ')}）` : ''}，艦種配置符合資料規則。`,
    },
    {
      code: 'EQUIPMENT_INSTANCES_UNIQUE',
      message: '每件裝備均以 KC3 instance ID 分配，方案內沒有重複使用。',
    },
  ]
  const warnings: RecommendationMessage[] = []

  if (metrics.airPowerRequired && metrics.airPower >= metrics.airPowerRecommended) {
    reasons.push({
      code: 'AIR_POWER_RECOMMENDED',
      message: `制空值 ${metrics.airPower}，已達建議值 ${metrics.airPowerRecommended}。`,
    })
  } else if (metrics.airPowerRequired) {
    warnings.push({
      code: 'AIR_POWER_BELOW_RECOMMENDED',
      message: `制空值 ${metrics.airPower} 通過最低值，但未達建議值 ${metrics.airPowerRecommended}。`,
    })
  }

  const losMargin = metrics.los33 - metrics.losMinimum
  if (metrics.losRequired) {
    reasons.push({
      code: 'LOS_CONSTRAINT_PASSED',
      message: `33 式索敵為 ${metrics.los33.toFixed(1)}，餘裕 ${losMargin.toFixed(1)}。`,
    })
  }
  if (metrics.losRequired && losMargin < 5) {
    warnings.push({
      code: 'LOW_LOS_MARGIN',
      message: '索敵餘裕低於 5；更換艦娘或偵察裝備後請重新產生方案。',
    })
  }

  const movedEquipmentCount = builds.reduce(
    (total, build) =>
      total +
      build.equipment.filter(
        (gear) => gear?.currentlyEquippedBy && gear.currentlyEquippedBy !== build.ship.id,
      ).length,
    0,
  )
  if (movedEquipmentCount > 0) {
    warnings.push({
      code: 'EQUIPMENT_MOVEMENT_REQUIRED',
      message: `需從其他艦娘調度 ${movedEquipmentCount} 件現有裝備；系統不會自動換裝。`,
    })
  }
  if (route.tags.includes('random-routing') || route.tags.some((tag) => tag.includes('routing-'))) {
    warnings.push({
      code: 'ROUTE_NOT_GUARANTEED',
      message: '此方案含機率分歧，結果頁已保留資料來源標記。',
    })
  }
  if (route.metadata.confidence === 'experimental') {
    warnings.push({
      code: 'EXPERIMENTAL_ROUTE',
      message: '此路線仍屬新海域／實驗資料，出擊前請再次核對最新攻略。',
    })
  }
  warnings.push({
    code: 'HEURISTIC_COMBAT_SCORE',
    message: '火力與消耗為啟發式評估，不是完整戰鬥模擬。',
  })

  return { reasons, warnings }
}

const recommendationTitles: Readonly<Record<RecommendationObjective, readonly string[]>> = {
  balanced: ['均衡主案', '穩定替案', '調度替案'],
  'boss-clear': ['斬殺主案', '火力替案', '制空替案'],
  'low-cost': ['節約主案', '低耗替案', '保守替案'],
  leveling: ['育成主案', '低耗育成', '替代育成'],
  'resource-fuel': ['燃料主案', '燃料替案', '低耗替案'],
  'resource-ammo': ['彈藥主案', '彈藥替案', '低耗替案'],
  'resource-steel': ['鋼材主案', '鋼材替案', '低耗替案'],
  'resource-bauxite': ['鋁土主案', '鋁土替案', '低耗替案'],
  'resource-bucket': ['水桶主案', '水桶替案', '兼收替案'],
  'resource-devmat': ['開發主案', '開發替案', '兼收替案'],
}

const analyzeFleetAvailability = (
  account: AccountSnapshot,
  route: RouteTemplate,
): readonly UnsatisfiedRequirement[] => {
  const reasons: UnsatisfiedRequirement[] = []
  route.fleetConstraints.forEach((constraint) => {
    if (constraint.kind === 'specific-ship-name') {
      const count = account.ships.filter((ship) =>
        constraint.names.some((name) => ship.name.includes(name)),
      ).length
      if (count < constraint.min) {
        reasons.push({
          code: 'MISSING_SPECIFIC_SHIP',
          message: `此路線需要 ${constraint.names.join('/')}，目前帳號缺少可用艦。`,
        })
      }
      return
    }
    if (constraint.kind !== 'ship-type-count') return
    const minimum = constraint.exact ?? constraint.min
    if (minimum === undefined) return
    const count = account.ships.filter((ship) =>
      constraint.shipTypeIds.includes(ship.shipTypeId),
    ).length
    if (count < minimum) {
      reasons.push({
        code: 'INSUFFICIENT_SHIP_TYPE',
        message: `符合艦種條件的艦娘只有 ${count} 艘，需要 ${minimum} 艘。`,
      })
    }
  })
  return reasons
}

export const recommendFleet = (input: RecommendFleetInput): RecommendFleetResult => {
  const startedAt = Date.now()
  const routes = getRouteTemplates(input.mapId, input.objective, input.routeId)
  if (routes.length === 0) {
    return { status: 'error', error: { code: 'RULE_NOT_FOUND', message: '找不到指定關卡規則。' } }
  }

  const routeAvailability = routes.map((route) => ({
    route,
    reasons: analyzeFleetAvailability(input.account, route),
  }))
  const availableRoutes = routeAvailability.filter(({ reasons }) => reasons.length === 0)
  if (availableRoutes.length === 0) {
    return {
      status: 'no-solution',
      analysis: { reasons: routeAvailability.flatMap(({ reasons }) => reasons) },
      elapsedMs: Date.now() - startedAt,
      solverVersion: SOLVER_VERSION,
    }
  }

  const recommendationCandidates: FleetRecommendation[] = []
  let bestAirPower = 0
  let bestLos = Number.NEGATIVE_INFINITY

  availableRoutes.forEach(({ route }, routeIndex) => {
    const fleetCandidates = generateFleetCandidates(input.account, route, input.objective)
    fleetCandidates.slice(0, Math.min(FLEETS_TO_EQUIP, 18)).forEach((fleet, fleetIndex) => {
      const gearSolutions = buildGearSolutions(
        fleet,
        input.account,
        input.preferences?.avoidCurrentFleetEquipment ?? false,
      )
      gearSolutions.forEach((builds, gearIndex) => {
        const metrics = calculateFleetMetrics(builds, route, input.account.hqLevel)
        bestAirPower = Math.max(bestAirPower, metrics.airPower)
        bestLos = Math.max(bestLos, metrics.los33)
        if (!satisfiesCalculatedConstraints(metrics)) return
        const score = scoreFleet(builds, metrics, input.objective)
        const messages = recommendationMessages(builds, metrics, route)
        recommendationCandidates.push({
          id: `${route.id}-${routeIndex}-${fleetIndex}-${gearIndex}`,
          title: '',
          mapId: input.mapId,
          route,
          ships: builds,
          metrics,
          score,
          reasons: messages.reasons,
          warnings: messages.warnings,
        })
      })
    })
  })

  const seenFleets = new Set<string>()
  const rankedRecommendations = recommendationCandidates
    .sort(
      (left, right) =>
        right.score.total - left.score.total ||
        left.ships
          .map((build) => build.ship.id)
          .join('-')
          .localeCompare(right.ships.map((build) => build.ship.id).join('-')),
    )
    .filter((recommendation) => {
      const signature = `${recommendation.route.id}:${recommendation.ships
        .map((build) => build.ship.id)
        .join('-')}`
      if (seenFleets.has(signature)) return false
      seenFleets.add(signature)
      return true
    })
  const selectedRecommendations: FleetRecommendation[] = []
  const selectedRouteIds = new Set<string>()
  rankedRecommendations.forEach((recommendation) => {
    if (selectedRecommendations.length >= 3 || selectedRouteIds.has(recommendation.route.id)) return
    selectedRecommendations.push(recommendation)
    selectedRouteIds.add(recommendation.route.id)
  })
  rankedRecommendations.forEach((recommendation) => {
    if (selectedRecommendations.length >= 3 || selectedRecommendations.includes(recommendation))
      return
    selectedRecommendations.push(recommendation)
  })
  const recommendations = selectedRecommendations.map((recommendation, index) => ({
    ...recommendation,
    title: `${recommendation.route.name} · ${recommendationTitles[input.objective][index] ?? `方案 ${index + 1}`}`,
  }))

  if (recommendations.length === 0) {
    const reasons: UnsatisfiedRequirement[] = []
    const airMinimums = availableRoutes.flatMap(({ route }) =>
      route.calculatedConstraints
        .filter((item) => item.kind === 'air-power')
        .map((item) => item.minimum),
    )
    const losMinimums = availableRoutes.flatMap(({ route }) =>
      route.calculatedConstraints.filter((item) => item.kind === 'los').map((item) => item.minimum),
    )
    const airMinimum = airMinimums.length > 0 ? Math.min(...airMinimums) : null
    const losMinimum = losMinimums.length > 0 ? Math.min(...losMinimums) : null
    if (airMinimum !== null && bestAirPower < airMinimum) {
      reasons.push({
        code: 'AIR_POWER_INSUFFICIENT',
        message: `目前搜尋到的最高制空值為 ${bestAirPower}，最低需要 ${airMinimum}。`,
      })
    }
    if (losMinimum !== null && bestLos < losMinimum) {
      reasons.push({
        code: 'LOS_INSUFFICIENT',
        message: `目前搜尋到的最高 33 式索敵為 ${Math.max(bestLos, 0).toFixed(1)}，最低需要 ${losMinimum}。`,
      })
    }
    if (reasons.length === 0) {
      reasons.push({
        code: 'EQUIPMENT_ASSIGNMENT_FAILED',
        message: '持有裝備無法同時滿足可裝備性、裝備唯一性、制空與索敵條件。',
      })
    }
    return {
      status: 'no-solution',
      analysis: { reasons },
      elapsedMs: Date.now() - startedAt,
      solverVersion: SOLVER_VERSION,
    }
  }

  return {
    status: 'success',
    recommendations,
    elapsedMs: Date.now() - startedAt,
    solverVersion: SOLVER_VERSION,
  }
}
