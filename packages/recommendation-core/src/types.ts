export type Brand<T, Name extends string> = T & { readonly __brand: Name }

export type ShipInstanceId = Brand<number, 'ShipInstanceId'>
export type ShipMasterId = Brand<number, 'ShipMasterId'>
export type EquipmentInstanceId = Brand<number, 'EquipmentInstanceId'>
export type EquipmentMasterId = Brand<number, 'EquipmentMasterId'>

export type MapId = string
export type ShipSpeed = 'slow' | 'fast' | 'fast+' | 'fastest'
export const RECOMMENDATION_OBJECTIVES = [
  'balanced',
  'boss-clear',
  'low-cost',
  'leveling',
  'resource-fuel',
  'resource-ammo',
  'resource-steel',
  'resource-bauxite',
  'resource-bucket',
  'resource-devmat',
] as const
export type RecommendationObjective = (typeof RECOMMENDATION_OBJECTIVES)[number]
export type FleetRole =
  | 'main-battleship'
  | 'carrier-air-superiority'
  | 'torpedo-cruiser'
  | 'utility-cruiser'
  | 'escort-destroyer'
  | 'anti-submarine'
  | 'submarine'
  | 'resource-carrier'
  | 'wildcard'
export type StrategyCategory = 'boss' | 'leveling' | 'resource' | 'gimmick'

export interface ShipStats {
  readonly hp: number
  readonly firepower: number
  readonly torpedo: number
  readonly antiAir: number
  readonly armor: number
  readonly evasion: number
  readonly asw: number
  readonly los: number
  readonly luck: number
}

export interface EquipmentStats {
  readonly firepower: number
  readonly torpedo: number
  readonly antiAir: number
  readonly armor: number
  readonly asw: number
  readonly los: number
  readonly bombing: number
  readonly accuracy: number
  readonly evasion: number
}

export interface OwnedShip {
  readonly id: ShipInstanceId
  readonly masterId: ShipMasterId
  readonly name: string
  readonly level: number
  readonly shipTypeId: number
  readonly shipType: string
  readonly speed: ShipSpeed
  readonly speedValue: number
  readonly stats: ShipStats
  readonly nakedLos: number
  readonly slotSizes: readonly number[]
  readonly equippedItemIds: readonly (EquipmentInstanceId | null)[]
  readonly expansionSlotItemId: EquipmentInstanceId | null
  readonly expansionSlotUnlocked: boolean
  readonly expansionEquipableEquipmentIds: readonly EquipmentInstanceId[]
  readonly regularEquipableMasterIds: readonly EquipmentMasterId[]
  readonly fastPlusPatterns: readonly FastPlusPattern[]
  readonly nightCarrierPatterns: readonly NightCarrierPattern[]
  readonly locked: boolean
  readonly morale?: number
  readonly eventTag?: number | null
  readonly fuelCost: number
  readonly ammoCost: number
}

export interface FastPlusPattern {
  readonly turbineCount: number
  readonly enhancedBoilerCount: number
  readonly newModelBoilerBelow7Count: number
  readonly newModelBoilerAtLeast7Count: number
}

export interface NightCarrierPattern {
  readonly nightAircraftCount: number
  readonly nightOperationsPersonnelCount: number
  readonly swordfishCount: number
}

export interface OwnedEquipment {
  readonly id: EquipmentInstanceId
  readonly masterId: EquipmentMasterId
  readonly name: string
  readonly typeId: number
  readonly iconTypeId: number
  readonly type: string
  readonly improvement: number
  readonly proficiency: number
  readonly locked: boolean
  readonly currentlyEquippedBy: ShipInstanceId | null
  readonly stats: EquipmentStats
  readonly losImprovement: number
  readonly airPowerBySlotSize: Readonly<Record<string, number>>
}

export interface AccountSnapshot {
  readonly generatedAt: string
  readonly hqLevel: number
  readonly ships: readonly OwnedShip[]
  readonly equipment: readonly OwnedEquipment[]
  readonly currentFleetShipIds: readonly ShipInstanceId[]
  readonly metadata: {
    readonly source: 'kc3'
    readonly schemaVersion: 1
    readonly capabilities: KC3Capabilities
  }
}

export interface KC3Capabilities {
  readonly accountShips: boolean
  readonly accountEquipment: boolean
  readonly masterData: boolean
  readonly currentFleet: boolean
}

export type FleetConstraint =
  | {
      readonly kind: 'ship-count'
      readonly exact: number
    }
  | {
      readonly kind: 'ship-type-count'
      readonly shipTypeIds: readonly number[]
      readonly min?: number
      readonly max?: number
      readonly exact?: number
    }
  | {
      readonly kind: 'specific-ship-name'
      readonly names: readonly string[]
      readonly min: number
    }

