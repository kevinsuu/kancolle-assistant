import type {
  FleetMetrics,
  OwnedEquipment,
  RecommendedShipBuild,
  RouteTemplate,
  ShipSpeed,
} from './types'
import { isDrumCanister, isNormalResourceLandingCraft } from './resource'

const LOS_MULTIPLIERS: Readonly<Record<number, number>> = {
  8: 0.8,
  9: 1,
  10: 1.2,
  11: 1.1,
  49: 1,
  58: 0.8,
  59: 1,
  94: 1,
}

const speedOrder: readonly ShipSpeed[] = ['slow', 'fast', 'fast+', 'fastest']

const getAirConstraint = (route: RouteTemplate) => {
  const constraint = route.calculatedConstraints.find((item) => item.kind === 'air-power')
  return constraint?.kind === 'air-power' ? constraint : null
}

const getLosConstraint = (route: RouteTemplate) => {
  const constraint = route.calculatedConstraints.find((item) => item.kind === 'los')
  return constraint?.kind === 'los' ? constraint : null
}

const equipmentLos = (gear: OwnedEquipment): number => {
  if (gear.stats.los <= 0) return 0
  const multiplier = LOS_MULTIPLIERS[gear.typeId] ?? 0.6
  return multiplier * (gear.stats.los + gear.losImprovement)
}

export const calculateFleetAirPower = (builds: readonly RecommendedShipBuild[]): number =>
  builds.reduce(
    (fleetTotal, build) =>
      fleetTotal +
      build.equipment.reduce((shipTotal, gear, slotIndex) => {
        if (!gear) return shipTotal
        const slotSize = build.ship.slotSizes[slotIndex] ?? 0
        return shipTotal + (gear.airPowerBySlotSize[String(slotSize)] ?? 0)
      }, 0),
    0,
  )

export const calculateLos33 = (
  builds: readonly RecommendedShipBuild[],
  coefficient: number,
  hqLevel: number,
): number => {
  const shipLos = builds.reduce((total, build) => total + Math.sqrt(build.ship.nakedLos), 0)
  const gearLos = builds.reduce(
    (fleetTotal, build) =>
      fleetTotal +
      build.equipment.reduce((shipTotal, gear) => shipTotal + (gear ? equipmentLos(gear) : 0), 0),
    0,
  )
  const emptyShipSlots = 6 - builds.length
  return shipLos + coefficient * gearLos - Math.ceil(hqLevel * 0.4) + 2 * emptyShipSlots
}

const calculateOpeningAswCount = (builds: readonly RecommendedShipBuild[]): number =>
  builds.filter((build) => {
    const equipmentAsw = build.equipment.reduce((total, gear) => total + (gear?.stats.asw ?? 0), 0)
    return build.ship.stats.asw + equipmentAsw >= 100
  }).length

const calculateNightCutInCandidates = (builds: readonly RecommendedShipBuild[]): number =>
  builds.filter((build) => {
    const torpedoCount = build.equipment.filter((gear) => gear?.typeId === 5).length
    return torpedoCount >= 2 && build.ship.stats.luck >= 30
  }).length

const calculateBuildSpeed = (build: RecommendedShipBuild): ShipSpeed => {
  if (build.ship.speedValue >= 20) return 'fastest'
  if (build.ship.speedValue >= 15) return 'fast+'
  const speedEquipment = [...build.equipment, build.expansionSlot].filter((gear) => gear !== null)
  const counts = {
    turbineCount: speedEquipment.filter((gear) => gear.masterId === 33).length,
    enhancedBoilerCount: speedEquipment.filter((gear) => gear.masterId === 34).length,
    newModelBoilerBelow7Count: speedEquipment.filter(
      (gear) => gear.masterId === 87 && gear.improvement < 7,
    ).length,
    newModelBoilerAtLeast7Count: speedEquipment.filter(
      (gear) => gear.masterId === 87 && gear.improvement >= 7,
    ).length,
  }
  const reachesFastPlus = build.ship.fastPlusPatterns.some(
    (pattern) =>
      pattern.turbineCount === counts.turbineCount &&
      pattern.enhancedBoilerCount === counts.enhancedBoilerCount &&
      pattern.newModelBoilerBelow7Count === counts.newModelBoilerBelow7Count &&
      pattern.newModelBoilerAtLeast7Count === counts.newModelBoilerAtLeast7Count,
  )
  return reachesFastPlus ? 'fast+' : build.ship.speed
}

const calculateFinalSpeed = (builds: readonly RecommendedShipBuild[]): ShipSpeed =>
  builds.reduce<ShipSpeed>((slowest, build) => {
    const buildSpeed = calculateBuildSpeed(build)
    const currentIndex = speedOrder.indexOf(buildSpeed)
    const slowestIndex = speedOrder.indexOf(slowest)
    return currentIndex < slowestIndex ? buildSpeed : slowest
  }, 'fastest')

export const calculateFleetMetrics = (
  builds: readonly RecommendedShipBuild[],
  route: RouteTemplate,
  hqLevel: number,
): FleetMetrics => {
  const airConstraint = getAirConstraint(route)
  const losConstraint = getLosConstraint(route)
  const equipment = builds.flatMap((build) => build.equipment).filter((gear) => gear !== null)
  const landingCraftCount = equipment.filter(isNormalResourceLandingCraft).length
  const drumCount = equipment.filter(isDrumCanister).length
  const fuelCostRate = route.resourceProfile?.fuelCostRate ?? 0.8
  const ammoCostRate = route.resourceProfile?.ammoCostRate ?? 0.8
  const estimatedFuelCost = Math.ceil(
    builds.reduce((total, build) => total + build.ship.fuelCost, 0) * fuelCostRate,
  )
  const estimatedAmmoCost = Math.ceil(
    builds.reduce((total, build) => total + build.ship.ammoCost, 0) * ammoCostRate,
  )
  const estimatedResourceGain = route.resourceProfile
    ? Math.floor(
        (route.resourceProfile.averageBaseGain +
          landingCraftCount * route.resourceProfile.landingCraftBonus +
          drumCount * route.resourceProfile.drumBonus) *
          route.resourceProfile.reachRate,
      )
    : null
  const targetSortieCost =
    route.resourceProfile?.target === 'fuel'
      ? estimatedFuelCost
      : route.resourceProfile?.target === 'ammo'
        ? estimatedAmmoCost
        : 0

  return {
    airPower: calculateFleetAirPower(builds),
    airPowerRequired: airConstraint !== null,
    airPowerMinimum: airConstraint?.minimum ?? 0,
    airPowerRecommended: airConstraint?.recommended ?? 0,
    los33: calculateLos33(builds, losConstraint?.coefficient ?? 1, hqLevel),
    losRequired: losConstraint !== null,
    losMinimum: losConstraint?.minimum ?? 0,
    openingAswCount: calculateOpeningAswCount(builds),
    estimatedFuelCost,
    estimatedAmmoCost,
    estimatedResourceGain,
    estimatedNetResourceGain:
      estimatedResourceGain === null ? null : estimatedResourceGain - targetSortieCost,
    resourceTarget: route.resourceProfile?.target ?? null,
    landingCraftCount,
    drumCount,
    nightCutInCandidates: calculateNightCutInCandidates(builds),
    finalSpeedClass: calculateFinalSpeed(builds),
  }
}

export const satisfiesCalculatedConstraints = (metrics: FleetMetrics): boolean =>
  (!metrics.airPowerRequired || metrics.airPower >= metrics.airPowerMinimum) &&
  (!metrics.losRequired || metrics.los33 >= metrics.losMinimum)
