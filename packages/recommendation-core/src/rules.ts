import sourceMapData from './rules/normal/source-map-recommendations.json'
import strategyOverlayData from './rules/normal/strategy-overlays.json'
import verifiedBossFleetData from './rules/normal/verified-boss-fleets.json'
import { RECOMMENDATION_OBJECTIVES } from './types'
import type {
  CalculatedConstraint,
  FleetConstraint,
  MapOption,
  RecommendationObjective,
  RouteTemplate,
  RouteResourceProfile,
  StrategyCategory,
} from './types'

type UnknownRecord = Record<string, unknown>

const BASIC_OBJECTIVES: readonly RecommendationObjective[] = ['balanced', 'boss-clear', 'low-cost']
const STRATEGY_CATEGORIES: readonly StrategyCategory[] = ['boss', 'leveling', 'resource', 'gimmick']

export const EXTERNALLY_CONFIGURED_ROUTE_TAGS = [
  'anti-installation',
  'boss-support',
  'drum-canister-required',
  'elite-torpedo-squadron-command-facility',
  'historical-bonus',
  'lbas',
  'lbas-proficiency',
  'pt',
  'rocket-barrage-required',
  'smoke-screen',
  'special-attack',
] as const

const MODELED_EXTERNAL_ROUTE_TAGS: Readonly<
  Partial<Record<(typeof EXTERNALLY_CONFIGURED_ROUTE_TAGS)[number], string>>
> = {
  'anti-installation': 'anti-installation-modeled',
  'drum-canister-required': 'drum-canister-modeled',
  'special-attack': 'special-attack-modeled',
}

export const unresolvedExternalRouteTags = (route: RouteTemplate): readonly string[] =>
  EXTERNALLY_CONFIGURED_ROUTE_TAGS.filter(
    (tag) =>
      route.tags.includes(tag) && !route.tags.includes(MODELED_EXTERNAL_ROUTE_TAGS[tag] ?? ''),
  )

const guidePriority = (route: RouteTemplate): number =>
  route.tags.includes('guide-primary') ? 0 : route.tags.includes('guide-alternative') ? 1 : 2

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const readString = (record: UnknownRecord, key: string, fallback?: string): string => {
  const value = record[key]
  if (typeof value === 'string' && value.length > 0) return value
  if (fallback !== undefined) return fallback
  throw new Error(`normal map catalog: ${key} 必須是非空字串`)
}

const readNumber = (record: UnknownRecord, key: string, fallback?: number): number => {
  const value = record[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (fallback !== undefined) return fallback
  throw new Error(`normal map catalog: ${key} 必須是有限數字`)
}

const readNumberArray = (value: unknown, key: string): readonly number[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'number')) {
    throw new Error(`normal map catalog: ${key} 必須是數字陣列`)
  }
  return value
}

const readStringArray = (value: unknown, key: string): readonly string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`normal map catalog: ${key} 必須是字串陣列`)
  }
  return value
}

const parseSourceConstraint = (value: unknown): FleetConstraint => {
  if (!isRecord(value)) throw new Error('normal map catalog: fleet constraint 必須是物件')
  const type = readString(value, 'type')
  if (type === 'ShipCount') {
    return { kind: 'ship-count', exact: readNumber(value, 'value') }
  }
  if (type === 'ShipTypeCount') {
    return {
      kind: 'ship-type-count',
      shipTypeIds: readNumberArray(value.stypes, 'stypes'),
      min: readNumber(value, 'value'),
    }
  }
  if (type === 'ExactShipTypeCount') {
    return {
      kind: 'ship-type-count',
      shipTypeIds: readNumberArray(value.stypes, 'stypes'),
      exact: readNumber(value, 'value'),
    }
  }
  if (type === 'MaxShipTypeCount') {
    return {
      kind: 'ship-type-count',
      shipTypeIds: readNumberArray(value.stypes, 'stypes'),
      max: readNumber(value, 'value'),
    }
  }
  if (type === 'ContainsShipName') {
    return {
      kind: 'specific-ship-name',
      names: readStringArray(value.names, 'names'),
      min: readNumber(value, 'count'),
    }
  }
  throw new Error(`normal map catalog: 未支援 constraint ${type}`)
}

