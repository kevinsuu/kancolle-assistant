import type {
  AccountSnapshot,
  FleetRole,
  OwnedShip,
  RecommendationObjective,
  RouteTemplate,
  ShipInstanceId,
  UnsatisfiedRequirement,
} from '../types'
import type { FleetMember, FleetSearchState } from './internal-types'
import { isDrumCanister, isNormalResourceLandingCraft } from '../resource'

const FLEET_BEAM_WIDTH = 400
const FLEET_CANDIDATES_PER_ROLE = 14
const SPEED_GEAR_MASTER_IDS = new Set([33, 34, 87])

interface FastPlusCandidateProfile {
  readonly regularSlotsUsed: number
}

interface RankedShipCandidate {
  readonly ship: OwnedShip
  readonly role: FleetRole
  readonly score: number
}

const fastPlusProfileCache = new WeakMap<
  AccountSnapshot,
  Map<number, FastPlusCandidateProfile | null>
>()

const shipSignature = (members: readonly FleetMember[]): string =>
  members.map((member) => member.ship.id).join('-')

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

  const speedBurden = fastPlusBurdenPenalty(ship, role, fastPlusProfile)
  if (objective === 'boss-clear') {
    return roleFit * 0.55 + offense * 0.3 + survival * 0.1 + level - speedBurden
  }
  if (objective === 'low-cost') {
    return (
      roleFit * 0.4 + survival * 0.25 + level - (ship.fuelCost + ship.ammoCost) * 0.65 - speedBurden
    )
  }
  if (objective === 'leveling') {
    return roleFit * 0.2 + survival * 0.1 + (180 - Math.min(ship.level, 180)) * 1.5 - speedBurden
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
      survival * 0.1 +
      transportFit +
      180 -
      (ship.fuelCost + ship.ammoCost) * 1.4 -
      speedBurden
    )
  }
  return roleFit * 0.45 + survival * 0.25 + offense * 0.15 + level - speedBurden
}

const roleForShip = (ship: OwnedShip, route: RouteTemplate): FleetRole => {
  if (
    route.tags.some((tag) => ['asw', 'oasw'].includes(tag)) &&
    [1, 2, 3, 7, 10, 21].includes(ship.shipTypeId)
  ) {
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
): readonly RankedShipCandidate[] => {
  const fastPlusRequired = route.tags.includes('fast+')
  const ranked = account.ships
    .map((ship) => ({
      ship,
      role: roleForShip(ship, route),
      fastPlusProfile: fastPlusRequired ? fastPlusProfileForShip(ship, account) : null,
    }))
    .filter(
      ({ ship, role, fastPlusProfile }) =>
        (!fastPlusRequired || fastPlusProfile !== null) &&
        (role !== 'resource-carrier' || resourceGearKindsForShip(ship, account).size > 0),
    )
    .map(({ ship, role, fastPlusProfile }) => ({
      ship,
      role,
      score: candidateShipScore(ship, role, objective, account, fastPlusProfile),
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
  return selected.slice(0, 180)
}

export const generateFleetCandidates = (
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
      candidates.forEach((candidate, candidateIndex) => {
        const { ship, role, score } = candidate
        if (candidateIndex <= state.lastCandidateIndex) return
        if (state.usedShipIds.has(ship.id)) return
        const members = [...state.members, { ship, role }]
        if (violatesMaximumConstraints(members, route)) return
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
  }

  return states.filter((state) => satisfiesFleetConstraints(state.members, route))
}

export const analyzeFleetAvailability = (
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
          values: { names: constraint.names.join('/') },
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
        values: { count, minimum },
      })
    }
  })
  return reasons
}
