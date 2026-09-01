import type {
  AccountSnapshot,
  FleetConstraint,
  FleetRole,
  OwnedShip,
  RecommendationObjective,
  RouteTemplate,
  ShipInstanceId,
  UnsatisfiedRequirement,
} from '../types'
import type { FleetMember, FleetSearchState } from './internal-types'
import { isDrumCanister, isNormalResourceLandingCraft } from '../resource'
import { arrangeSpecialAttack } from './special-attack'

const FLEET_BEAM_WIDTH = 400
const FLEET_CANDIDATES_PER_ROLE = 14
const CURRENT_FLEET_SHIP_PREFERENCE_BONUS = 25
const OPENING_TORPEDO_PREFERENCE_BONUS = 600
const SPEED_GEAR_MASTER_IDS = new Set([33, 34, 87])
const SEAPLANE_TYPE_IDS = new Set([10, 11, 45])
const RADAR_TYPE_IDS = new Set([12, 13, 51, 93])
const AIR_POWER_EQUIPMENT_TYPE_IDS = new Set([6, 7, 8, 11, 45, 56, 57, 58, 91])

interface FastPlusCandidateProfile {
  readonly regularSlotsUsed: number
}

interface RouteSupportProfile {
  readonly airPowerPotential: number
  readonly seaplaneAirPowerPotential: number
  readonly seaplaneLosPotential: number
  readonly submarineLosPotential: number
  readonly compatibleSeaplaneCount: number
  readonly compatibleSubmarineLosCount: number
  readonly compatibleMidgetSubmarineCount: number
}

interface RankedShipCandidate {
  readonly ship: OwnedShip
  readonly role: FleetRole
  readonly score: number
}

export interface FleetSearchDiagnostics {
  readonly eligibleShipCount: number
  readonly candidatePoolCount: number
  readonly requiredCandidateCount: number
  readonly infeasiblePartialStateCount: number
  readonly maxDepth: number
  readonly completeStateCount: number
  readonly constraintValidStateCount: number
  readonly specialAttackRejectedCount: number
}

export interface FleetSearchResult {
  readonly candidates: readonly FleetSearchState[]
  readonly diagnostics: FleetSearchDiagnostics
}

const fastPlusProfileCache = new WeakMap<
  AccountSnapshot,
  Map<number, FastPlusCandidateProfile | null>
>()
const routeSupportProfileCache = new WeakMap<AccountSnapshot, Map<number, RouteSupportProfile>>()

const shipSignature = (members: readonly FleetMember[]): string =>
  members.map((member) => member.ship.id).join('-')

const gearAirPowerForSlot = (
  gear: AccountSnapshot['equipment'][number],
  slotSize: number,
): number => gear.airPowerBySlotSize[String(slotSize)] ?? 0

