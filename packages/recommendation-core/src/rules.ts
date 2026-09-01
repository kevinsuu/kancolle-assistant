import strategyOverlayData from './rules/normal/strategy-overlays'
import verifiedBossFleetData from './rules/normal/verified-boss-fleets'
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
  'fastest-radar-setup',
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
    const required = value.required
    if (required !== undefined && typeof required !== 'boolean') {
      throw new Error('normal map catalog: air-power.required 必須是布林值')
    }
    return {
      kind,
      minimum,
      recommended: readNumber(value, 'recommended', minimum),
      ...(required === undefined ? {} : { required }),
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

const mapGuideSource = (mapId: string): string => {
  const [world] = mapId.split('-')
  return `https://en.kancollewiki.net/World_${world}/${mapId}`
}

const KCWIKI_WORLD_NAMES: Readonly<Record<string, string>> = {
  '1': '镇守府海域',
  '2': '南西群岛海域',
  '3': '北方海域',
  '4': '西方海域',
  '5': '南方海域',
  '6': '中部海域',
  '7': '南西海域',
}

const zhKcwikiGuideSource = (mapId: string): string => {
  const [world] = mapId.split('-')
  const worldName = KCWIKI_WORLD_NAMES[world]
  return worldName
    ? `https://zh.kcwiki.cn/wiki/${encodeURIComponent(worldName)}/${mapId}`
    : `https://zh.kcwiki.cn/wiki/${mapId}`
}

const USER_NORMAL_MAP_REFERENCE_SOURCES = [
  'https://forum.gamer.com.tw/C.php?bsn=24698&snA=14238',
] as const

const YUIKANCOLLE_EO_GUIDE_SOURCES: Readonly<Record<string, string>> = {
  '2-5': 'https://yuikancolle.blog.fc2.com/blog-entry-182.html',
  '3-5': 'https://yuikancolle.blog.fc2.com/blog-entry-183.html',
  '4-5': 'https://yuikancolle.blog.fc2.com/blog-entry-184.html',
  '5-5': 'https://yuikancolle.blog.fc2.com/blog-entry-185.html',
  '5-6': 'https://yuikancolle.blog.fc2.com/blog-entry-258.html',
  '6-5': 'https://yuikancolle.blog.fc2.com/blog-entry-186.html',
  '7-5': 'https://yuikancolle.blog.fc2.com/blog-entry-187.html',
}

const NORMAL_MAP_NAMES: Readonly<Record<string, string>> = {
  '1-1': '鎮守府正面海域',
  '1-2': '南西諸島沖',
  '1-3': '製油所地帯沿岸',
  '1-4': '南西諸島防衛線',
  '1-5': '鎮守府近海',
  '1-6': '鎮守府近海航路',
  '2-1': 'カムラン半島',
  '2-2': 'バシー海峡',
  '2-3': '東部オリョール海',
  '2-4': '沖ノ島海域',
  '2-5': '沖ノ島沖',
  '3-1': 'モーレイ海哨戒',
  '3-2': 'キス島撤退作戦',
  '3-3': 'アルフォンシーノ方面',
  '3-4': '北方海域艦隊決戦',
  '3-5': '北方AL海域',
  '4-1': 'ジャム島攻略作戦',
  '4-2': 'カレー洋制圧戦',
  '4-3': 'リランカ島',
  '4-4': 'カスガダマ島',
  '4-5': '深海東洋艦隊漸減作戦',
  '5-1': '南方海域進出作戦',
  '5-2': '珊瑚諸島沖海戦',
  '5-3': 'サブ島沖海域',
  '5-4': 'サーモン海域',
  '5-5': 'サーモン海域北方',
  '5-6': 'ラバウル方面海域',
  '6-1': '中部海域哨戒線',
  '6-2': 'MS諸島沖',
  '6-3': 'グアノ環礁沖海域',
  '6-4': '離島再攻略作戦',
  '6-5': '空母機動部隊迎撃戦',
  '7-1': 'ブルネイ泊地沖',
  '7-2': 'タウイタウイ泊地沖',
  '7-3': 'ペナン島沖',
  '7-4': '昭南本土航路',
  '7-5': 'ジャワ島沖',
}

const guideSourcesForMap = (mapId: string): readonly string[] => {
  const eoGuideSource = YUIKANCOLLE_EO_GUIDE_SOURCES[mapId]
  return [
    zhKcwikiGuideSource(mapId),
    ...USER_NORMAL_MAP_REFERENCE_SOURCES,
    ...(eoGuideSource ? [eoGuideSource] : []),
    mapGuideSource(mapId),
  ]
}

const overlayCatalogData = [
  ...(verifiedBossFleetData as unknown[]),
  ...(strategyOverlayData as unknown[]),
]

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
    const routeId = readString(routeValue, 'id')
    if (mapSources.length === 0 && routeValue.sources === undefined) {
      throw new Error(`normal map overlay ${mapId}: ${routeId} 缺少參考來源`)
    }
    const routeSources =
      routeValue.sources === undefined ? [] : readStringArray(routeValue.sources, 'sources')
    const providedSources = routeSources.length === 0 ? [strategySource] : routeSources
    const sources = Array.from(
      new Set([...guideSourcesForMap(mapId), ...mapSources, ...providedSources]),
    )
    const routeGuideSources = Array.from(
      new Set(routeSources.length > 0 ? routeSources : mapSources),
    )
    const lastVerified =
      typeof routeValue.lastVerified === 'string'
        ? routeValue.lastVerified
        : isNewMap
          ? '2026-08-26'
          : '2026-08-24'
    return {
      id: routeId,
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
        guideSources: routeGuideSources,
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
export const NORMAL_MAP_ROUTES: readonly RouteTemplate[] = overlayRoutes.filter((route) => {
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
overlayCatalogData.forEach((value) => {
  if (!isRecord(value)) return
  const mapId = readString(value, 'area')
  const name =
    typeof value.name === 'string' && value.name.length > 0
      ? value.name
      : NORMAL_MAP_NAMES[mapId] || mapId
  if (!mapNames.has(mapId) || name !== mapId) mapNames.set(mapId, name)
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
      const routes = NORMAL_MAP_ROUTES.filter(
        (route) => route.mapId === id && route.metadata.guideSources.length > 0,
      )
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
          sources: route.metadata.guideSources,
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