const parseCalculatedConstraint = (value: unknown): CalculatedConstraint => {
  if (!isRecord(value)) throw new Error('normal map catalog: calculated constraint 必須是物件')
  const kind = readString(value, 'kind')
  if (kind === 'air-power') {
    const minimum = readNumber(value, 'minimum')
    return {
      kind,
      minimum,
      recommended: readNumber(value, 'recommended', minimum),
    }
  }
  if (kind === 'los') {
    return {
      kind,
      formula: '33',
      coefficient: readNumber(value, 'coefficient'),
      minimum: readNumber(value, 'minimum'),
    }
  }
  if (kind === 'opening-asw') {
    return { kind, minimum: readNumber(value, 'minimum') }
  }
  throw new Error(`normal map catalog: 未支援 calculated constraint ${kind}`)
}

const parseResourceProfile = (value: unknown): RouteResourceProfile => {
  if (!isRecord(value)) throw new Error('normal map catalog: resourceProfile 必須是物件')
  const record = value
  const target = readString(record, 'target')
  if (!['fuel', 'ammo', 'steel', 'bauxite'].includes(target)) {
    throw new Error(`normal map catalog: resourceProfile.target invalid: ${target}`)
  }
  const reachRate = readNumber(record, 'reachRate')
  const fuelCostRate = readNumber(record, 'fuelCostRate')
  const ammoCostRate = readNumber(record, 'ammoCostRate')
  if (reachRate <= 0 || reachRate > 1 || fuelCostRate < 0 || ammoCostRate < 0) {
    throw new Error('normal map catalog: resourceProfile rates invalid')
  }
  return {
    target: target as RouteResourceProfile['target'],
    reachRate,
    averageBaseGain: readNumber(record, 'averageBaseGain'),
    landingCraftBonus: readNumber(record, 'landingCraftBonus'),
    drumBonus: readNumber(record, 'drumBonus'),
    fuelCostRate,
    ammoCostRate,
  }
}

const routeNodesFromDescription = (description: string): readonly string[] => {
  const match = description.match(/[A-Z][A-Z0-9]*(?:→[A-Z][A-Z0-9]*)+/)
  return match ? match[0].split('→') : []
}

const mapGuideSource = (mapId: string): string => {
  const [world] = mapId.split('-')
  return `https://en.kancollewiki.net/World_${world}/${mapId}`
}

const tagsFromDescription = (description: string): readonly string[] => {
  const tags: string[] = []
  if (description.includes('索敵')) tags.push('los')
  if (description.includes('高速+')) tags.push('fast+')
  else if (description.includes('高速')) tags.push('fast')
  if (description.includes('対潜')) tags.push('asw')
  if (description.includes('ランダム')) tags.push('random-routing')
  return tags
}

const sourceRoutes = (sourceMapData as unknown[]).flatMap((mapValue) => {
  if (!isRecord(mapValue) || !Array.isArray(mapValue.routes)) {
    throw new Error('normal map source data shape invalid')
  }
  const mapId = readString(mapValue, 'area')
  return mapValue.routes.map((routeValue, index): RouteTemplate => {
    if (!isRecord(routeValue) || !Array.isArray(routeValue.fleet)) {
      throw new Error(`normal map ${mapId}: route shape invalid`)
    }
    const description = readString(routeValue, 'desc')
    const randomRouting = description.includes('ランダム')
    return {
      id: `source-${mapId}-${index + 1}`,
      mapId,
      name: description.split('(')[0].trim(),
      nodes: routeNodesFromDescription(description),
      description,
      category: 'boss',
      objectives: BASIC_OBJECTIVES,
      stableBoss: mapId !== '1-1' && !randomRouting,
      tags: tagsFromDescription(description),
      fleetConstraints: routeValue.fleet.map(parseSourceConstraint),
      calculatedConstraints: [],
      metadata: {
        source: [
          'https://github.com/shichiria/kancolle-browser/blob/main/src-tauri/data/map_recommendations.json',
          mapGuideSource(mapId),
        ],
        confidence: 'community',
        lastVerified: '2026-03-02',
        ruleVersion: '2026.03.02-source',
      },
    }
  })
})