const shipRouteSupportProfile = (
  ship: OwnedShip,
  account: AccountSnapshot,
): RouteSupportProfile => {
  let accountCache = routeSupportProfileCache.get(account)
  if (!accountCache) {
    accountCache = new Map<number, RouteSupportProfile>()
    routeSupportProfileCache.set(account, accountCache)
  }
  const cached = accountCache.get(ship.id)
  if (cached) return cached

  const regularMasterIds = new Set(ship.regularEquipableMasterIds)
  const compatibleEquipment = account.equipment.filter((gear) =>
    regularMasterIds.has(gear.masterId),
  )
  const compatibleSeaplanes = compatibleEquipment.filter((gear) =>
    SEAPLANE_TYPE_IDS.has(gear.typeId),
  )
  const compatibleSubmarineLosEquipment = compatibleEquipment.filter(
    (gear) => SEAPLANE_TYPE_IDS.has(gear.typeId) || RADAR_TYPE_IDS.has(gear.typeId),
  )
  const compatibleAirPowerGear = compatibleEquipment.filter((gear) =>
    AIR_POWER_EQUIPMENT_TYPE_IDS.has(gear.typeId),
  )
  const positiveSlots = ship.slotSizes.filter((slotSize) => slotSize > 0)
  const airPowerPotential = positiveSlots.reduce(
    (total, slotSize) =>
      total +
      Math.max(0, ...compatibleAirPowerGear.map((gear) => gearAirPowerForSlot(gear, slotSize))),
    0,
  )
  const seaplaneAirPowerPotential = positiveSlots.reduce(
    (total, slotSize) =>
      total +
      Math.max(0, ...compatibleSeaplanes.map((gear) => gearAirPowerForSlot(gear, slotSize))),
    0,
  )
  const bestSeaplaneLos = Math.max(
    0,
    ...compatibleSeaplanes.map((gear) => gear.stats.los + gear.losImprovement),
  )
  const bestSubmarineLos = Math.max(
    0,
    ...compatibleSubmarineLosEquipment.map((gear) => gear.stats.los + gear.losImprovement),
  )
  const profile = {
    airPowerPotential,
    seaplaneAirPowerPotential,
    seaplaneLosPotential: bestSeaplaneLos * positiveSlots.length,
    submarineLosPotential: bestSubmarineLos * positiveSlots.length,
    compatibleSeaplaneCount: compatibleSeaplanes.length,
    compatibleSubmarineLosCount: compatibleSubmarineLosEquipment.length,
    compatibleMidgetSubmarineCount: compatibleEquipment.filter((gear) => gear.typeId === 22).length,
  }
  accountCache.set(ship.id, profile)
  return profile
}

const resourceGearKindsForShip = (ship: OwnedShip, account: AccountSnapshot): ReadonlySet<string> =>
  new Set(
    account.equipment
      .filter((gear) => ship.regularEquipableMasterIds.includes(gear.masterId))
      .filter((gear) => isNormalResourceLandingCraft(gear) || isDrumCanister(gear))
      .map((gear) => (isNormalResourceLandingCraft(gear) ? 'landing-craft' : 'drum')),
  )

const fastPlusProfileForShip = (
  ship: OwnedShip,
  account: AccountSnapshot,
): FastPlusCandidateProfile | null => {
  let accountCache = fastPlusProfileCache.get(account)
  if (!accountCache) {
    accountCache = new Map<number, FastPlusCandidateProfile | null>()
    fastPlusProfileCache.set(account, accountCache)
  }
  if (accountCache.has(ship.id)) return accountCache.get(ship.id) ?? null
  const regularMasterIds = new Set(ship.regularEquipableMasterIds)
  const expansionEquipmentIds = new Set(ship.expansionEquipableEquipmentIds)
  const compatibleSpeedGear = account.equipment.filter(
    (gear) =>
      SPEED_GEAR_MASTER_IDS.has(gear.masterId) &&
      (regularMasterIds.has(gear.masterId) || expansionEquipmentIds.has(gear.id)),
  )
  const profiles = ship.fastPlusPatterns.flatMap((pattern) => {
    const requirements = [
      {
        count: pattern.turbineCount,
        matches: (gear: (typeof compatibleSpeedGear)[number]) => gear.masterId === 33,
      },
      {
        count: pattern.enhancedBoilerCount,
        matches: (gear: (typeof compatibleSpeedGear)[number]) => gear.masterId === 34,
      },
      {
        count: pattern.newModelBoilerBelow7Count,
        matches: (gear: (typeof compatibleSpeedGear)[number]) =>
          gear.masterId === 87 && gear.improvement < 7,
      },
      {
        count: pattern.newModelBoilerAtLeast7Count,
        matches: (gear: (typeof compatibleSpeedGear)[number]) =>
          gear.masterId === 87 && gear.improvement >= 7,
      },
    ]
    const availability = requirements.map(({ count, matches }) => ({
      count,
      compatibleCount: compatibleSpeedGear.filter(matches).length,
      regularCount: compatibleSpeedGear.filter(
        (gear) => regularMasterIds.has(gear.masterId) && matches(gear),
      ).length,
      expansionCount: compatibleSpeedGear.filter(
        (gear) => expansionEquipmentIds.has(gear.id) && matches(gear),
      ).length,
    }))
    if (availability.some(({ count, compatibleCount }) => count > compatibleCount)) {
      return []
    }
    const requiredExpansionSlots = availability.reduce(
      (total, { count, regularCount }) => total + Math.max(0, count - regularCount),
      0,
    )
    if (requiredExpansionSlots > 1) return []
    const totalGearCount = requirements.reduce((total, requirement) => total + requirement.count, 0)
    const expansionAvailable = availability.some(
      ({ count, regularCount, expansionCount }) =>
        count > 0 && regularCount >= count - 1 && expansionCount > 0,
    )
    const regularSlotsUsed = totalGearCount - Number(expansionAvailable)
    return regularSlotsUsed <= ship.slotSizes.length ? [{ regularSlotsUsed }] : []
  })
  const profile =
    profiles.sort((left, right) => left.regularSlotsUsed - right.regularSlotsUsed)[0] ?? null
  accountCache.set(ship.id, profile)
  return profile
}

