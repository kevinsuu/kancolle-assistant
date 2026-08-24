import type {
  FleetMetrics,
  RecommendationMessage,
  RecommendationObjective,
  RecommendedShipBuild,
  RouteTemplate,
} from '../types'

const RECOMMENDATION_TITLES: Readonly<Record<RecommendationObjective, readonly string[]>> = {
  balanced: ['均衡主案', '穩定替案', '調度替案'],
  'boss-clear': ['斬殺主案', '火力替案', '制空替案'],
  'low-cost': ['節約主案', '低耗替案', '保守替案'],
  leveling: ['育成主案', '低耗育成', '替代育成'],
  'resource-fuel': ['燃料主案', '燃料替案', '低耗替案'],
  'resource-ammo': ['彈藥主案', '彈藥替案', '低耗替案'],
  'resource-steel': ['鋼材主案', '鋼材替案', '低耗替案'],
  'resource-bauxite': ['鋁土主案', '鋁土替案', '低耗替案'],
  'resource-bucket': ['水桶主案', '水桶替案', '兼收替案'],
  'resource-devmat': ['開發主案', '開發替案', '兼收替案'],
}

export const recommendationMessages = (
  builds: readonly RecommendedShipBuild[],
  metrics: FleetMetrics,
  route: RouteTemplate,
): {
  readonly reasons: readonly RecommendationMessage[]
  readonly warnings: readonly RecommendationMessage[]
} => {
  const reasons: RecommendationMessage[] = [
    {
      code: 'ROUTE_FIXED_COMPOSITION',
      message: `採用「${route.name}」${route.nodes.length ? `（${route.nodes.join(' → ')}）` : ''}，艦種配置符合資料規則。`,
    },
    {
      code: 'EQUIPMENT_INSTANCES_UNIQUE',
      message: '每件裝備均以 KC3 instance ID 分配，方案內沒有重複使用。',
    },
  ]
  const warnings: RecommendationMessage[] = []

  if (metrics.airPowerRequired && metrics.airPower >= metrics.airPowerRecommended) {
    reasons.push({
      code: 'AIR_POWER_RECOMMENDED',
      message: `制空值 ${metrics.airPower}，已達建議值 ${metrics.airPowerRecommended}。`,
    })
  } else if (metrics.airPowerRequired) {
    warnings.push({
      code: 'AIR_POWER_BELOW_RECOMMENDED',
      message: `制空值 ${metrics.airPower} 通過最低值，但未達建議值 ${metrics.airPowerRecommended}。`,
    })
  }

  const losMargin = metrics.los33 - metrics.losMinimum
  if (metrics.losRequired) {
    reasons.push({
      code: 'LOS_CONSTRAINT_PASSED',
      message: `33 式索敵為 ${metrics.los33.toFixed(1)}，餘裕 ${losMargin.toFixed(1)}。`,
    })
  }
  if (metrics.losRequired && losMargin < 5) {
    warnings.push({
      code: 'LOW_LOS_MARGIN',
      message: '索敵餘裕低於 5；更換艦娘或偵察裝備後請重新產生方案。',
    })
  }

  const movedEquipmentCount = builds.reduce(
    (total, build) =>
      total +
      build.equipment.filter(
        (gear) => gear?.currentlyEquippedBy && gear.currentlyEquippedBy !== build.ship.id,
      ).length,
    0,
  )
  if (movedEquipmentCount > 0) {
    warnings.push({
      code: 'EQUIPMENT_MOVEMENT_REQUIRED',
      message: `需從其他艦娘調度 ${movedEquipmentCount} 件現有裝備；系統不會自動換裝。`,
    })
  }
  if (route.tags.includes('random-routing') || route.tags.some((tag) => tag.includes('routing-'))) {
    warnings.push({
      code: 'ROUTE_NOT_GUARANTEED',
      message: '此方案含機率分歧，結果頁已保留資料來源標記。',
    })
  }
  if (route.metadata.confidence === 'experimental') {
    warnings.push({
      code: 'EXPERIMENTAL_ROUTE',
      message: '此路線仍屬新海域／實驗資料，出擊前請再次核對最新攻略。',
    })
  }
  warnings.push({
    code: 'HEURISTIC_COMBAT_SCORE',
    message: '火力與消耗為啟發式評估，不是完整戰鬥模擬。',
  })

  return { reasons, warnings }
}

export const recommendationTitle = (
  routeName: string,
  objective: RecommendationObjective,
  index: number,
): string => `${routeName} · ${RECOMMENDATION_TITLES[objective][index] ?? `方案 ${index + 1}`}`