const overlayCatalogData = [
  ...(verifiedBossFleetData as unknown[]),
  ...(strategyOverlayData as unknown[]),
]

const replacedSourceMapIds = new Set(
  overlayCatalogData.flatMap((mapValue) => {
    if (!isRecord(mapValue) || mapValue.replaceSourceRoutes !== true) return []
    return [readString(mapValue, 'area')]
  }),
)

const overlayRoutes = overlayCatalogData.flatMap((mapValue) => {
  if (!isRecord(mapValue) || !Array.isArray(mapValue.routes)) {
    throw new Error('normal map overlay data shape invalid')
  }
  const mapId = readString(mapValue, 'area')
  const mapSources =
    mapValue.sources === undefined ? [] : readStringArray(mapValue.sources, 'sources')
  return mapValue.routes.map((routeValue): RouteTemplate => {
    if (!isRecord(routeValue) || !Array.isArray(routeValue.fleet)) {
      throw new Error(`normal map overlay ${mapId}: route shape invalid`)
    }
    const category = readString(routeValue, 'category')
    if (!STRATEGY_CATEGORIES.includes(category as StrategyCategory)) {
      throw new Error(`normal map overlay ${mapId}: category invalid`)
    }
    const objectives = readStringArray(routeValue.objectives, 'objectives')
    if (
      !objectives.every((item) =>
        RECOMMENDATION_OBJECTIVES.includes(item as RecommendationObjective),
      )
    ) {
      throw new Error(`normal map overlay ${mapId}: objective invalid`)
    }
    const tags = readStringArray(routeValue.tags, 'tags')
    const isNewMap = tags.includes('new-map')
    const isVerifiedGuide = tags.includes('verified-guide')
    const strategySource =
      category === 'resource'
        ? 'https://en.kancollewiki.net/Resource_Farming'
        : category === 'leveling'
          ? 'https://en.kancollewiki.net/Tutorial:Leveling'
          : mapGuideSource(mapId)
    const providedSources =
      routeValue.sources === undefined
        ? [strategySource]
        : readStringArray(routeValue.sources, 'sources')
    const sources = Array.from(new Set([mapGuideSource(mapId), ...mapSources, ...providedSources]))
    const lastVerified =
      typeof routeValue.lastVerified === 'string'
        ? routeValue.lastVerified
        : isNewMap
          ? '2026-08-26'
          : '2026-08-24'
    return {
      id: readString(routeValue, 'id'),
      mapId,
      name: readString(routeValue, 'name'),
      nodes: readStringArray(routeValue.nodes, 'nodes'),
      description: readString(routeValue, 'desc'),
      category: category as StrategyCategory,
      objectives: objectives as RecommendationObjective[],
      stableBoss: routeValue.stableBoss === true,
      phase: typeof routeValue.phase === 'string' ? routeValue.phase : undefined,
      tags,
      fleetConstraints: routeValue.fleet.map(parseSourceConstraint),
      calculatedConstraints: Array.isArray(routeValue.calculated)
        ? routeValue.calculated.map(parseCalculatedConstraint)
        : [],
      resourceProfile:
        routeValue.resourceProfile === undefined
          ? undefined
          : parseResourceProfile(routeValue.resourceProfile),
      metadata: {
        source: sources,
        confidence: isNewMap ? 'experimental' : isVerifiedGuide ? 'verified' : 'community',
        lastVerified,
        ruleVersion: isNewMap
          ? `${lastVerified.replace(/-/g, '.')}-5-6`
          : `${lastVerified.replace(/-/g, '.')}-${isVerifiedGuide ? 'verified-guide' : 'overlay'}`,
      },
    }
  })
})

