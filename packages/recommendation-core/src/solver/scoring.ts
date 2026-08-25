import type {
  FleetMetrics,
  RecommendationObjective,
  RecommendationScore,
  RecommendedShipBuild,
  ScoreDimension,
} from '../types'

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value))

const RESOURCE_WEIGHTS: Readonly<Record<ScoreDimension, number>> = Object.freeze({
  bossDamage: 0.08,
  survival: 0.17,
  airPowerMargin: 0.05,
  nightBattle: 0.03,
  openingAsw: 0.02,
  resourceCost: 0.45,
  equipmentOpportunityCost: 0.15,
  routeReliability: 0.05,
})

const OBJECTIVE_WEIGHTS: Readonly<
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
  'resource-fuel': RESOURCE_WEIGHTS,
  'resource-ammo': RESOURCE_WEIGHTS,
  'resource-steel': RESOURCE_WEIGHTS,
  'resource-bauxite': RESOURCE_WEIGHTS,
  'resource-bucket': RESOURCE_WEIGHTS,
  'resource-devmat': RESOURCE_WEIGHTS,
}

export const scoreFleet = (
  builds: readonly RecommendedShipBuild[],
  metrics: FleetMetrics,
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
    resourceCost:
      metrics.estimatedNetResourceGain === null
        ? clamp(115 - (metrics.estimatedFuelCost + metrics.estimatedAmmoCost) / 20)
        : clamp(50 + metrics.estimatedNetResourceGain * 2),
    equipmentOpportunityCost: clamp(100 - movedEquipmentCount * 7),
    routeReliability: clamp(
      (metrics.losRequired ? 70 + Math.min(metrics.los33 - metrics.losMinimum, 15) * 2 : 80) +
        (metrics.airPowerRequired
          ? Math.min(metrics.airPower - metrics.airPowerMinimum, 50) * 0.2
          : 0),
    ),
  }
  const total = (Object.keys(dimensions) as ScoreDimension[]).reduce(
    (sum, dimension) => sum + dimensions[dimension] * OBJECTIVE_WEIGHTS[objective][dimension],
    0,
  )
  return { total: Math.round(total * 10) / 10, dimensions }
}