const fastPlusBurdenPenalty = (
  ship: OwnedShip,
  role: FleetRole,
  profile: FastPlusCandidateProfile | null,
): number => {
  if (!profile) return 0
  const remainingSlots = Math.max(0, ship.slotSizes.length - profile.regularSlotsUsed)
  if (role === 'main-battleship') {
    const mainGunShortage = Math.max(0, 2 - remainingSlots)
    return profile.regularSlotsUsed * 70 + mainGunShortage * 500
  }
  if (role === 'carrier-air-superiority') {
    const lostAirCapacity = [...ship.slotSizes]
      .sort((left, right) => left - right)
      .slice(0, profile.regularSlotsUsed)
      .reduce((total, slotSize) => total + Math.sqrt(slotSize) * 8, 0)
    return profile.regularSlotsUsed * 45 + lostAirCapacity
  }
  return profile.regularSlotsUsed * 45 + Math.max(0, 2 - remainingSlots) * 180
}

const candidateShipScore = (
  ship: OwnedShip,
  role: FleetRole,
  objective: RecommendationObjective,
  account: AccountSnapshot,
  fastPlusProfile: FastPlusCandidateProfile | null,
  route: RouteTemplate,
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

  const supportProfile = shipRouteSupportProfile(ship, account)
  const positiveSlotCount = ship.slotSizes.filter((slotSize) => slotSize > 0).length
  const totalSlotSize = ship.slotSizes.reduce((total, slotSize) => total + slotSize, 0)
  const airPowerRequired = route.calculatedConstraints.some(
    (constraint) => constraint.kind === 'air-power',
  )
  const losRequired = route.calculatedConstraints.some((constraint) => constraint.kind === 'los')
  const seaplaneLosPriority = route.tags.includes('bbv-seaplane-los-priority')
  let routeFit = 0
  if (seaplaneLosPriority && ship.shipTypeId === 10) {
    routeFit += ship.slotSizes.length * 120 + positiveSlotCount * 40 + totalSlotSize * 1.2
    routeFit += supportProfile.compatibleSeaplaneCount > 0 ? 180 : -250
    if (airPowerRequired) routeFit += Math.min(supportProfile.seaplaneAirPowerPotential, 180) * 0.75
    if (losRequired)
      routeFit += ship.nakedLos * 0.6 + Math.min(supportProfile.seaplaneLosPotential, 100)
  } else {
    if (airPowerRequired && role === 'carrier-air-superiority') {
      routeFit += Math.min(supportProfile.airPowerPotential, 360) * 0.25
    }
    if (airPowerRequired && [6, 10, 16].includes(ship.shipTypeId)) {
      routeFit += Math.min(supportProfile.seaplaneAirPowerPotential, 160) * 0.35
    }
    if (losRequired && ['main-battleship', 'utility-cruiser'].includes(role)) {
      routeFit += ship.nakedLos * 0.25 + Math.min(supportProfile.seaplaneLosPotential, 80) * 0.4
    }
    if (route.tags.includes('submarine-seaplane-air-control') && role === 'submarine') {
      routeFit += ship.slotSizes.length * 110 + positiveSlotCount * 55 + totalSlotSize * 0.9
      routeFit += Math.min(supportProfile.seaplaneAirPowerPotential, 160) * 0.7
      routeFit += supportProfile.compatibleSeaplaneCount > 0 ? 180 : -300
    }
    if (route.tags.includes('submarine-los-priority') && role === 'submarine') {
      routeFit += positiveSlotCount * 120 + totalSlotSize * 0.8
      routeFit += Math.min(supportProfile.submarineLosPotential, 140) * 1.1
      routeFit += supportProfile.compatibleSubmarineLosCount > 0 ? 220 : -350
    }
    if (
      route.tags.includes('opening-torpedo-preferred') &&
      ship.shipTypeId === 3 &&
      supportProfile.compatibleMidgetSubmarineCount > 0
    ) {
      routeFit += OPENING_TORPEDO_PREFERENCE_BONUS
    }
    if (route.tags.includes('guide-prefer-maya-aaci') && isMayaClassAntiAirCandidate(ship)) {
      routeFit += 1600 + ship.stats.antiAir * 4
    }
  }

  const speedBurden = fastPlusBurdenPenalty(ship, role, fastPlusProfile)
  if (objective === 'boss-clear') {
    return roleFit * 0.55 + routeFit + offense * 0.3 + survival * 0.1 + level - speedBurden
  }
  if (objective === 'low-cost') {
    return (
      roleFit * 0.4 +
      routeFit +
      survival * 0.25 +
      level -
      (ship.fuelCost + ship.ammoCost) * 0.65 -
      speedBurden
    )
  }
  if (objective === 'leveling') {
    return (
      roleFit * 0.2 +
      routeFit +
      survival * 0.1 +
      (180 - Math.min(ship.level, 180)) * 1.5 -
      speedBurden
    )
  }
  if (objective.startsWith('resource-')) {
    const resourceGearKinds = new Set(
      role === 'resource-carrier' ? resourceGearKindsForShip(ship, account) : [],
    )
    const transportFit = resourceGearKinds.has('landing-craft')
      ? ship.slotSizes.length * 80
      : resourceGearKinds.has('drum')
        ? ship.slotSizes.length * 35
        : role === 'resource-carrier'
          ? -1000
          : 0
    return (
      roleFit * 0.15 +
      routeFit +
      survival * 0.1 +
      transportFit +
      180 -
      (ship.fuelCost + ship.ammoCost) * 1.4 -
      speedBurden
    )
  }
  return roleFit * 0.45 + routeFit + survival * 0.25 + offense * 0.15 + level - speedBurden
}

