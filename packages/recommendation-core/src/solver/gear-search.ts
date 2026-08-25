import type {
  AccountSnapshot,
  EquipmentInstanceId,
  OwnedEquipment,
  RecommendedShipBuild,
} from '../types'
import type { FleetMember, FleetSearchState } from './internal-types'
import { isDrumCanister, isNormalResourceLandingCraft } from '../resource'

const GEAR_BEAM_WIDTH = 120
const MIN_GEAR_CANDIDATES_PER_SLOT = 10

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

const gearSignature = (state: GearSearchState): string =>
  Array.from(state.assignments.values())
    .map((gear) => gear?.id ?? 0)
    .join('-')

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
  if (kind === 'landing-craft') {
    return isNormalResourceLandingCraft(gear) || isDrumCanister(gear)
  }
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
    'landing-craft': [],
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
      if (isNormalResourceLandingCraft(gear)) {
        return 80 + stats.firepower + stats.armor + improvement
      }
      if (isDrumCanister(gear)) return 45 + improvement
      return -20
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
  candidateLimit: number,
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
    .slice(0, candidateLimit)
}

export const buildGearSolutions = (
  fleet: FleetSearchState,
  account: AccountSnapshot,
  avoidCurrentFleetEquipment: boolean,
): readonly RecommendedShipBuild[][] => {
  const requirements = fleet.members.flatMap(requirementsForMember)
  const requirementCounts = new Map<GearRequirementKind, number>()
  requirements.forEach((requirement) => {
    requirementCounts.set(requirement.kind, (requirementCounts.get(requirement.kind) ?? 0) + 1)
  })
  const requirementsWithOptions = requirements
    .map((requirement) => ({
      requirement,
      options: optionsForRequirement(
        requirement,
        fleet.members,
        account,
        avoidCurrentFleetEquipment,
        Math.max(MIN_GEAR_CANDIDATES_PER_SLOT, (requirementCounts.get(requirement.kind) ?? 0) + 6),
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
