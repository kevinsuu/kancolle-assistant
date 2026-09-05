import type { OwnedEquipment, RouteTemplate } from '../types'
import type { FleetMember, FleetSearchState } from './internal-types'
import type { GearSearchContext } from './gear-search'

export interface LoadoutPlan {
  readonly key: string
  readonly members: readonly FleetMember[]
  readonly styles: Readonly<
    Record<number, 'default' | 'surface' | 'torpedo' | 'asw-synergy' | 'air-control'>
  >
  readonly aswSlots: Readonly<Record<number, number>>
  readonly shellIndexes: readonly number[]
  readonly surfaceIndexes: readonly number[]
  readonly carrierIndexes: readonly number[]
  readonly drumIndexes: readonly number[]
  readonly guideEquipment: boolean
  readonly disabledGuideIndexes: readonly number[]
}

const PLAN_LIMIT = 24
const combinations = (values: readonly number[], count: number): number[][] => {
  if (count === 0) return [[]]
  return values.flatMap((value, index) =>
    combinations(values.slice(index + 1), count - 1).map((tail) => [value, ...tail]),
  )
}

const surfaceRole = (member: FleetMember): FleetMember['role'] =>
  [1, 2].includes(member.ship.shipTypeId) ? 'escort-destroyer' : 'utility-cruiser'

