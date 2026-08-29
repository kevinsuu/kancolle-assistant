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
const ANTI_INSTALLATION_SHELL_SHIP_TYPE_IDS = new Set([5, 6, 8, 9, 10, 12])
const SEAPLANE_TYPE_IDS = new Set([10, 11, 45])
const RADAR_TYPE_IDS = new Set([12, 13, 51, 93])
const ANTI_AIR_AIRCRAFT_TYPE_IDS = new Set([6, 7, 8, 11, 45, 56, 57, 58, 91])
const ATTACK_AIRCRAFT_TYPE_IDS = new Set([7, 8, 11, 41, 57, 58, 91])
const CARRIER_AIRCRAFT_TYPE_IDS = new Set([6, 7, 8, 9, 56, 57, 58, 59, 91])
const CARRIER_LAND_ATTACK_NEUTRAL_AIRCRAFT_TYPE_IDS = new Set([8, 57, 58, 91])

const isAntiInstallationShell = (gear: OwnedEquipment): boolean => gear.typeId === 18
const isSurfaceAntiInstallationGear = (gear: OwnedEquipment): boolean =>
  isAntiInstallationShell(gear) || [24, 46].includes(gear.typeId)
const isCarrierInstallationAttackAircraft = (gear: OwnedEquipment): boolean =>
  gear.antiInstallationAircraft || CARRIER_LAND_ATTACK_NEUTRAL_AIRCRAFT_TYPE_IDS.has(gear.typeId)
const isCarrierLandAttackBlockingAircraft = (gear: OwnedEquipment): boolean =>
  gear.typeId === 7 && !gear.antiInstallationAircraft
const isMayaClassAntiAirCandidate = (name: string): boolean =>
  /摩耶|Maya/i.test(name.normalize('NFKC'))

type GearRequirementKind =
  | 'big-gun'
  | 'main-gun'
  | 'recon'
  | 'ap-shell'
  | 'anti-installation-shell'
  | 'anti-installation-surface'
  | 'anti-installation-aircraft'
  | 'anti-installation-safe-aircraft'
  | 'carrier-aircraft'
  | 'anti-air-gun'
  | 'fighter'
  | 'attack-aircraft'
  | 'radar'
  | 'torpedo'
  | 'small-gun'
  | 'sonar'
  | 'depth-charge'
  | 'midget-submarine'
  | 'submarine-los'
  | 'drum-canister'
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
  readonly losPriority: boolean
  readonly airPowerPriority: boolean
  readonly airControlPriority: boolean
  readonly landAttackSafeCarrier: boolean
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
  readonly avoidCurrentFleetEquipment: boolean
  readonly currentFleetShipIds: ReadonlySet<number>
  readonly regularMasterIdsByShip: ReadonlyMap<number, ReadonlySet<number>>
  readonly expansionEquipmentIdsByShip: ReadonlyMap<number, ReadonlySet<number>>
  readonly equipmentByRequirementKind: Map<GearRequirementKind, readonly OwnedEquipment[]>
  readonly optionCache: Map<string, readonly GearOption[]>
  readonly specialCandidateCache: Map<string, readonly OwnedEquipment[]>
  readonly solutionCache: Map<string, readonly RecommendedShipBuild[][]>
}

