import type { RecommendedShipBuild } from '../types'

export const loadoutSignature = (builds: readonly RecommendedShipBuild[]): string =>
  builds
    .map(
      (build) =>
        `${build.ship.id}:${[...build.equipment, build.expansionSlot]
          .map((gear) => (gear ? `${gear.masterId}.${gear.improvement}.${gear.proficiency}` : '0'))
          .join(',')}`,
    )
    .join('|')

export const loadoutShape = (builds: readonly RecommendedShipBuild[]): string =>
  builds
    .map(
      (build) => `${build.ship.id}:${build.equipment.map((gear) => gear?.typeId ?? 0).join(',')}`,
    )
    .join('|')

/** Input is ranked. Preserve tactical alternatives before filling remaining places with item variants. */
export const selectDiverseLoadouts = <T>(
  ranked: readonly T[],
  limit: number,
  buildsFor: (item: T) => readonly RecommendedShipBuild[] = (item) =>
    item as readonly RecommendedShipBuild[],
  scopeFor: (item: T) => string = () => '',
): T[] => {
  const seen = new Set<string>()
  const unique = ranked.filter((item) => {
    const key = `${scopeFor(item)}:${loadoutSignature(buildsFor(item))}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  // Reserve half the budget for different shapes; the other half compares ship-specific equipment.
  const shapes = new Set<string>()
  const selected: T[] = []
  for (const item of unique) {
    const shape = `${scopeFor(item)}:${loadoutShape(buildsFor(item))}`
    if (shapes.has(shape)) continue
    shapes.add(shape)
    selected.push(item)
    if (selected.length >= Math.ceil(limit / 2)) break
  }
  for (const item of unique) {
    if (selected.length >= limit) break
    if (!selected.includes(item)) selected.push(item)
  }
  return selected
}