const roleForShip = (ship: OwnedShip, route: RouteTemplate): FleetRole => {
  const openingAswRequired = route.calculatedConstraints.some(
    (constraint) => constraint.kind === 'opening-asw',
  )
  const antiSubmarineLoadoutRequired =
    route.tags.includes('asw-loadout') ||
    (openingAswRequired && route.tags.some((tag) => ['asw', 'oasw'].includes(tag)))
  if (
    route.tags.includes('anti-air-cut-in') &&
    ship.shipTypeId === 2 &&
    isAkizukiClassAntiAirCandidate(ship)
  ) {
    return 'escort-destroyer'
  }
  if (antiSubmarineLoadoutRequired && [1, 2, 3, 21].includes(ship.shipTypeId)) {
    return 'anti-submarine'
  }
  const needsResourceEquipment = route.tags.some((tag) =>
    ['landing-craft', 'amphibious-tank'].includes(tag),
  )
  if (needsResourceEquipment && [2, 6, 16, 22].includes(ship.shipTypeId)) {
    return 'resource-carrier'
  }
  if ([8, 9, 10, 12].includes(ship.shipTypeId)) return 'main-battleship'
  if ([7, 11, 18].includes(ship.shipTypeId)) return 'carrier-air-superiority'
  if (ship.shipTypeId === 4) return 'torpedo-cruiser'
  if ([13, 14].includes(ship.shipTypeId)) return 'submarine'
  if ([1, 2].includes(ship.shipTypeId)) return 'escort-destroyer'
  if ([3, 4, 5, 6, 16, 20, 21, 22].includes(ship.shipTypeId)) return 'utility-cruiser'
  return 'wildcard'
}

