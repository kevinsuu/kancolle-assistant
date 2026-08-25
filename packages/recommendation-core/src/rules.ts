import sourceMapData from './rules/normal/source-map-recommendations.json'
import strategyOverlayData from './rules/normal/strategy-overlays.json'
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

const replacedSourceMapIds = new Set(
  (strategyOverlayData as unknown[]).flatMap((mapValue) => {
    if (!isRecord(mapValue) || mapValue.replaceSourceRoutes !== true) return []
    return [readString(mapValue, 'area')]
  }),
)

const overlayRoutes = (strategyOverlayData as unknown[]).flatMap((mapValue) => {
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
      typeof routeValue.lastVerified === 'string' ? routeValue.lastVerified : '2026-08-24'
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
        confidence: isNewMap ? 'experimental' : 'community',
        lastVerified,
        ruleVersion: isNewMap ? '2026.08.24-5-6' : `${lastVerified.replace(/-/g, '.')}-overlay`,
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

const mapNames = new Map<string, string>()
;(sourceMapData as unknown[]).forEach((value) => {
  if (!isRecord(value)) return
  mapNames.set(readString(value, 'area'), readString(value, 'name'))
})
;(strategyOverlayData as unknown[]).forEach((value) => {
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
  const stableBossRequired = mapId.endsWith('-5') && BASIC_OBJECTIVES.includes(objective)
  const filtered = stableBossRequired ? matching.filter((route) => route.stableBoss) : matching
  return filtered.length > 0 ? filtered : matching
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