export type CalculatedConstraint =
  | {
      readonly kind: 'air-power'
      readonly minimum: number
      readonly recommended: number
    }
  | {
      readonly kind: 'los'
      readonly formula: '33'
      readonly coefficient: number
      readonly minimum: number
    }
  | {
      readonly kind: 'opening-asw'
      readonly minimum: number
    }

export interface RouteTemplate {
  readonly id: string
  readonly mapId: MapId
  readonly name: string
  readonly nodes: readonly string[]
  readonly description: string
  readonly category: StrategyCategory
  readonly objectives: readonly RecommendationObjective[]
  readonly stableBoss: boolean
  readonly phase?: string
  readonly tags: readonly string[]
  readonly fleetConstraints: readonly FleetConstraint[]
  readonly calculatedConstraints: readonly CalculatedConstraint[]
  readonly resourceProfile?: RouteResourceProfile
  readonly metadata: {
    readonly source: readonly string[]
    readonly confidence: 'verified' | 'community' | 'experimental'
    readonly lastVerified: string
    readonly ruleVersion: string
  }
}

export interface RouteResourceProfile {
  readonly target: 'fuel' | 'ammo' | 'steel' | 'bauxite'
  readonly reachRate: number
  readonly averageBaseGain: number
  readonly landingCraftBonus: number
  readonly drumBonus: number
  readonly fuelCostRate: number
  readonly ammoCostRate: number
}

export interface RecommendationPreferences {
  readonly avoidCurrentFleetEquipment?: boolean
}

export interface RecommendFleetInput {
  readonly mapId: MapId
  readonly routeId?: string
  readonly objective: RecommendationObjective
  readonly account: AccountSnapshot
  readonly preferences?: RecommendationPreferences
}

export interface RecommendedShipBuild {
  readonly ship: OwnedShip
  readonly role: FleetRole
  readonly equipment: readonly (OwnedEquipment | null)[]
  readonly expansionSlot: OwnedEquipment | null
}

export interface FleetMetrics {
  readonly airPower: number
  readonly airPowerRequired: boolean
  readonly airPowerMinimum: number
  readonly airPowerRecommended: number
  readonly los33: number
  readonly losRequired: boolean
  readonly losMinimum: number
  readonly openingAswCount: number
  readonly openingAswRequired: boolean
  readonly openingAswMinimum: number
  readonly estimatedFuelCost: number
  readonly estimatedAmmoCost: number
  readonly estimatedResourceGain: number | null
  readonly estimatedNetResourceGain: number | null
  readonly resourceTarget: RouteResourceProfile['target'] | null
  readonly landingCraftCount: number
  readonly drumCount: number
  readonly nightCutInCandidates: number
  readonly finalSpeedClass: ShipSpeed
}

export type ScoreDimension =
  | 'bossDamage'
  | 'survival'
  | 'airPowerMargin'
  | 'nightBattle'
  | 'openingAsw'
  | 'resourceCost'
  | 'equipmentOpportunityCost'
  | 'routeReliability'

export interface RecommendationScore {
  readonly total: number
  readonly dimensions: Readonly<Record<ScoreDimension, number>>
}

export interface RecommendationMessage {
  readonly code: string
  readonly message: string
  readonly values?: Readonly<Record<string, string | number>>
}

export interface FleetRecommendation {
  readonly id: string
  readonly title: string
  readonly mapId: MapId
  readonly route: RouteTemplate
  readonly ships: readonly RecommendedShipBuild[]
  readonly metrics: FleetMetrics
  readonly score: RecommendationScore
  readonly reasons: readonly RecommendationMessage[]
  readonly warnings: readonly RecommendationMessage[]
}

export interface UnsatisfiedRequirement {
  readonly code: string
  readonly message: string
  readonly values?: Readonly<Record<string, string | number>>
}

export type RecommendFleetResult =
  | {
      readonly status: 'success'
      readonly recommendations: readonly FleetRecommendation[]
      readonly elapsedMs: number
      readonly solverVersion: string
    }
  | {
      readonly status: 'no-solution'
      readonly analysis: { readonly reasons: readonly UnsatisfiedRequirement[] }
      readonly elapsedMs: number
      readonly solverVersion: string
    }
  | {
      readonly status: 'error'
      readonly error: { readonly code: string; readonly message: string }
    }

export interface MapOption {
  readonly id: MapId
  readonly name: string
  readonly objectives: readonly RecommendationObjective[]
  readonly routeCount: number
  readonly stableBossRouteCount: number
  readonly routes: readonly MapRouteOption[]
}

export interface MapRouteOption {
  readonly id: string
  readonly name: string
  readonly phase?: string
  readonly category: StrategyCategory
  readonly objectives: readonly RecommendationObjective[]
  readonly nodes: readonly string[]
  readonly stableBoss: boolean
  readonly automaticReady: boolean
  readonly description: string
  readonly confidence: RouteTemplate['metadata']['confidence']
}
