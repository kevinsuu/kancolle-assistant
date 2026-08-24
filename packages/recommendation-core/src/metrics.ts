import type {
  FleetMetrics,
  OwnedEquipment,
  RecommendedShipBuild,
  RouteTemplate,
  ShipSpeed,
} from './types'

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

const calculateFinalSpeed = (builds: readonly RecommendedShipBuild[]): ShipSpeed =>
  builds.reduce<ShipSpeed>((slowest, build) => {
    const currentIndex = speedOrder.indexOf(build.ship.speed)
    const slowestIndex = speedOrder.indexOf(slowest)
    return currentIndex < slowestIndex ? build.ship.speed : slowest
  }, 'fastest')

export const calculateFleetMetrics = (
  builds: readonly RecommendedShipBuild[],
  route: RouteTemplate,
  hqLevel: number,
): FleetMetrics => {
  const airConstraint = getAirConstraint(route)
  const losConstraint = getLosConstraint(route)

  return {
    airPower: calculateFleetAirPower(builds),
    airPowerRequired: airConstraint !== null,
    airPowerMinimum: airConstraint?.minimum ?? 0,
    airPowerRecommended: airConstraint?.recommended ?? 0,
    los33: calculateLos33(builds, losConstraint?.coefficient ?? 1, hqLevel),
    losRequired: losConstraint !== null,
    losMinimum: losConstraint?.minimum ?? 0,
    openingAswCount: calculateOpeningAswCount(builds),
    estimatedFuelCost: Math.ceil(
      builds.reduce((total, build) => total + build.ship.fuelCost, 0) * 0.8,
    ),
    estimatedAmmoCost: Math.ceil(
      builds.reduce((total, build) => total + build.ship.ammoCost, 0) * 0.8,
    ),
    nightCutInCandidates: calculateNightCutInCandidates(builds),
    finalSpeedClass: calculateFinalSpeed(builds),
  }
}

export const satisfiesCalculatedConstraints = (metrics: FleetMetrics): boolean =>
  (!metrics.airPowerRequired || metrics.airPower >= metrics.airPowerMinimum) &&
  (!metrics.losRequired || metrics.los33 >= metrics.losMinimum)