const routeIds = new Set<string>()
export const NORMAL_MAP_ROUTES: readonly RouteTemplate[] = [
  ...overlayRoutes,
  ...sourceRoutes.filter((route) => !replacedSourceMapIds.has(route.mapId)),
].filter((route) => {
  if (routeIds.has(route.id)) throw new Error(`normal map duplicate route id: ${route.id}`)
  routeIds.add(route.id)
  return true
})

export const automaticRouteBlockers = (route: RouteTemplate): readonly string[] => {
  const blockers: string[] = []
  const world = Number(route.mapId.split('-')[0])
  if (route.category === 'boss' && !route.stableBoss) blockers.push('unstable-boss-route')
  if (route.metadata.confidence === 'experimental') blockers.push('experimental')
  if (route.tags.includes('random-routing') || route.tags.some((tag) => tag.includes('routing-'))) {
    blockers.push('random-routing')
  }
  if (unresolvedExternalRouteTags(route).length > 0) {
    blockers.push('manual-combat-setup')
  }
  if (route.tags.includes('oasw')) {
    const openingAswModeled = route.calculatedConstraints.some(
      (constraint) => constraint.kind === 'opening-asw',
    )
    if (!openingAswModeled) blockers.push('opening-asw-unmodeled')
  }
  if (route.category === 'boss' && world >= 2 && route.calculatedConstraints.length === 0) {
    blockers.push('combat-thresholds-unmodeled')
  }
  return blockers
}

export const isAutomaticRouteReady = (route: RouteTemplate): boolean =>
  automaticRouteBlockers(route).length === 0

const mapNames = new Map<string, string>()
;(sourceMapData as unknown[]).forEach((value) => {
  if (!isRecord(value)) return
  mapNames.set(readString(value, 'area'), readString(value, 'name'))
})
overlayCatalogData.forEach((value) => {
  if (!isRecord(value)) return
  const mapId = readString(value, 'area')
  if (typeof value.name === 'string') mapNames.set(mapId, value.name)
})

export const getRouteTemplates = (
  mapId: string,
  objective: RecommendationObjective,
  routeId?: string,
): readonly RouteTemplate[] => {
  const matching = NORMAL_MAP_ROUTES.filter(
    (route) =>
      route.mapId === mapId &&
      route.objectives.includes(objective) &&
      (!routeId || route.id === routeId),
  )
  if (routeId) return matching
  const eligible = matching.filter(isAutomaticRouteReady)
  const comparable = eligible.length > 0 ? eligible : matching
  return [...comparable].sort((left, right) => guidePriority(left) - guidePriority(right))
}

export const getRouteTemplate = (
  mapId: string,
  objective: RecommendationObjective = 'balanced',
  routeId?: string,
): RouteTemplate | null => getRouteTemplates(mapId, objective, routeId)[0] ?? null

export const getMapOptions = (): readonly MapOption[] =>
  Array.from(mapNames.entries())
    .map(([id, name]) => {
      const routes = NORMAL_MAP_ROUTES.filter((route) => route.mapId === id)
      return {
        id,
        name,
        objectives: Array.from(new Set(routes.flatMap((route) => route.objectives))),
        routeCount: routes.length,
        stableBossRouteCount: routes.filter((route) => route.stableBoss).length,
        routes: routes.map((route) => ({
          id: route.id,
          name: route.name,
          phase: route.phase,
          category: route.category,
          objectives: route.objectives,
          nodes: route.nodes,
          stableBoss: route.stableBoss,
          automaticReady: isAutomaticRouteReady(route),
          description: route.description,
          confidence: route.metadata.confidence,
        })),
      }
    })
    .sort((left, right) => {
      const [leftWorld, leftMap] = left.id.split('-').map(Number)
      const [rightWorld, rightMap] = right.id.split('-').map(Number)
      return leftWorld - rightWorld || leftMap - rightMap
    })