const normalizeShipNameForMatch = (name: string): string =>
  name
    .normalize('NFKC')
    .replace(/黒/g, '黑')
    .replace(/蔵/g, '藏')
    .replace(/奥/g, '奧')
    .replace(/陆/g, '陸')

const isMayaClassAntiAirCandidate = (ship: OwnedShip): boolean =>
  /摩耶|Maya/i.test(normalizeShipNameForMatch(ship.name))

const isAkizukiClassAntiAirCandidate = (ship: OwnedShip): boolean =>
  /秋月|照月|涼月|初月|冬月|Akizuki|Teruzuki|Suzutsuki|Hatsuzuki|Fuyuzuki/i.test(
    normalizeShipNameForMatch(ship.name),
  )

const shipMatchesNameConstraint = (
  shipName: string,
  constraintNames: readonly string[],
): boolean => {
  const normalizedShipName = normalizeShipNameForMatch(shipName)
  return constraintNames.some((name) =>
    normalizedShipName.includes(normalizeShipNameForMatch(name)),
  )
}

const satisfiesFleetConstraints = (
  members: readonly FleetMember[],
  route: RouteTemplate,
): boolean =>
  route.fleetConstraints.every((constraint) => {
    if (constraint.kind === 'ship-count') return members.length === constraint.exact
    if (constraint.kind === 'specific-ship-name') {
      const count = members.filter((member) =>
        shipMatchesNameConstraint(member.ship.name, constraint.names),
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
        shipMatchesNameConstraint(member.ship.name, constraint.names),
      ).length
      const matches = shipMatchesNameConstraint(ship.name, constraint.names)
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

type CountedFleetConstraint = Exclude<FleetConstraint, { readonly kind: 'ship-count' }>

const constraintMinimum = (constraint: CountedFleetConstraint): number =>
  constraint.kind === 'specific-ship-name'
    ? constraint.min
    : (constraint.exact ?? constraint.min ?? 0)

const constraintMaximum = (constraint: CountedFleetConstraint): number =>
  constraint.kind === 'specific-ship-name'
    ? Number.POSITIVE_INFINITY
    : (constraint.exact ?? constraint.max ?? Number.POSITIVE_INFINITY)

const shipMatchesFleetConstraint = (
  ship: OwnedShip,
  constraint: CountedFleetConstraint,
): boolean =>
  constraint.kind === 'specific-ship-name'
    ? shipMatchesNameConstraint(ship.name, constraint.names)
    : constraint.shipTypeIds.includes(ship.shipTypeId)

const createFleetCompletionChecker = (
  candidates: readonly RankedShipCandidate[],
  route: RouteTemplate,
): ((
  members: readonly FleetMember[],
  lastCandidateIndex: number,
  remainingSlots: number,
) => boolean) => {
  const constraints = route.fleetConstraints.filter(
    (constraint): constraint is CountedFleetConstraint => constraint.kind !== 'ship-count',
  )
  const minimums = constraints.map(constraintMinimum)
  const maximums = constraints.map(constraintMaximum)
  const contributions = candidates.map(({ ship }) =>
    constraints.map((constraint) => Number(shipMatchesFleetConstraint(ship, constraint))),
  )
  const suffixAvailability: number[][] = Array.from({ length: candidates.length + 1 }, () =>
    Array(constraints.length).fill(0),
  )
  for (let candidateIndex = candidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
    suffixAvailability[candidateIndex] = suffixAvailability[candidateIndex + 1].map(
      (count, constraintIndex) => count + contributions[candidateIndex][constraintIndex],
    )
  }
  const memo = new Map<string, boolean>()

  const normalizeCounts = (counts: readonly number[]): readonly number[] =>
    counts.map((count, index) => {
      const cap = Number.isFinite(maximums[index]) ? maximums[index] : minimums[index]
      return Math.min(count, cap)
    })

  const canComplete = (
    candidateIndex: number,
    remainingSlots: number,
    counts: readonly number[],
  ): boolean => {
    if (candidates.length - candidateIndex < remainingSlots) return false
    if (
      counts.some(
        (count, constraintIndex) =>
          count > maximums[constraintIndex] ||
          count + Math.min(remainingSlots, suffixAvailability[candidateIndex][constraintIndex]) <
            minimums[constraintIndex],
      )
    ) {
      return false
    }
    if (remainingSlots === 0) return true

    const normalizedCounts = normalizeCounts(counts)
    const memoKey = `${candidateIndex}:${remainingSlots}:${normalizedCounts.join(',')}`
    const cached = memo.get(memoKey)
    if (cached !== undefined) return cached

    const nextCounts = normalizedCounts.map(
      (count, constraintIndex) => count + contributions[candidateIndex][constraintIndex],
    )
    const canTake = nextCounts.every((count, constraintIndex) => count <= maximums[constraintIndex])
    const result =
      (canTake && canComplete(candidateIndex + 1, remainingSlots - 1, nextCounts)) ||
      canComplete(candidateIndex + 1, remainingSlots, normalizedCounts)
    memo.set(memoKey, result)
    return result
  }

  return (members, lastCandidateIndex, remainingSlots) => {
    const counts = constraints.map(
      (constraint) =>
        members.filter((member) => shipMatchesFleetConstraint(member.ship, constraint)).length,
    )
    return canComplete(lastCandidateIndex + 1, remainingSlots, counts)
  }
}

const arrangeRequiredFlagship = (
  members: readonly FleetMember[],
  route: RouteTemplate,
): readonly FleetMember[] => {
  if (!route.tags.includes('flagship-destroyer')) return members
  const flagship = members.find((member) => member.ship.shipTypeId === 2)
  if (!flagship || members[0]?.ship.id === flagship.ship.id) return members
  return [flagship, ...members.filter((member) => member.ship.id !== flagship.ship.id)]
}

const genericCandidatePool = (
  account: AccountSnapshot,
  route: RouteTemplate,
  objective: RecommendationObjective,
  preferredShipIds: ReadonlySet<ShipInstanceId>,
): {
  readonly candidates: readonly RankedShipCandidate[]
  readonly eligibleShipCount: number
  readonly requiredCandidateCount: number
} => {
  const fastRequired = route.tags.includes('fast')
  const fastPlusRequired = route.tags.includes('fast+')
  const ranked = account.ships
    .map((ship) => ({
      ship,
      role: roleForShip(ship, route),
      fastPlusProfile: fastPlusRequired ? fastPlusProfileForShip(ship, account) : null,
    }))
    .filter(
      ({ ship, role, fastPlusProfile }) =>
        (!fastRequired || ship.speed !== 'slow') &&
        (!fastPlusRequired || fastPlusProfile !== null) &&
        (role !== 'resource-carrier' || resourceGearKindsForShip(ship, account).size > 0),
    )
    .map(({ ship, role, fastPlusProfile }) => ({
      ship,
      role,
      score:
        candidateShipScore(ship, role, objective, account, fastPlusProfile, route) +
        (preferredShipIds.has(ship.id) ? CURRENT_FLEET_SHIP_PREFERENCE_BONUS : 0),
    }))
    .sort((left, right) => right.score - left.score || left.ship.id - right.ship.id)
  const byType = new Map<number, number>()
  const selected = ranked.filter(({ ship }) => {
    if (preferredShipIds.has(ship.id)) return true
    const count = byType.get(ship.shipTypeId) ?? 0
    const isNamedRequirement = route.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'specific-ship-name' &&
        shipMatchesNameConstraint(ship.name, constraint.names),
    )
    if (count >= FLEET_CANDIDATES_PER_ROLE && !isNamedRequirement) return false
    byType.set(ship.shipTypeId, count + 1)
    return true
  })
  const routeConstraintPriority = ({ ship }: RankedShipCandidate): number => {
    const matchesNamedRequirement = route.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'specific-ship-name' &&
        shipMatchesNameConstraint(ship.name, constraint.names),
    )
    if (matchesNamedRequirement) return 2
    const matchesRequiredShipType = route.fleetConstraints.some((constraint) => {
      if (constraint.kind !== 'ship-type-count') return false
      const minimum = constraint.exact ?? constraint.min ?? 0
      return minimum > 0 && constraint.shipTypeIds.includes(ship.shipTypeId)
    })
    return Number(matchesRequiredShipType)
  }
  const candidates = selected
    .map((candidate, index) => ({ candidate, index, priority: routeConstraintPriority(candidate) }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
    .slice(0, 180)
    .map(({ candidate }) => candidate)
    .sort((left, right) => right.score - left.score || left.ship.id - right.ship.id)
  return {
    candidates,
    eligibleShipCount: ranked.length,
    requiredCandidateCount: candidates.filter((candidate) => routeConstraintPriority(candidate) > 0)
      .length,
  }
}

export const generateFleetCandidates = (
  account: AccountSnapshot,
  route: RouteTemplate,
  objective: RecommendationObjective,
  preferredShipIds: readonly ShipInstanceId[] = [],
  preferredShipIdGroups: readonly (readonly ShipInstanceId[])[] = [],
): FleetSearchResult => {
  const candidatePool = genericCandidatePool(account, route, objective, new Set(preferredShipIds))
  const candidates = candidatePool.candidates
  const targetShipCount = fleetShipCount(route)
  const canCompleteFleet = createFleetCompletionChecker(candidates, route)
  let infeasiblePartialStateCount = 0
  let maxDepth = 0
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
      candidates.forEach((candidate, candidateIndex) => {
        const { ship, role, score } = candidate
        if (candidateIndex <= state.lastCandidateIndex) return
        if (state.usedShipIds.has(ship.id)) return
        const members = [...state.members, { ship, role }]
        if (violatesMaximumConstraints(members, route)) return
        const remainingSlots = targetShipCount - members.length
        if (!canCompleteFleet(members, candidateIndex, remainingSlots)) {
          infeasiblePartialStateCount += 1
          return
        }
        const usedShipIds = new Set(state.usedShipIds)
        usedShipIds.add(ship.id)
        nextStates.push({
          members,
          usedShipIds,
          score: state.score + score + requiredConstraintBonus(ship, state.members, route),
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
    if (states.length > 0) maxDepth = depth + 1
  }

  const constraintValidStates = states.filter((state) =>
    satisfiesFleetConstraints(state.members, route),
  )
  const candidatesByShipId = new Map(
    candidates.map((candidate, candidateIndex) => [
      candidate.ship.id,
      { candidate, candidateIndex },
    ]),
  )
  const preferredFleetStates = preferredShipIdGroups.flatMap((shipIds) => {
    if (shipIds.length !== targetShipCount) return []
    const selected = shipIds.map((shipId) => candidatesByShipId.get(shipId))
    if (
      !selected.every(
        (item): item is { candidate: RankedShipCandidate; candidateIndex: number } =>
          item !== undefined,
      )
    ) {
      return []
    }
    const members = selected.map(({ candidate }) => ({
      ship: candidate.ship,
      role: candidate.role,
    }))
    if (!satisfiesFleetConstraints(members, route)) return []
    return [
      {
        members,
        usedShipIds: new Set(shipIds),
        score: selected.reduce((total, { candidate }) => total + candidate.score, 0),
        lastCandidateIndex: Math.max(...selected.map(({ candidateIndex }) => candidateIndex)),
      },
    ]
  })
  let specialAttackRejectedCount = 0
  const fleetCandidates = [...preferredFleetStates, ...constraintValidStates].flatMap((state) => {
    const members = arrangeRequiredFlagship(state.members, route)
    if (!route.tags.includes('special-attack-modeled')) return [{ ...state, members }]
    const setup = arrangeSpecialAttack(members)
    if (!setup) specialAttackRejectedCount += 1
    return setup ? [{ ...state, members: setup.members }] : []
  })
  const uniqueFleetCandidates = fleetCandidates.filter((state, index, allStates) => {
    const signature = [...state.usedShipIds].sort((left, right) => left - right).join('-')
    return (
      allStates.findIndex(
        (candidate) =>
          [...candidate.usedShipIds].sort((left, right) => left - right).join('-') === signature,
      ) === index
    )
  })
  return {
    candidates: uniqueFleetCandidates,
    diagnostics: {
      eligibleShipCount: candidatePool.eligibleShipCount,
      candidatePoolCount: candidates.length,
      requiredCandidateCount: candidatePool.requiredCandidateCount,
      infeasiblePartialStateCount,
      maxDepth,
      completeStateCount: states.length,
      constraintValidStateCount: constraintValidStates.length,
      specialAttackRejectedCount,
    },
  }
}

export const analyzeFleetAvailability = (
  account: AccountSnapshot,
  route: RouteTemplate,
): readonly UnsatisfiedRequirement[] => {
  const reasons: UnsatisfiedRequirement[] = []
  const fastRequired = route.tags.includes('fast')
  route.fleetConstraints.forEach((constraint) => {
    if (constraint.kind === 'specific-ship-name') {
      const count = account.ships.filter((ship) =>
        shipMatchesNameConstraint(ship.name, constraint.names),
      ).length
      if (count < constraint.min) {
        reasons.push({
          code: 'MISSING_SPECIFIC_SHIP',
          message: `此路線需要 ${constraint.names.join('/')}，目前帳號缺少可用艦。`,
          values: { names: constraint.names.join('/') },
        })
      }
      if (fastRequired) {
        const fastCount = account.ships.filter(
          (ship) => ship.speed !== 'slow' && shipMatchesNameConstraint(ship.name, constraint.names),
        ).length
        if (count >= constraint.min && fastCount < constraint.min) {
          reasons.push({
            code: 'FLEET_SPEED_INSUFFICIENT',
            message: `此路線需要全高速，但符合 ${constraint.names.join('/')} 的高速艦只有 ${fastCount} 艘，需要 ${constraint.min} 艘。`,
            values: { count: fastCount, minimum: constraint.min },
          })
        }
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
        values: { count, minimum },
      })
      return
    }
    if (fastRequired) {
      const fastCount = account.ships.filter(
        (ship) => ship.speed !== 'slow' && constraint.shipTypeIds.includes(ship.shipTypeId),
      ).length
      if (fastCount < minimum) {
        reasons.push({
          code: 'FLEET_SPEED_INSUFFICIENT',
          message: `此路線需要全高速，但符合艦種條件的高速艦只有 ${fastCount} 艘，需要 ${minimum} 艘。`,
          values: { count: fastCount, minimum },
        })
      }
    }
  })
  return reasons
}
