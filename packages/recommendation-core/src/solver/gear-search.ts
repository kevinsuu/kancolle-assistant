import type {
  AccountSnapshot,
  EquipmentInstanceId,
  FastPlusPattern,
  NightCarrierPattern,
  OwnedEquipment,
  RecommendedShipBuild,
} from '../types'
import type { FleetMember, FleetSearchState } from './internal-types'
import { isDrumCanister, isNormalResourceLandingCraft } from '../resource'

const GEAR_BEAM_WIDTH = 120
const MIN_GEAR_CANDIDATES_PER_SLOT = 10
const SPEED_SELECTION_BEAM_WIDTH = 80

const IMPROVED_TURBINE_MASTER_ID = 33
const ENHANCED_BOILER_MASTER_ID = 34
const NEW_MODEL_BOILER_MASTER_ID = 87
const SPEED_GEAR_MASTER_IDS = new Set([
  IMPROVED_TURBINE_MASTER_ID,
  ENHANCED_BOILER_MASTER_ID,
  NEW_MODEL_BOILER_MASTER_ID,
])
const NIGHT_AIRCRAFT_ICON_TYPE_IDS = new Set([45, 46, 58])
const NIGHT_OPERATIONS_PERSONNEL_MASTER_IDS = new Set([258, 259])
const SWORDFISH_MASTER_IDS = new Set([242, 243, 244])
const TORPEDO_CRUISER_UNFIT_GUN_MASTER_IDS = new Set([356, 357])
const ANTI_INSTALLATION_SHELL_MASTER_IDS = new Set([35, 317, 483])
const ANTI_INSTALLATION_SHELL_SHIP_TYPE_IDS = new Set([5, 6, 8, 9, 10, 12])

type GearRequirementKind =
  | 'big-gun'
  | 'main-gun'
  | 'recon'
  | 'ap-shell'
  | 'anti-installation-shell'
  | 'fighter'
  | 'attack-aircraft'
  | 'radar'
  | 'torpedo'
  | 'small-gun'
  | 'sonar'
  | 'depth-charge'
  | 'midget-submarine'
  | 'landing-craft'
  | 'seaplane'
  | 'expansion'
  | 'general'

interface GearRequirement {
  readonly key: string
  readonly shipIndex: number
  readonly slotIndex: number | 'expansion'
  readonly slotSize: number
  readonly kind: GearRequirementKind
}

interface GearOption {
  readonly gear: OwnedEquipment
  readonly score: number
}

interface GearSearchState {
  readonly assignments: ReadonlyMap<string, OwnedEquipment | null>
  readonly expansionAssignments: ReadonlyMap<number, OwnedEquipment>
  readonly usedEquipmentIds: ReadonlySet<EquipmentInstanceId>
  readonly score: number
  readonly signature: string
}

export interface GearSearchContext {
  readonly availableEquipment: readonly OwnedEquipment[]
  readonly regularMasterIdsByShip: ReadonlyMap<number, ReadonlySet<number>>
  readonly expansionEquipmentIdsByShip: ReadonlyMap<number, ReadonlySet<number>>
  readonly equipmentByRequirementKind: Map<GearRequirementKind, readonly OwnedEquipment[]>
  readonly optionCache: Map<string, readonly GearOption[]>
  readonly specialCandidateCache: Map<string, readonly OwnedEquipment[]>
  readonly solutionCache: Map<string, readonly RecommendedShipBuild[][]>
}

const compareSignatures = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const rankStates = (
  states: readonly GearSearchState[],
  limit: number,
): readonly GearSearchState[] => {
  const seen = new Set<string>()
  return [...states]
    .sort(
      (left, right) =>
        right.score - left.score || compareSignatures(left.signature, right.signature),
    )
    .filter((state) => {
      if (seen.has(state.signature)) return false
      seen.add(state.signature)
      return true
    })
    .slice(0, limit)
}