export const createLoadoutPlans = (
  fleet: FleetSearchState,
  context: GearSearchContext,
  shellCount: number,
  surfaceCount: number,
  carrierCount: number,
  drumCount: number,
  route?: RouteTemplate,
): LoadoutPlan[] => {
  const equipmentFor = (member: FleetMember) =>
    context.availableEquipment.filter(
      (gear) =>
        context.regularMasterIdsByShip.get(member.ship.id)?.has(gear.masterId) &&
        (!context.avoidCurrentFleetEquipment ||
          !gear.currentlyEquippedBy ||
          !context.currentFleetShipIds.has(gear.currentlyEquippedBy) ||
          gear.currentlyEquippedBy === member.ship.id),
    )
  const owned = fleet.members.map(equipmentFor)
  const eligible = (types: readonly number[] | null, matches: (gear: OwnedEquipment) => boolean) =>
    fleet.members.flatMap((member, index) =>
      (!types || types.includes(member.ship.shipTypeId)) && owned[index].some(matches)
        ? [index]
        : [],
    )
  const shellChoices = combinations(
    eligible([5, 6, 8, 9, 10, 12], (gear) => gear.typeId === 18),
    shellCount,
  )
  const surfaceChoices = combinations(
    eligible([5, 6, 8, 9, 10, 12], (gear) => [18, 24, 46].includes(gear.typeId)),
    surfaceCount,
  )
  const carrierChoices = combinations(
    eligible(
      [7, 11, 18],
      (gear) => gear.antiInstallationAircraft || [8, 57, 58, 91].includes(gear.typeId),
    ),
    carrierCount,
  )
  const drumChoices = combinations(
    eligible(null, (gear) => gear.typeId === 30),
    drumCount,
  )
  const duties = shellChoices.flatMap((shellIndexes) =>
    surfaceChoices
      .filter((indexes) => indexes.every((index) => !shellIndexes.includes(index)))
      .flatMap((surfaceIndexes) =>
        carrierChoices.flatMap((carrierIndexes) =>
          drumChoices.map((drumIndexes) => ({
            shellIndexes,
            surfaceIndexes,
            carrierIndexes,
            drumIndexes,
          })),
        ),
      ),
  )

  const openingAswConstraint = route?.calculatedConstraints.find(
    (constraint) => constraint.kind === 'opening-asw',
  )
  const aswIndexes = fleet.members.flatMap((member, index) =>
    member.role === 'anti-submarine' ? [index] : [],
  )
  const minimumSlots = new Map<number, number>()
  for (const index of aswIndexes) {
    const ship = fleet.members[index].ship
    const sonar = owned[index]
      .filter((gear) => [14, 40].includes(gear.typeId))
      .sort((a, b) => b.stats.asw - a.stats.asw)[0]
    const rules =
      ship.openingAswRules.length > 0
        ? ship.openingAswRules
        : [{ kind: 'sonar', minimumAsw: ship.shipTypeId === 1 ? 60 : 100 }]
    let best = ship.slotSizes.length
    for (const rule of rules) {
      const selected = rule.kind === 'sonar' && sonar ? [sonar] : []
      if (rule.kind === 'sonar' && !sonar) continue
      const others = owned[index]
        .filter((gear) => [14, 15, 40].includes(gear.typeId) && !selected.includes(gear))
        .sort((a, b) => b.stats.asw - a.stats.asw)
      while (
        ship.stats.asw + selected.reduce((total, gear) => total + gear.stats.asw, 0) <
          rule.minimumAsw &&
        selected.length < ship.slotSizes.length &&
        others.length > 0
      )
        selected.push(others.shift()!)
      if (
        ship.stats.asw + selected.reduce((total, gear) => total + gear.stats.asw, 0) >=
        rule.minimumAsw
      ) {
        best = Math.min(best, selected.length)
      }
    }
    minimumSlots.set(index, best)
  }
  const aswCount = openingAswConstraint
    ? Math.min(openingAswConstraint.minimum, aswIndexes.length)
    : aswIndexes.length
  const aswChoices = combinations(aswIndexes, aswCount).sort(
    (a, b) =>
      a.reduce((sum, index) => sum + (minimumSlots.get(index) ?? 0), 0) -
      b.reduce((sum, index) => sum + (minimumSlots.get(index) ?? 0), 0),
  )
  const plans: LoadoutPlan[] = []
  const add = (plan: Omit<LoadoutPlan, 'key'>) => {
    const key = JSON.stringify({ ...plan, members: plan.members.map((member) => member.role) })
    if (plans.length < PLAN_LIMIT && !plans.some((item) => item.key === key))
      plans.push({ ...plan, key })
  }
  const seeds: Omit<LoadoutPlan, 'key'>[] = []
  for (const duty of duties)
    for (const selected of aswChoices) {
      seeds.push({
        ...duty,
        members: fleet.members.map((member, index) =>
          member.role === 'anti-submarine' && !selected.includes(index)
            ? { ...member, role: surfaceRole(member) }
            : member,
        ),
        styles: {},
        aswSlots: Object.fromEntries(
          selected.map((index) => [
            index,
            openingAswConstraint
              ? (minimumSlots.get(index) ?? 3)
              : Math.min(3, fleet.members[index].ship.slotSizes.length),
          ]),
        ),
        guideEquipment: true,
        disabledGuideIndexes: [],
      })
    }
  // Duty allocations come first so a single ship order cannot decide who carries scarce equipment.
  seeds.forEach(add)
  for (const seed of seeds) {
    if (aswIndexes.length > 0) {
      add({
        ...seed,
        aswSlots: Object.fromEntries(
          Object.entries(seed.aswSlots).map(([index, count]) => [
            index,
            Math.min(count + 1, fleet.members[Number(index)].ship.slotSizes.length),
          ]),
        ),
      })
      const fullAsw = Object.fromEntries(
        Object.keys(seed.aswSlots).map((index) => [
          index,
          fleet.members[Number(index)].ship.slotSizes.length,
        ]),
      )
      add({ ...seed, aswSlots: fullAsw })
      add({
        ...seed,
        aswSlots: fullAsw,
        styles: Object.fromEntries(Object.keys(fullAsw).map((index) => [index, 'asw-synergy'])),
      })
    }
    const carrierAirStyles = Object.fromEntries(
      seed.members.flatMap((member, index) =>
        member.role === 'carrier-air-superiority' && !seed.carrierIndexes.includes(index)
          ? [[index, 'air-control' as const]]
          : [],
      ),
    )
    if (Object.keys(carrierAirStyles).length) add({ ...seed, styles: carrierAirStyles })
    for (const [index, member] of seed.members.entries()) {
      if (member.role === 'carrier-air-superiority' && !seed.carrierIndexes.includes(index))
        add({ ...seed, styles: { [index]: 'air-control' } })
      if (member.role === 'main-battleship') add({ ...seed, styles: { [index]: 'surface' } })
      if (member.role === 'utility-cruiser') add({ ...seed, styles: { [index]: 'torpedo' } })
      if (member.role === 'torpedo-cruiser') add({ ...seed, styles: { [index]: 'surface' } })
      if (
        member.role === 'escort-destroyer' &&
        member.ship.shipTypeId === 2 &&
        !route?.tags.includes('anti-air-cut-in')
      ) {
        add({ ...seed, styles: { [index]: 'torpedo' } })
      }
    }
    if (
      route?.tags.some((tag) =>
        ['ise-class-zuiun-cut-in-preferred', 'opening-torpedo-preferred'].includes(tag),
      )
    ) {
      for (const [index, member] of seed.members.entries()) {
        if ([3, 10].includes(member.ship.shipTypeId))
          add({ ...seed, disabledGuideIndexes: [index] })
      }
      add({ ...seed, guideEquipment: false })
    }
  }
  return plans
}