const compareSignatures = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const isMandatoryRequirementKind = (kind: GearRequirementKind): boolean =>
  [
    'midget-submarine',
    'drum-canister',
    'anti-installation-shell',
    'anti-installation-surface',
    'anti-installation-aircraft',
    'anti-installation-safe-aircraft',
  ].includes(kind)

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
  assignAntiInstallationSurface: boolean,
  assignAntiInstallationAircraft: boolean,
  flexibleCarrierAirPriority: boolean,
  assignDrumCanister: boolean,
  bbvSeaplaneLosPriority: boolean,
  bbvSeaplaneAirPriority: boolean,
  surfaceSeaplaneAirPriority: boolean,
  fastPlusRequired: boolean,
  losPriority: boolean,
  submarineSeaplaneAirControl: boolean,
  submarineLosPriority: boolean,
  mayaAaciPreferred: boolean,
): readonly GearRequirement[] => {
  const slotCount = member.ship.slotSizes.length
  const requirementKinds: GearRequirementKind[] = []

  if (
    surfaceSeaplaneAirPriority &&
    assignAirSeaplanes &&
    slotCount > 0 &&
    [3, 6, 10, 16, 22].includes(member.ship.shipTypeId)
  ) {
    const prioritizedKinds: GearRequirementKind[] = Array.from(
      { length: slotCount },
      () => 'general',
    )
    const orderedSlots = member.ship.slotSizes
      .map((slotSize, slotIndex) => ({ slotSize, slotIndex }))
      .sort((left, right) => left.slotSize - right.slotSize || left.slotIndex - right.slotIndex)
    const antiInstallationKind: GearRequirementKind | null = assignAntiInstallationSurface
      ? 'anti-installation-surface'
      : assignAntiInstallationShell
        ? 'anti-installation-shell'
        : null
    const protectedSlotIndex = antiInstallationKind ? orderedSlots[0]?.slotIndex : undefined
    if (antiInstallationKind && protectedSlotIndex !== undefined) {
      prioritizedKinds[protectedSlotIndex] = antiInstallationKind
    }
    const speedReserveSlotIndex = fastPlusRequired
      ? orderedSlots.find(({ slotIndex }) => slotIndex !== protectedSlotIndex)?.slotIndex
      : undefined
    orderedSlots
      .filter(
        ({ slotIndex }) => slotIndex !== protectedSlotIndex && slotIndex !== speedReserveSlotIndex,
      )
      .sort((left, right) => right.slotSize - left.slotSize || left.slotIndex - right.slotIndex)
      .forEach(({ slotIndex }) => {
        prioritizedKinds[slotIndex] = 'seaplane'
      })
    return member.ship.slotSizes.map((slotSize, slotIndex) => ({
      key: `${shipIndex}:${slotIndex}`,
      shipIndex,
      slotIndex,
      slotSize,
      kind: prioritizedKinds[slotIndex] ?? 'general',
      losPriority:
        losPriority && ['seaplane', 'recon', 'radar'].includes(prioritizedKinds[slotIndex]),
      airPowerPriority: true,
      airControlPriority: false,
      landAttackSafeCarrier: false,
    }))
  }

  if (member.role === 'main-battleship') {
    if (assignAirSeaplanes && member.ship.shipTypeId === 10) {
      requirementKinds.push('big-gun', 'big-gun', 'seaplane')
      if (bbvSeaplaneLosPriority) {
        while (requirementKinds.length < slotCount) requirementKinds.push('seaplane')
      } else {
        while (requirementKinds.length < slotCount - 1) requirementKinds.push('seaplane')
        if (requirementKinds.length < slotCount) requirementKinds.push('ap-shell')
      }
    } else {
      requirementKinds.push('big-gun', 'big-gun', 'recon', 'ap-shell')
      while (requirementKinds.length < slotCount) requirementKinds.push('radar')
    }
  } else if (member.role === 'utility-cruiser') {
    if (mayaAaciPreferred && isMayaClassAntiAirCandidate(member.ship.name)) {
      requirementKinds.push('main-gun', 'anti-air-gun')
    } else {
      requirementKinds.push('main-gun', 'main-gun')
    }
    if (assignAirSeaplanes && [6, 16].includes(member.ship.shipTypeId)) {
      while (requirementKinds.length < slotCount) requirementKinds.push('seaplane')
    } else {
      requirementKinds.push('recon', 'radar')
      while (requirementKinds.length < slotCount) requirementKinds.push('torpedo')
    }
  } else if (member.role === 'carrier-air-superiority') {
    if (flexibleCarrierAirPriority) {
      return member.ship.slotSizes.map((slotSize, slotIndex) => ({
        key: `${shipIndex}:${slotIndex}`,
        shipIndex,
        slotIndex,
        slotSize,
        kind: 'carrier-aircraft',
        losPriority: false,
        airPowerPriority: true,
        airControlPriority: false,
        landAttackSafeCarrier: assignAntiInstallationAircraft,
      }))
    }
    const orderedSlots = member.ship.slotSizes
      .map((slotSize, slotIndex) => ({ slotSize, slotIndex }))
      .sort((left, right) => right.slotSize - left.slotSize || left.slotIndex - right.slotIndex)
    const attackSlotIndexes = new Set(orderedSlots.slice(0, 2).map(({ slotIndex }) => slotIndex))
    const primaryAttackSlotIndex = orderedSlots[0]?.slotIndex
    return member.ship.slotSizes.map((slotSize, slotIndex) => ({
      key: `${shipIndex}:${slotIndex}`,
      shipIndex,
      slotIndex,
      slotSize,
      kind: attackSlotIndexes.has(slotIndex)
        ? assignAntiInstallationAircraft
          ? slotIndex === primaryAttackSlotIndex
            ? 'anti-installation-aircraft'
            : 'anti-installation-safe-aircraft'
          : 'attack-aircraft'
        : 'fighter',
      losPriority: false,
      airPowerPriority: false,
      airControlPriority: false,
      landAttackSafeCarrier: assignAntiInstallationAircraft,
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
    if (submarineSeaplaneAirControl && assignAirSeaplanes && slotCount > 0) {
      requirementKinds.push('seaplane')
    }
    const reserveLosSlot = submarineLosPriority && losPriority && slotCount > 0
    const torpedoSlotCount = Math.max(0, slotCount - Number(reserveLosSlot))
    while (requirementKinds.length < torpedoSlotCount) requirementKinds.push('torpedo')
    if (reserveLosSlot && requirementKinds.length < slotCount)
      requirementKinds.push('submarine-los')
    while (requirementKinds.length < slotCount) requirementKinds.push('torpedo')
  } else if (member.role === 'resource-carrier') {
    while (requirementKinds.length < slotCount) requirementKinds.push('landing-craft')
  } else {
    while (requirementKinds.length < slotCount) requirementKinds.push('general')
  }

  if (assignDrumCanister && slotCount > 0) {
    requirementKinds[Math.min(slotCount, requirementKinds.length) - 1] = 'drum-canister'
  }
  if (assignAntiInstallationShell && slotCount > 0) {
    requirementKinds[Math.min(slotCount, requirementKinds.length) - 1] = 'anti-installation-shell'
  }
  if (assignAntiInstallationSurface && slotCount > 0) {
    requirementKinds[Math.min(slotCount, requirementKinds.length) - 1] = 'anti-installation-surface'
  }

  return member.ship.slotSizes.map((slotSize, slotIndex) => ({
    key: `${shipIndex}:${slotIndex}`,
    shipIndex,
    slotIndex,
    slotSize,
    kind: requirementKinds[slotIndex] ?? 'radar',
    losPriority:
      losPriority &&
      ['seaplane', 'recon', 'radar'].includes(requirementKinds[slotIndex] ?? 'radar'),
    airPowerPriority:
      bbvSeaplaneAirPriority &&
      member.role === 'main-battleship' &&
      member.ship.shipTypeId === 10 &&
      (requirementKinds[slotIndex] ?? 'radar') === 'seaplane',
    airControlPriority:
      submarineSeaplaneAirControl &&
      member.role === 'submarine' &&
      (requirementKinds[slotIndex] ?? 'radar') === 'seaplane',
    landAttackSafeCarrier: false,
  }))
}

const gearMatchesRequirement = (gear: OwnedEquipment, kind: GearRequirementKind): boolean => {
  if (kind === 'landing-craft') {
    return isNormalResourceLandingCraft(gear) || isDrumCanister(gear)
  }
  if (kind === 'drum-canister') return isDrumCanister(gear)
  if (kind === 'anti-installation-shell') {
    return isAntiInstallationShell(gear)
  }
  if (kind === 'anti-installation-surface') {
    return isSurfaceAntiInstallationGear(gear)
  }
  if (kind === 'ap-shell') {
    return gear.typeId === 19
  }
  if (kind === 'anti-installation-aircraft') return isCarrierInstallationAttackAircraft(gear)
  if (kind === 'anti-installation-safe-aircraft') return isCarrierInstallationAttackAircraft(gear)
  if (kind === 'carrier-aircraft') return CARRIER_AIRCRAFT_TYPE_IDS.has(gear.typeId)
  if (kind === 'submarine-los')
    return SEAPLANE_TYPE_IDS.has(gear.typeId) || RADAR_TYPE_IDS.has(gear.typeId)
  if (SPEED_GEAR_MASTER_IDS.has(gear.masterId)) return false
  const acceptedTypes: Readonly<Record<GearRequirementKind, readonly number[]>> = {
    'big-gun': [3],
    'main-gun': [2, 3],
    recon: [9, 10],
    'ap-shell': [19],
    'anti-installation-shell': [],
    'anti-installation-surface': [],
    'anti-installation-aircraft': [],
    'anti-installation-safe-aircraft': [],
    'carrier-aircraft': [],
    'anti-air-gun': [1, 2],
    fighter: [...ANTI_AIR_AIRCRAFT_TYPE_IDS],
    'attack-aircraft': [...ATTACK_AIRCRAFT_TYPE_IDS],
    radar: [...RADAR_TYPE_IDS],
    torpedo: [5, 32],
    'small-gun': [1],
    sonar: [14, 40],
    'depth-charge': [15],
    'midget-submarine': [22],
    'submarine-los': [],
    'drum-canister': [],
    'landing-craft': [],
    seaplane: [...SEAPLANE_TYPE_IDS],
    expansion: [],
    general: [],
  }
  return kind === 'general' || acceptedTypes[kind].includes(gear.typeId)
}

export const createGearSearchContext = (
  account: AccountSnapshot,
  avoidCurrentFleetEquipment = false,
): GearSearchContext => {
  const currentFleetShipIds = new Set<number>(account.currentFleetShipIds)
  return {
    availableEquipment: account.equipment,
    avoidCurrentFleetEquipment,
    currentFleetShipIds,
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

const equipmentAvailableForMember = (
  context: GearSearchContext,
  member: FleetMember,
  gear: OwnedEquipment,
): boolean =>
  !context.avoidCurrentFleetEquipment ||
  !gear.currentlyEquippedBy ||
  !context.currentFleetShipIds.has(gear.currentlyEquippedBy) ||
  gear.currentlyEquippedBy === member.ship.id

const gearScore = (gear: OwnedEquipment, requirement: GearRequirement): number => {
  const stats = gear.stats
  const improvement = Math.sqrt(Math.max(gear.improvement, 0))
  switch (requirement.kind) {
    case 'fighter':
      return (gear.airPowerBySlotSize[String(requirement.slotSize)] ?? 0) * 4 + stats.evasion
    case 'attack-aircraft':
    case 'anti-installation-aircraft':
    case 'anti-installation-safe-aircraft':
      return stats.torpedo * 4 + stats.bombing * 4 + stats.antiAir * 1.5 + stats.accuracy
    case 'carrier-aircraft':
      return (
        stats.torpedo * 4 +
        stats.bombing * 4 +
        stats.antiAir * 1.5 +
        stats.accuracy +
        (gear.airPowerBySlotSize[String(requirement.slotSize)] ?? 0) * 0.25
      )
    case 'recon':
      return (
        stats.los * (requirement.losPriority ? 12 : 6) +
        stats.accuracy * 2 +
        improvement * (requirement.losPriority ? 2 : 1)
      )
    case 'radar':
      return (
        stats.los * (requirement.losPriority ? 9 : 5) +
        stats.accuracy * 3 +
        stats.antiAir +
        improvement * (requirement.losPriority ? 2 : 1)
      )
    case 'torpedo':
      return stats.torpedo * 5 + stats.accuracy + improvement * 2
    case 'ap-shell':
    case 'anti-installation-shell':
    case 'anti-installation-surface':
      return stats.firepower * 4 + stats.accuracy * 2 + stats.armor + improvement * 2
    case 'anti-air-gun':
      return stats.antiAir * 6 + stats.firepower * 3 + stats.accuracy * 2 + improvement * 2
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
    case 'submarine-los':
      return (
        stats.los * (requirement.losPriority ? 12 : 6) +
        gear.losImprovement * (requirement.losPriority ? 3 : 1) +
        stats.torpedo * 2 +
        (gear.airPowerBySlotSize[String(requirement.slotSize)] ?? 0) * 2 +
        stats.accuracy
      )
    case 'drum-canister':
      return 80 + improvement
    case 'landing-craft':
      if (isNormalResourceLandingCraft(gear)) {
        return 80 + stats.firepower + stats.armor + improvement
      }
      if (isDrumCanister(gear)) return 45 + improvement
      return -20
    case 'seaplane':
      if (requirement.airPowerPriority) {
        return (
          (gear.airPowerBySlotSize[String(requirement.slotSize)] ?? 0) * 5 +
          stats.los * (requirement.losPriority ? 7 : 4) +
          stats.bombing * 2 +
          stats.antiAir * 2 +
          improvement * (requirement.losPriority ? 2 : 1)
        )
      }
      if (requirement.airControlPriority) {
        return (
          (gear.airPowerBySlotSize[String(requirement.slotSize)] ?? 0) * 5 +
          stats.antiAir * 3 +
          stats.los * 4 +
          stats.bombing +
          improvement
        )
      }
      return (
        (gear.airPowerBySlotSize[String(requirement.slotSize)] ?? 0) *
          (requirement.losPriority ? 2 : 4) +
        stats.los * (requirement.losPriority ? 12 : 4) +
        stats.bombing * 3 +
        stats.antiAir * (requirement.losPriority ? 1 : 2) +
        improvement * (requirement.losPriority ? 2 : 0)
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

const isSafeRegularFallback = (
  gear: OwnedEquipment,
  member: FleetMember,
  requirement: GearRequirement,
): boolean => {
  if (isAntiInstallationShell(gear) || isDrumCanister(gear) || isNormalResourceLandingCraft(gear)) {
    return false
  }
  if (member.role === 'carrier-air-superiority') {
    return CARRIER_AIRCRAFT_TYPE_IDS.has(gear.typeId)
  }
  if (member.role === 'torpedo-cruiser') {
    return (
      [2, 5, 12, 13, 22].includes(gear.typeId) &&
      !TORPEDO_CRUISER_UNFIT_GUN_MASTER_IDS.has(gear.masterId)
    )
  }
  if (member.role === 'submarine') {
    return [5, 10, 11, 12, 13, 32, 45, 51, 93].includes(gear.typeId)
  }
  if (member.role === 'main-battleship') {
    if (requirement.kind === 'seaplane') return SEAPLANE_TYPE_IDS.has(gear.typeId)
    return ![6, 7, 8, 11, 22, 45].includes(gear.typeId)
  }
  if (![6, 16].includes(member.ship.shipTypeId) && [11, 45].includes(gear.typeId)) return false
  return ![6, 7, 8].includes(gear.typeId)
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
    .filter((gear) => equipmentAvailableForMember(context, member, gear))
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
  protectedRegularSlotIndexes: ReadonlySet<number>,
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
    if (regularGears.length > ship.slotSizes.length - protectedRegularSlotIndexes.size) continue
    const regularSlotIndexes = ship.slotSizes
      .map((slotSize, slotIndex) => ({ slotSize, slotIndex }))
      .filter(({ slotIndex }) => !protectedRegularSlotIndexes.has(slotIndex))
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
  protectedRegularSlotIndexesByShip: ReadonlyMap<number, ReadonlySet<number>>,
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
          const reserved = reserveSpeedSelection(
            selection,
            state,
            member,
            shipIndex,
            protectedRegularSlotIndexesByShip.get(shipIndex) ?? new Set<number>(),
          )
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
  const cacheKey = `${ship.id}:${member.role}:${requirement.kind}:${requirement.slotSize}:${Number(
    requirement.losPriority,
  )}:${Number(requirement.airPowerPriority)}:${Number(requirement.airControlPriority)}:${Number(
    requirement.landAttackSafeCarrier,
  )}`
  const cached = context.optionCache.get(cacheKey)
  if (cached) return cached.slice(0, candidateLimit)
  const regularMasterIds = context.regularMasterIdsByShip.get(ship.id) ?? new Set<number>()
  const expansionEquipmentIds =
    context.expansionEquipmentIdsByShip.get(ship.id) ?? new Set<number>()
  let matchingEquipment: readonly OwnedEquipment[]
  if (requirement.kind === 'expansion') {
    matchingEquipment = context.availableEquipment.filter(
      (gear) =>
        equipmentAvailableForMember(context, member, gear) && expansionEquipmentIds.has(gear.id),
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
    .filter((gear) => equipmentAvailableForMember(context, member, gear))
    .filter((gear) => requirement.kind === 'expansion' || regularMasterIds.has(gear.masterId))
    .filter(
      (gear) => !requirement.landAttackSafeCarrier || !isCarrierLandAttackBlockingAircraft(gear),
    )
    .filter(
      (gear) =>
        member.role !== 'torpedo-cruiser' ||
        requirement.kind !== 'main-gun' ||
        !TORPEDO_CRUISER_UNFIT_GUN_MASTER_IDS.has(gear.masterId),
    )
    .map((gear) => ({ gear, score: gearScore(gear, requirement) }))
  const rankedOptions = options.sort(
    (left, right) => right.score - left.score || left.gear.id - right.gear.id,
  )
  if (requirement.kind === 'carrier-aircraft' && requirement.airPowerPriority) {
    const airRankedOptions = [...rankedOptions].sort(
      (left, right) =>
        (right.gear.airPowerBySlotSize[String(requirement.slotSize)] ?? 0) -
          (left.gear.airPowerBySlotSize[String(requirement.slotSize)] ?? 0) ||
        right.score - left.score ||
        left.gear.id - right.gear.id,
    )
    const interleavedOptions: GearOption[] = []
    const seenEquipmentIds = new Set<EquipmentInstanceId>()
    for (
      let index = 0;
      index < Math.max(rankedOptions.length, airRankedOptions.length);
      index += 1
    ) {
      ;[airRankedOptions[index], rankedOptions[index]].forEach((option) => {
        if (!option || seenEquipmentIds.has(option.gear.id)) return
        seenEquipmentIds.add(option.gear.id)
        interleavedOptions.push(option)
      })
    }
    context.optionCache.set(cacheKey, interleavedOptions)
    return interleavedOptions.slice(0, candidateLimit)
  }
  context.optionCache.set(cacheKey, rankedOptions)
  return rankedOptions.slice(0, candidateLimit)
}

const stateAirPower = (
  state: GearSearchState,
  requirementsByKey: ReadonlyMap<string, GearRequirement>,
): number =>
  [...state.assignments].reduce((total, [key, gear]) => {
    if (!gear) return total
    const requirement = requirementsByKey.get(key)
    if (!requirement || typeof requirement.slotIndex !== 'number') return total
    return total + (gear.airPowerBySlotSize[String(requirement.slotSize)] ?? 0)
  }, 0)

const rankFlexibleAirStates = (
  states: readonly GearSearchState[],
  requirementsByKey: ReadonlyMap<string, GearRequirement>,
  airPowerMinimum: number,
): readonly GearSearchState[] => {
  const compareAirPriority = (left: GearSearchState, right: GearSearchState): number => {
    const leftAirPower = stateAirPower(left, requirementsByKey)
    const rightAirPower = stateAirPower(right, requirementsByKey)
    const leftMeetsMinimum = leftAirPower >= airPowerMinimum
    const rightMeetsMinimum = rightAirPower >= airPowerMinimum
    return (
      Number(rightMeetsMinimum) - Number(leftMeetsMinimum) ||
      (leftMeetsMinimum && rightMeetsMinimum
        ? right.score - left.score
        : rightAirPower - leftAirPower) ||
      right.score - left.score ||
      compareSignatures(left.signature, right.signature)
    )
  }
  const halfWidth = Math.floor(GEAR_BEAM_WIDTH / 2)
  const airPriorityStates = [...states].sort(compareAirPriority).slice(0, halfWidth)
  const attackPriorityStates = [...states]
    .sort(
      (left, right) =>
        right.score - left.score || compareSignatures(left.signature, right.signature),
    )
    .slice(0, GEAR_BEAM_WIDTH - halfWidth)
  const seen = new Set<string>()
  return [...airPriorityStates, ...attackPriorityStates].filter((state) => {
    if (seen.has(state.signature)) return false
    seen.add(state.signature)
    return true
  })
}

const flexibleCarrierAttackCandidates = (
  context: GearSearchContext,
  member: FleetMember,
): readonly OwnedEquipment[] => {
  const candidates = context.availableEquipment
    .filter(isCarrierInstallationAttackAircraft)
    .filter((gear) => equipmentAvailableForMember(context, member, gear))
    .filter((gear) => member.ship.regularEquipableMasterIds.includes(gear.masterId))
  const attackRanked = [...candidates].sort(
    (left, right) =>
      right.stats.torpedo * 4 +
        right.stats.bombing * 4 +
        right.stats.accuracy -
        (left.stats.torpedo * 4 + left.stats.bombing * 4 + left.stats.accuracy) ||
      left.id - right.id,
  )
  const airRanked = [...candidates].sort(
    (left, right) =>
      Math.max(0, ...Object.values(right.airPowerBySlotSize)) -
        Math.max(0, ...Object.values(left.airPowerBySlotSize)) || left.id - right.id,
  )
  const seen = new Set<EquipmentInstanceId>()
  return [...airRanked.slice(0, 12), ...attackRanked.slice(0, 12)].filter((gear) => {
    if (seen.has(gear.id)) return false
    seen.add(gear.id)
    return true
  })
}

const buildFlexibleCarrierAttackReservationStates = (
  fleet: FleetSearchState,
  context: GearSearchContext,
  initialStates: readonly GearSearchState[],
  carrierIndexes: ReadonlySet<number>,
  requirementsByKey: ReadonlyMap<string, GearRequirement>,
  airPowerMinimum: number,
): readonly GearSearchState[] => {
  let states = initialStates
  carrierIndexes.forEach((shipIndex) => {
    const member = fleet.members[shipIndex]
    const candidates = flexibleCarrierAttackCandidates(context, member)
    const nextStates: GearSearchState[] = []
    states.forEach((state) => {
      candidates.forEach((gear) => {
        if (state.usedEquipmentIds.has(gear.id)) return
        member.ship.slotSizes.forEach((slotSize, slotIndex) => {
          const key = `${shipIndex}:${slotIndex}`
          if (slotSize <= 0 || state.assignments.has(key)) return
          const assignments = new Map(state.assignments)
          assignments.set(key, gear)
          const usedEquipmentIds = new Set(state.usedEquipmentIds)
          usedEquipmentIds.add(gear.id)
          const attackScore =
            gear.stats.torpedo * 4 +
            gear.stats.bombing * 4 +
            gear.stats.antiAir * 1.5 +
            gear.stats.accuracy
          nextStates.push({
            assignments,
            expansionAssignments: state.expansionAssignments,
            usedEquipmentIds,
            score: state.score + attackScore,
            signature: `${state.signature}|a${shipIndex}:${slotIndex}:${gear.id}`,
          })
        })
      })
    })
    states = rankFlexibleAirStates(nextStates, requirementsByKey, airPowerMinimum)
  })
  return states
}

export const buildGearSolutions = (
  fleet: FleetSearchState,
  context: GearSearchContext,
  airPowerMinimum: number | null = null,
  fastPlusRequired = false,
  antiInstallationShellCount = 0,
  antiInstallationSurfaceCount = 0,
  nightCarrierRequired = false,
  antiInstallationCarrierCount = 0,
  flexibleCarrierAirPriority = false,
  drumCanisterCarrierCount = 0,
  bbvSeaplaneLosPriority = false,
  bbvSeaplaneAirPriority = false,
  surfaceSeaplaneAirPriority = false,
  losPriority = false,
  submarineSeaplaneAirControl = false,
  submarineLosPriority = false,
  mayaAaciPreferred = false,
): readonly RecommendedShipBuild[][] => {
  const airPowerRequired = airPowerMinimum !== null
  const solutionCacheKey = `${fleet.members
    .map((member) => `${member.ship.id}:${member.role}`)
    .join('-')}:${airPowerMinimum ?? 'none'}:${Number(fastPlusRequired)}:${Number(
    antiInstallationShellCount,
  )}:${Number(antiInstallationSurfaceCount)}:${Number(
    nightCarrierRequired,
  )}:${antiInstallationCarrierCount}:${Number(
    flexibleCarrierAirPriority,
  )}:${drumCanisterCarrierCount}:${Number(
    bbvSeaplaneLosPriority,
  )}:${Number(bbvSeaplaneAirPriority)}:${Number(surfaceSeaplaneAirPriority)}:${Number(losPriority)}:${Number(
    submarineSeaplaneAirControl,
  )}:${Number(submarineLosPriority)}:${Number(mayaAaciPreferred)}`
  const cachedSolution = context.solutionCache.get(solutionCacheKey)
  if (cachedSolution) return cachedSolution
  const availableAntiInstallationShellMasterIds = new Set(
    context.availableEquipment.filter(isAntiInstallationShell).map((gear) => gear.masterId),
  )
  const antiInstallationMemberIndexes = new Set(
    fleet.members
      .map((member, shipIndex) => ({ member, shipIndex }))
      .filter(({ member }) => ANTI_INSTALLATION_SHELL_SHIP_TYPE_IDS.has(member.ship.shipTypeId))
      .filter(({ member }) =>
        context.availableEquipment.some(
          (gear) =>
            isAntiInstallationShell(gear) &&
            equipmentAvailableForMember(context, member, gear) &&
            member.ship.regularEquipableMasterIds.includes(gear.masterId) &&
            availableAntiInstallationShellMasterIds.has(gear.masterId),
        ),
      )
      .slice(0, antiInstallationShellCount)
      .map(({ shipIndex }) => shipIndex),
  )
  if (antiInstallationMemberIndexes.size < antiInstallationShellCount) {
    context.solutionCache.set(solutionCacheKey, [])
    return []
  }
  const antiInstallationSurfaceMemberIndexes = new Set(
    fleet.members
      .map((member, shipIndex) => ({ member, shipIndex }))
      .filter(({ member }) => ANTI_INSTALLATION_SHELL_SHIP_TYPE_IDS.has(member.ship.shipTypeId))
      .filter(({ member }) =>
        context.availableEquipment.some(
          (gear) =>
            isSurfaceAntiInstallationGear(gear) &&
            equipmentAvailableForMember(context, member, gear) &&
            member.ship.regularEquipableMasterIds.includes(gear.masterId),
        ),
      )
      .filter(({ shipIndex }) => !antiInstallationMemberIndexes.has(shipIndex))
      .slice(0, antiInstallationSurfaceCount)
      .map(({ shipIndex }) => shipIndex),
  )
  if (antiInstallationSurfaceMemberIndexes.size < antiInstallationSurfaceCount) {
    context.solutionCache.set(solutionCacheKey, [])
    return []
  }
  const antiInstallationCarrierIndexes = new Set(
    fleet.members
      .map((member, shipIndex) => ({ member, shipIndex }))
      .filter(({ member }) => [7, 11, 18].includes(member.ship.shipTypeId))
      .filter(({ member }) =>
        context.availableEquipment.some(
          (gear) =>
            isCarrierInstallationAttackAircraft(gear) &&
            equipmentAvailableForMember(context, member, gear) &&
            member.ship.regularEquipableMasterIds.includes(gear.masterId),
        ),
      )
      .slice(0, antiInstallationCarrierCount)
      .map(({ shipIndex }) => shipIndex),
  )
  if (antiInstallationCarrierIndexes.size < antiInstallationCarrierCount) {
    context.solutionCache.set(solutionCacheKey, [])
    return []
  }
  const availableDrumCanisters = context.availableEquipment.filter(isDrumCanister)
  const drumCanisterCarrierIndexes = new Set(
    fleet.members
      .map((member, shipIndex) => ({ member, shipIndex }))
      .filter(({ member }) => member.ship.slotSizes.length > 0)
      .filter(({ member }) =>
        availableDrumCanisters.some(
          (gear) =>
            equipmentAvailableForMember(context, member, gear) &&
            member.ship.regularEquipableMasterIds.includes(gear.masterId),
        ),
      )
      .sort(
        (left, right) =>
          Number(left.member.role === 'main-battleship') -
            Number(right.member.role === 'main-battleship') || left.shipIndex - right.shipIndex,
      )
      .slice(0, drumCanisterCarrierCount)
      .map(({ shipIndex }) => shipIndex),
  )
  if (
    availableDrumCanisters.length < drumCanisterCarrierCount ||
    drumCanisterCarrierIndexes.size < drumCanisterCarrierCount
  ) {
    context.solutionCache.set(solutionCacheKey, [])
    return []
  }
  const regularRequirements = fleet.members.flatMap((member, shipIndex) => {
    const assignAirSeaplanes =
      airPowerRequired &&
      context.availableEquipment.some(
        (gear) =>
          SEAPLANE_TYPE_IDS.has(gear.typeId) &&
          equipmentAvailableForMember(context, member, gear) &&
          context.regularMasterIdsByShip.get(member.ship.id)?.has(gear.masterId) &&
          Object.values(gear.airPowerBySlotSize).some((power) => power > 0),
      )
    return requirementsForMember(
      member,
      shipIndex,
      assignAirSeaplanes,
      antiInstallationMemberIndexes.has(shipIndex),
      antiInstallationSurfaceMemberIndexes.has(shipIndex),
      antiInstallationCarrierIndexes.has(shipIndex),
      flexibleCarrierAirPriority,
      drumCanisterCarrierIndexes.has(shipIndex),
      bbvSeaplaneLosPriority,
      bbvSeaplaneAirPriority,
      surfaceSeaplaneAirPriority,
      fastPlusRequired,
      losPriority,
      submarineSeaplaneAirControl,
      submarineLosPriority,
      mayaAaciPreferred,
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
              losPriority: false,
              airPowerPriority: false,
              airControlPriority: false,
              landAttackSafeCarrier: false,
            },
          ]
        : [],
  )
  const requirements = [...regularRequirements, ...expansionRequirements]
  const regularRequirementsByKey = new Map(
    regularRequirements.map((requirement) => [requirement.key, requirement]),
  )
  const requirementCounts = new Map<GearRequirementKind, number>()
  requirements.forEach((requirement) => {
    requirementCounts.set(requirement.kind, (requirementCounts.get(requirement.kind) ?? 0) + 1)
  })
  const requirementsWithOptions = requirements
    .map((requirement) => {
      const candidateLimit = Math.max(
        MIN_GEAR_CANDIDATES_PER_SLOT,
        (requirementCounts.get(requirement.kind) ?? 0) + 6,
      )
      const primaryOptions = optionsForRequirement(
        requirement,
        fleet.members,
        context,
        candidateLimit,
      )
      if (requirement.kind === 'expansion' || isMandatoryRequirementKind(requirement.kind)) {
        return { requirement, options: primaryOptions }
      }
      const primaryIds = new Set(primaryOptions.map(({ gear }) => gear.id))
      const fallbackCandidateLimit = Math.max(candidateLimit, regularRequirements.length + 6)
      const fallbackOptions = optionsForRequirement(
        { ...requirement, kind: 'general' },
        fleet.members,
        context,
        context.availableEquipment.length,
      )
        .filter(({ gear }) => !primaryIds.has(gear.id))
        .filter(({ gear }) =>
          isSafeRegularFallback(gear, fleet.members[requirement.shipIndex], requirement),
        )
        .map((option) => ({ ...option, score: option.score - 200 }))
        .slice(0, fallbackCandidateLimit)
      return {
        requirement,
        options: [...primaryOptions, ...fallbackOptions].slice(0, fallbackCandidateLimit),
      }
    })
    .sort(
      (left, right) =>
        left.options.length - right.options.length ||
        Number(isMandatoryRequirementKind(right.requirement.kind)) -
          Number(isMandatoryRequirementKind(left.requirement.kind)) ||
        left.requirement.key.localeCompare(right.requirement.key),
    )

  const protectedRegularSlotIndexesByShip = new Map<number, ReadonlySet<number>>()
  regularRequirements.forEach((requirement) => {
    if (
      typeof requirement.slotIndex !== 'number' ||
      ![
        'anti-installation-shell',
        'anti-installation-surface',
        'anti-installation-aircraft',
        'anti-installation-safe-aircraft',
        'drum-canister',
      ].includes(requirement.kind)
    ) {
      return
    }
    const indexes = new Set(protectedRegularSlotIndexesByShip.get(requirement.shipIndex) ?? [])
    indexes.add(requirement.slotIndex)
    protectedRegularSlotIndexesByShip.set(requirement.shipIndex, indexes)
  })
  let states: readonly GearSearchState[] = fastPlusRequired
    ? buildFastPlusReservationStates(fleet, context, protectedRegularSlotIndexesByShip)
    : [
        {
          assignments: new Map<string, OwnedEquipment | null>(),
          expansionAssignments: new Map<number, OwnedEquipment>(),
          usedEquipmentIds: new Set<EquipmentInstanceId>(),
          score: 0,
          signature: '',
        },
      ]
  if (
    flexibleCarrierAirPriority &&
    antiInstallationCarrierIndexes.size > 0 &&
    airPowerMinimum !== null
  ) {
    states = buildFlexibleCarrierAttackReservationStates(
      fleet,
      context,
      states,
      antiInstallationCarrierIndexes,
      regularRequirementsByKey,
      airPowerMinimum,
    )
  }
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
        requirement.kind === 'expansion' ? [...availableOptions, null] : availableOptions
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
    states =
      flexibleCarrierAirPriority && airPowerMinimum !== null
        ? rankFlexibleAirStates(nextStates, regularRequirementsByKey, airPowerMinimum)
        : rankStates(nextStates, GEAR_BEAM_WIDTH)
  })

  const requiredEquipmentRequirements = requirements.filter(
    (requirement) =>
      requirement.kind === 'midget-submarine' ||
      requirement.kind === 'drum-canister' ||
      requirement.kind === 'anti-installation-shell' ||
      requirement.kind === 'anti-installation-surface' ||
      requirement.kind === 'anti-installation-aircraft',
  )
  const requiredStates = states.filter((state) =>
    requiredEquipmentRequirements.every((requirement) => {
      const gear = state.assignments.get(requirement.key)
      if (!gear) return false
      if (requirement.kind === 'midget-submarine') return gear.typeId === 22
      if (requirement.kind === 'drum-canister') return isDrumCanister(gear)
      if (requirement.kind === 'anti-installation-aircraft') {
        return isCarrierInstallationAttackAircraft(gear)
      }
      if (requirement.kind === 'anti-installation-surface') {
        return isSurfaceAntiInstallationGear(gear)
      }
      return isAntiInstallationShell(gear)
    }),
  )
  const carrierStates = requiredStates.filter((state) =>
    [...antiInstallationCarrierIndexes].every((shipIndex) =>
      [...state.assignments].some(([key, gear]) => {
        const requirement = regularRequirementsByKey.get(key)
        return Boolean(
          gear && requirement?.shipIndex === shipIndex && isCarrierInstallationAttackAircraft(gear),
        )
      }),
    ),
  )
  const rankedCarrierStates =
    flexibleCarrierAirPriority && airPowerMinimum !== null
      ? [...carrierStates].sort((left, right) => {
          const leftAirPower = stateAirPower(left, regularRequirementsByKey)
          const rightAirPower = stateAirPower(right, regularRequirementsByKey)
          const leftMeetsMinimum = leftAirPower >= airPowerMinimum
          const rightMeetsMinimum = rightAirPower >= airPowerMinimum
          return (
            Number(rightMeetsMinimum) - Number(leftMeetsMinimum) ||
            (leftMeetsMinimum && rightMeetsMinimum
              ? right.score - left.score
              : rightAirPower - leftAirPower) ||
            compareSignatures(left.signature, right.signature)
          )
        })
      : carrierStates
  const solutions = rankedCarrierStates.slice(0, 6).map((state) =>
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