const requirementsForMember = (
  member: FleetMember,
  shipIndex: number,
  assignAirSeaplanes: boolean,
  assignAntiInstallationShell: boolean,
): readonly GearRequirement[] => {
  const slotCount = member.ship.slotSizes.length
  const requirementKinds: GearRequirementKind[] = []

  if (member.role === 'main-battleship') {
    if (assignAirSeaplanes) {
      requirementKinds.push('big-gun', 'big-gun', 'seaplane')
      while (requirementKinds.length < slotCount - 1) requirementKinds.push('seaplane')
      if (requirementKinds.length < slotCount) requirementKinds.push('ap-shell')
    } else {
      requirementKinds.push('big-gun', 'big-gun', 'recon', 'ap-shell')
      while (requirementKinds.length < slotCount) requirementKinds.push('radar')
    }
  } else if (member.role === 'utility-cruiser') {
    requirementKinds.push('main-gun', 'main-gun')
    if (assignAirSeaplanes) {
      while (requirementKinds.length < slotCount) requirementKinds.push('seaplane')
    } else {
      requirementKinds.push('recon', 'radar')
      while (requirementKinds.length < slotCount) requirementKinds.push('torpedo')
    }
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
  } else if (member.role === 'torpedo-cruiser') {
    requirementKinds.push('midget-submarine', 'torpedo', 'torpedo')
    while (requirementKinds.length < slotCount) requirementKinds.push('radar')
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

  if (assignAntiInstallationShell && slotCount > 0) {
    requirementKinds[Math.min(slotCount, requirementKinds.length) - 1] = 'anti-installation-shell'
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
  if (kind === 'anti-installation-shell') {
    return ANTI_INSTALLATION_SHELL_MASTER_IDS.has(gear.masterId)
  }
  if (SPEED_GEAR_MASTER_IDS.has(gear.masterId)) return false
  const acceptedTypes: Readonly<Record<GearRequirementKind, readonly number[]>> = {
    'big-gun': [3],
    'main-gun': [2, 3],
    recon: [9, 10],
    'ap-shell': [18],
    'anti-installation-shell': [],
    fighter: [6],
    'attack-aircraft': [7, 8],
    radar: [12, 13, 93],
    torpedo: [5],
    'small-gun': [1],
    sonar: [14, 40],
    'depth-charge': [15],
    'midget-submarine': [22],
    'landing-craft': [],
    seaplane: [10, 11],
    expansion: [],
    general: [],
  }
  return kind === 'general' || acceptedTypes[kind].includes(gear.typeId)
}

export const createGearSearchContext = (
  account: AccountSnapshot,
  avoidCurrentFleetEquipment: boolean,
): GearSearchContext => {
  const currentFleetIds = new Set(account.currentFleetShipIds)
  return {
    availableEquipment: account.equipment.filter(
      (gear) =>
        !avoidCurrentFleetEquipment ||
        !gear.currentlyEquippedBy ||
        !currentFleetIds.has(gear.currentlyEquippedBy),
    ),
    regularMasterIdsByShip: new Map(
      account.ships.map((ship) => [ship.id, new Set(ship.regularEquipableMasterIds)]),
    ),
    expansionEquipmentIdsByShip: new Map(
      account.ships.map((ship) => [ship.id, new Set(ship.expansionEquipableEquipmentIds)]),
    ),
    equipmentByRequirementKind: new Map<GearRequirementKind, readonly OwnedEquipment[]>(),
    optionCache: new Map<string, readonly GearOption[]>(),
    specialCandidateCache: new Map<string, readonly OwnedEquipment[]>(),
    solutionCache: new Map<string, readonly RecommendedShipBuild[][]>(),
  }
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
    case 'anti-installation-shell':
      return stats.firepower * 4 + stats.accuracy * 2 + stats.armor + improvement * 2
    case 'big-gun':
    case 'main-gun':
      return stats.firepower * 5 + stats.accuracy * 2 + stats.antiAir + improvement * 2
    case 'small-gun':
      return stats.firepower * 4 + stats.accuracy * 2 + stats.antiAir + improvement * 2
    case 'sonar':
    case 'depth-charge':
      return stats.asw * 6 + stats.accuracy + improvement
    case 'midget-submarine':
      return stats.torpedo * 5 + stats.accuracy * 2 + improvement
    case 'landing-craft':
      if (isNormalResourceLandingCraft(gear)) {
        return 80 + stats.firepower + stats.armor + improvement
      }
      if (isDrumCanister(gear)) return 45 + improvement
      return -20
    case 'seaplane':
      return (
        (gear.airPowerBySlotSize[String(requirement.slotSize)] ?? 0) * 4 +
        stats.los * 4 +
        stats.bombing * 3 +
        stats.antiAir * 2
      )
    case 'expansion':
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

type SpeedGearCategory =
  | 'turbine'
  | 'enhanced-boiler'
  | 'new-model-boiler-below-7'
  | 'new-model-boiler-at-least-7'

interface SpeedSelectionState {
  readonly gears: readonly OwnedEquipment[]
  readonly usedEquipmentIds: ReadonlySet<EquipmentInstanceId>
  readonly score: number
  readonly lastCandidateIndex: number
  readonly signature: string
}

const speedCategoriesForPattern = (pattern: FastPlusPattern): readonly SpeedGearCategory[] => [
  ...Array.from({ length: pattern.turbineCount }, () => 'turbine' as const),
  ...Array.from({ length: pattern.enhancedBoilerCount }, () => 'enhanced-boiler' as const),
  ...Array.from(
    { length: pattern.newModelBoilerBelow7Count },
    () => 'new-model-boiler-below-7' as const,
  ),
  ...Array.from(
    { length: pattern.newModelBoilerAtLeast7Count },
    () => 'new-model-boiler-at-least-7' as const,
  ),
]

const matchesSpeedCategory = (gear: OwnedEquipment, category: SpeedGearCategory): boolean => {
  if (category === 'turbine') return gear.masterId === IMPROVED_TURBINE_MASTER_ID
  if (category === 'enhanced-boiler') return gear.masterId === ENHANCED_BOILER_MASTER_ID
  if (gear.masterId !== NEW_MODEL_BOILER_MASTER_ID) return false
  return category === 'new-model-boiler-at-least-7' ? gear.improvement >= 7 : gear.improvement < 7
}

const speedGearScore = (gear: OwnedEquipment, member: FleetMember): number => {
  if (gear.currentlyEquippedBy === member.ship.id) return 20
  if (gear.currentlyEquippedBy === null) return 10 - gear.improvement * 0.1
  return -10 - gear.improvement * 0.1
}

const specialCandidatesForMember = (
  context: GearSearchContext,
  member: FleetMember,
  category: string,
  matchesCategory: (gear: OwnedEquipment) => boolean,
): readonly OwnedEquipment[] => {
  const cacheKey = `${member.ship.id}:${category}`
  const cached = context.specialCandidateCache.get(cacheKey)
  if (cached) return cached
  const regularMasterIds = context.regularMasterIdsByShip.get(member.ship.id) ?? new Set<number>()
  const expansionEquipmentIds =
    context.expansionEquipmentIdsByShip.get(member.ship.id) ?? new Set<number>()
  const candidates = context.availableEquipment
    .filter(matchesCategory)
    .filter((gear) => regularMasterIds.has(gear.masterId) || expansionEquipmentIds.has(gear.id))
    .sort(
      (left, right) =>
        speedGearScore(right, member) - speedGearScore(left, member) || left.id - right.id,
    )
  context.specialCandidateCache.set(cacheKey, candidates)
  return candidates
}

const speedSelectionsForPattern = (
  pattern: FastPlusPattern,
  member: FleetMember,
  context: GearSearchContext,
  state: GearSearchState,
): readonly SpeedSelectionState[] => {
  const categories = speedCategoriesForPattern(pattern)
  let selections: readonly SpeedSelectionState[] = [
    {
      gears: [],
      usedEquipmentIds: state.usedEquipmentIds,
      score: state.score,
      lastCandidateIndex: -1,
      signature: '',
    },
  ]

  categories.forEach((category, categoryIndex) => {
    const nextSelections: SpeedSelectionState[] = []
    selections.forEach((selection) => {
      specialCandidatesForMember(context, member, `speed:${category}`, (gear) =>
        matchesSpeedCategory(gear, category),
      ).forEach((gear, candidateIndex) => {
        if (selection.usedEquipmentIds.has(gear.id)) return
        if (
          categories[categoryIndex - 1] === category &&
          candidateIndex <= selection.lastCandidateIndex
        ) {
          return
        }
        const usedEquipmentIds = new Set(selection.usedEquipmentIds)
        usedEquipmentIds.add(gear.id)
        nextSelections.push({
          gears: [...selection.gears, gear],
          usedEquipmentIds,
          score: selection.score + speedGearScore(gear, member),
          lastCandidateIndex: candidateIndex,
          signature: `${selection.signature}-${gear.id}`,
        })
      })
    })
    selections = nextSelections
      .sort(
        (left, right) =>
          right.score - left.score || compareSignatures(left.signature, right.signature),
      )
      .slice(0, SPEED_SELECTION_BEAM_WIDTH)
  })
  return selections
}

const reserveSpeedSelection = (
  selection: SpeedSelectionState,
  state: GearSearchState,
  member: FleetMember,
  shipIndex: number,
): GearSearchState | null => {
  const ship = member.ship
  const expansionCandidates = ship.expansionSlotUnlocked
    ? selection.gears
        .filter((gear) => ship.expansionEquipableEquipmentIds.includes(gear.id))
        .sort(
          (left, right) =>
            Number(right.masterId === IMPROVED_TURBINE_MASTER_ID) -
              Number(left.masterId === IMPROVED_TURBINE_MASTER_ID) || left.id - right.id,
        )
    : []
  const expansionChoices: readonly (OwnedEquipment | null)[] =
    selection.gears.length > ship.slotSizes.length
      ? expansionCandidates
      : [...expansionCandidates, null]

  for (const expansionGear of expansionChoices) {
    const regularGears = selection.gears.filter((gear) => gear !== expansionGear)
    if (regularGears.length > ship.slotSizes.length) continue
    if (!regularGears.every((gear) => ship.regularEquipableMasterIds.includes(gear.masterId))) {
      continue
    }
    const regularSlotIndexes = ship.slotSizes
      .map((slotSize, slotIndex) => ({ slotSize, slotIndex }))
      .sort((left, right) => left.slotSize - right.slotSize || right.slotIndex - left.slotIndex)
      .slice(0, regularGears.length)
      .map(({ slotIndex }) => slotIndex)
    const assignments = new Map(state.assignments)
    regularSlotIndexes.forEach((slotIndex, index) => {
      assignments.set(`${shipIndex}:${slotIndex}`, regularGears[index])
    })
    const expansionAssignments = new Map(state.expansionAssignments)
    if (expansionGear) expansionAssignments.set(shipIndex, expansionGear)
    return {
      assignments,
      expansionAssignments,
      usedEquipmentIds: selection.usedEquipmentIds,
      score: selection.score - regularGears.length * 12,
      signature: `${state.signature}|s${shipIndex}:${selection.signature}:x${expansionGear?.id ?? 0}`,
    }
  }
  return null
}

const buildFastPlusReservationStates = (
  fleet: FleetSearchState,
  context: GearSearchContext,
): readonly GearSearchState[] => {
  let states: readonly GearSearchState[] = [
    {
      assignments: new Map<string, OwnedEquipment | null>(),
      expansionAssignments: new Map<number, OwnedEquipment>(),
      usedEquipmentIds: new Set<EquipmentInstanceId>(),
      score: 0,
      signature: '',
    },
  ]

  fleet.members.forEach((member, shipIndex) => {
    const nextStates: GearSearchState[] = []
    states.forEach((state) => {
      member.ship.fastPlusPatterns.forEach((pattern) => {
        speedSelectionsForPattern(pattern, member, context, state).forEach((selection) => {
          const reserved = reserveSpeedSelection(selection, state, member, shipIndex)
          if (reserved) nextStates.push(reserved)
        })
      })
    })
    states = rankStates(nextStates, GEAR_BEAM_WIDTH)
  })
  return states
}

type NightCarrierGearCategory = 'night-aircraft' | 'night-operations-personnel' | 'swordfish'

const nightCarrierCategoriesForPattern = (
  pattern: NightCarrierPattern,
): readonly NightCarrierGearCategory[] => [
  ...Array.from({ length: pattern.nightAircraftCount }, () => 'night-aircraft' as const),
  ...Array.from(
    { length: pattern.nightOperationsPersonnelCount },
    () => 'night-operations-personnel' as const,
  ),
  ...Array.from({ length: pattern.swordfishCount }, () => 'swordfish' as const),
]

const matchesNightCarrierCategory = (
  gear: OwnedEquipment,
  category: NightCarrierGearCategory,
): boolean => {
  if (category === 'night-aircraft') return NIGHT_AIRCRAFT_ICON_TYPE_IDS.has(gear.iconTypeId)
  if (category === 'night-operations-personnel') {
    return NIGHT_OPERATIONS_PERSONNEL_MASTER_IDS.has(gear.masterId)
  }
  return SWORDFISH_MASTER_IDS.has(gear.masterId)
}

const nightCarrierSelectionsForPattern = (
  pattern: NightCarrierPattern,
  member: FleetMember,
  context: GearSearchContext,
  state: GearSearchState,
): readonly SpeedSelectionState[] => {
  const categories = nightCarrierCategoriesForPattern(pattern)
  let selections: readonly SpeedSelectionState[] = [
    {
      gears: [],
      usedEquipmentIds: state.usedEquipmentIds,
      score: state.score,
      lastCandidateIndex: -1,
      signature: '',
    },
  ]
  categories.forEach((category, categoryIndex) => {
    const nextSelections: SpeedSelectionState[] = []
    selections.forEach((selection) => {
      specialCandidatesForMember(context, member, `night:${category}`, (gear) =>
        matchesNightCarrierCategory(gear, category),
      ).forEach((gear, candidateIndex) => {
        if (selection.usedEquipmentIds.has(gear.id)) return
        if (
          categories[categoryIndex - 1] === category &&
          candidateIndex <= selection.lastCandidateIndex
        ) {
          return
        }
        const usedEquipmentIds = new Set(selection.usedEquipmentIds)
        usedEquipmentIds.add(gear.id)
        nextSelections.push({
          gears: [...selection.gears, gear],
          usedEquipmentIds,
          score: selection.score + speedGearScore(gear, member),
          lastCandidateIndex: candidateIndex,
          signature: `${selection.signature}-${gear.id}`,
        })
      })
    })
    selections = nextSelections
      .sort(
        (left, right) =>
          right.score - left.score || compareSignatures(left.signature, right.signature),
      )
      .slice(0, SPEED_SELECTION_BEAM_WIDTH)
  })
  return selections
}

const isNightCarrierAircraft = (gear: OwnedEquipment): boolean =>
  NIGHT_AIRCRAFT_ICON_TYPE_IDS.has(gear.iconTypeId) || SWORDFISH_MASTER_IDS.has(gear.masterId)

const reserveNightCarrierSelection = (
  selection: SpeedSelectionState,
  state: GearSearchState,
  member: FleetMember,
  shipIndex: number,
): GearSearchState | null => {
  const assignments = new Map(state.assignments)
  const expansionAssignments = new Map(state.expansionAssignments)
  let regularAssignmentCount = 0
  for (const gear of selection.gears) {
    const aircraft = isNightCarrierAircraft(gear)
    const expansionAvailable =
      !aircraft &&
      member.ship.expansionSlotUnlocked &&
      !expansionAssignments.has(shipIndex) &&
      member.ship.expansionEquipableEquipmentIds.includes(gear.id)
    if (expansionAvailable) {
      expansionAssignments.set(shipIndex, gear)
      continue
    }
    if (!member.ship.regularEquipableMasterIds.includes(gear.masterId)) return null
    const availableSlots = member.ship.slotSizes
      .map((slotSize, slotIndex) => ({ slotSize, slotIndex }))
      .filter(({ slotSize, slotIndex }) => {
        if (assignments.has(`${shipIndex}:${slotIndex}`)) return false
        return !aircraft || slotSize > 0
      })
      .sort((left, right) =>
        aircraft
          ? right.slotSize - left.slotSize || left.slotIndex - right.slotIndex
          : left.slotSize - right.slotSize || right.slotIndex - left.slotIndex,
      )
    const slot = availableSlots[0]
    if (!slot) return null
    assignments.set(`${shipIndex}:${slot.slotIndex}`, gear)
    regularAssignmentCount += 1
  }
  return {
    assignments,
    expansionAssignments,
    usedEquipmentIds: selection.usedEquipmentIds,
    score: selection.score - regularAssignmentCount * 8,
    signature: `${state.signature}|n${shipIndex}:${selection.signature}`,
  }
}

const buildNightCarrierReservationStates = (
  fleet: FleetSearchState,
  context: GearSearchContext,
  initialStates: readonly GearSearchState[],
): readonly GearSearchState[] => {
  const states: GearSearchState[] = []
  fleet.members.forEach((member, shipIndex) => {
    member.ship.nightCarrierPatterns.forEach((pattern) => {
      initialStates.forEach((state) => {
        nightCarrierSelectionsForPattern(pattern, member, context, state).forEach((selection) => {
          const reserved = reserveNightCarrierSelection(selection, state, member, shipIndex)
          if (reserved) states.push(reserved)
        })
      })
    })
  })
  return rankStates(states, GEAR_BEAM_WIDTH)
}

const optionsForRequirement = (
  requirement: GearRequirement,
  members: readonly FleetMember[],
  context: GearSearchContext,
  candidateLimit: number,
): readonly GearOption[] => {
  const member = members[requirement.shipIndex]
  const ship = member.ship
  const cacheKey = `${ship.id}:${member.role}:${requirement.kind}:${requirement.slotSize}`
  const cached = context.optionCache.get(cacheKey)
  if (cached) return cached.slice(0, candidateLimit)
  const regularMasterIds = context.regularMasterIdsByShip.get(ship.id) ?? new Set<number>()
  const expansionEquipmentIds =
    context.expansionEquipmentIdsByShip.get(ship.id) ?? new Set<number>()
  let matchingEquipment: readonly OwnedEquipment[]
  if (requirement.kind === 'expansion') {
    matchingEquipment = context.availableEquipment.filter((gear) =>
      expansionEquipmentIds.has(gear.id),
    )
  } else {
    matchingEquipment = context.equipmentByRequirementKind.get(requirement.kind) ?? []
    if (matchingEquipment.length === 0) {
      matchingEquipment = context.availableEquipment.filter((gear) =>
        gearMatchesRequirement(gear, requirement.kind),
      )
      context.equipmentByRequirementKind.set(requirement.kind, matchingEquipment)
    }
  }
  const options = matchingEquipment
    .filter((gear) => requirement.kind === 'expansion' || regularMasterIds.has(gear.masterId))
    .filter(
      (gear) =>
        member.role !== 'torpedo-cruiser' ||
        requirement.kind !== 'main-gun' ||
        !TORPEDO_CRUISER_UNFIT_GUN_MASTER_IDS.has(gear.masterId),
    )
    .map((gear) => ({ gear, score: gearScore(gear, requirement) }))
    .sort((left, right) => right.score - left.score || left.gear.id - right.gear.id)
  context.optionCache.set(cacheKey, options)
  return options.slice(0, candidateLimit)
}

export const buildGearSolutions = (
  fleet: FleetSearchState,
  context: GearSearchContext,
  airPowerRequired = false,
  fastPlusRequired = false,
  antiInstallationShellCount = 0,
  nightCarrierRequired = false,
): readonly RecommendedShipBuild[][] => {
  const solutionCacheKey = `${fleet.members
    .map((member) => `${member.ship.id}:${member.role}`)
    .join('-')}:${Number(airPowerRequired)}:${Number(fastPlusRequired)}:${Number(
    antiInstallationShellCount,
  )}:${Number(nightCarrierRequired)}`
  const cachedSolution = context.solutionCache.get(solutionCacheKey)
  if (cachedSolution) return cachedSolution
  const availableAntiInstallationShellMasterIds = new Set(
    context.availableEquipment
      .filter((gear) => ANTI_INSTALLATION_SHELL_MASTER_IDS.has(gear.masterId))
      .map((gear) => gear.masterId),
  )
  const antiInstallationMemberIndexes = new Set(
    fleet.members
      .map((member, shipIndex) => ({ member, shipIndex }))
      .filter(({ member }) => ANTI_INSTALLATION_SHELL_SHIP_TYPE_IDS.has(member.ship.shipTypeId))
      .filter(({ member }) =>
        member.ship.regularEquipableMasterIds.some((masterId) =>
          availableAntiInstallationShellMasterIds.has(masterId),
        ),
      )
      .slice(0, antiInstallationShellCount)
      .map(({ shipIndex }) => shipIndex),
  )
  if (antiInstallationMemberIndexes.size < antiInstallationShellCount) {
    context.solutionCache.set(solutionCacheKey, [])
    return []
  }
  const regularRequirements = fleet.members.flatMap((member, shipIndex) => {
    const assignAirSeaplanes =
      airPowerRequired &&
      context.availableEquipment.some(
        (gear) =>
          [10, 11].includes(gear.typeId) &&
          context.regularMasterIdsByShip.get(member.ship.id)?.has(gear.masterId) &&
          Object.values(gear.airPowerBySlotSize).some((power) => power > 0),
      )
    return requirementsForMember(
      member,
      shipIndex,
      assignAirSeaplanes,
      antiInstallationMemberIndexes.has(shipIndex),
    )
  })
  const expansionRequirements: readonly GearRequirement[] = fleet.members.flatMap(
    (member, shipIndex) =>
      member.ship.expansionSlotUnlocked
        ? [
            {
              key: `${shipIndex}:expansion`,
              shipIndex,
              slotIndex: 'expansion' as const,
              slotSize: 0,
              kind: 'expansion' as const,
            },
          ]
        : [],
  )
  const requirements = [...regularRequirements, ...expansionRequirements]
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
        context,
        Math.max(MIN_GEAR_CANDIDATES_PER_SLOT, (requirementCounts.get(requirement.kind) ?? 0) + 6),
      ),
    }))
    .sort(
      (left, right) =>
        left.options.length - right.options.length ||
        left.requirement.key.localeCompare(right.requirement.key),
    )

  let states: readonly GearSearchState[] = fastPlusRequired
    ? buildFastPlusReservationStates(fleet, context)
    : [
        {
          assignments: new Map<string, OwnedEquipment | null>(),
          expansionAssignments: new Map<number, OwnedEquipment>(),
          usedEquipmentIds: new Set<EquipmentInstanceId>(),
          score: 0,
          signature: '',
        },
      ]
  if (nightCarrierRequired) {
    states = buildNightCarrierReservationStates(fleet, context, states)
  }

  requirementsWithOptions.forEach(({ requirement, options }) => {
    const nextStates: GearSearchState[] = []
    states.forEach((state) => {
      const expansionAlreadyAssigned =
        requirement.kind === 'expansion' && state.expansionAssignments.has(requirement.shipIndex)
      if (state.assignments.has(requirement.key) || expansionAlreadyAssigned) {
        nextStates.push(state)
        return
      }
      const availableOptions = options.filter(({ gear }) => !state.usedEquipmentIds.has(gear.id))
      const candidates: readonly (GearOption | null)[] =
        requirement.kind === 'midget-submarine' ? availableOptions : [...availableOptions, null]
      candidates.forEach((option) => {
        const assignments = new Map(state.assignments)
        const expansionAssignments = new Map(state.expansionAssignments)
        if (requirement.kind === 'expansion') {
          if (option) expansionAssignments.set(requirement.shipIndex, option.gear)
        } else {
          assignments.set(requirement.key, option?.gear ?? null)
        }
        const usedEquipmentIds = new Set(state.usedEquipmentIds)
        if (option) usedEquipmentIds.add(option.gear.id)
        nextStates.push({
          assignments,
          expansionAssignments,
          usedEquipmentIds,
          score: state.score + (option?.score ?? -80),
          signature: `${state.signature}|${requirement.key}:${option?.gear.id ?? 0}`,
        })
      })
    })
    states = rankStates(nextStates, GEAR_BEAM_WIDTH)
  })

  const requiredEquipmentRequirements = requirements.filter(
    (requirement) =>
      requirement.kind === 'midget-submarine' || requirement.kind === 'anti-installation-shell',
  )
  const solutions = states
    .filter((state) =>
      requiredEquipmentRequirements.every((requirement) => {
        const gear = state.assignments.get(requirement.key)
        if (!gear) return false
        return requirement.kind === 'midget-submarine'
          ? gear.typeId === 22
          : ANTI_INSTALLATION_SHELL_MASTER_IDS.has(gear.masterId)
      }),
    )
    .slice(0, 6)
    .map((state) =>
      fleet.members.map((member, shipIndex) => ({
        ship: member.ship,
        role: member.role,
        equipment: member.ship.slotSizes.map(
          (_, slotIndex) => state.assignments.get(`${shipIndex}:${slotIndex}`) ?? null,
        ),
        expansionSlot: state.expansionAssignments.get(shipIndex) ?? null,
      })),
    )
  context.solutionCache.set(solutionCacheKey, solutions)
  return solutions
}
