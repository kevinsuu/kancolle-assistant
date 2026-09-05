import type {
  FleetMetrics,
  RecommendationMessage,
  RecommendationObjective,
  RecommendedShipBuild,
  RouteTemplate,
} from '../types'
import { unresolvedExternalRouteTags } from '../rules'
import { specialAttackSetupForOrderedFleet } from './special-attack'
import { hasZuiunMultiAngleAttack, isIseClassKaiNi } from './zuiun'

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
  'resource-burner': ['高速建造材主案', '高速建造材替案', '低耗替案'],
  'resource-devmat': ['開發主案', '開發替案', '兼收替案'],
}

const RESOURCE_LABELS = {
  fuel: '燃料',
  ammo: '彈藥',
  steel: '鋼材',
  bauxite: '鋁土',
} as const

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
      values: {
        routeName: route.name,
        nodes: route.nodes.length ? ` (${route.nodes.join(' → ')})` : '',
      },
    },
    {
      code: 'EQUIPMENT_INSTANCES_UNIQUE',
      message: '每件裝備均以 KC3 instance ID 分配，方案內沒有重複使用。',
    },
  ]
  const warnings: RecommendationMessage[] = []
  const emptyEquipmentCount = builds.reduce(
    (total, build) => total + build.equipment.filter((gear) => gear === null).length,
    0,
  )

  if (route.tags.includes('flagship-destroyer') && builds[0]?.ship.shipTypeId === 2) {
    reasons.push({
      code: 'FLAGSHIP_REQUIREMENT_PASSED',
      message: '已將驅逐艦配置為旗艦，符合此任務的編成條件。',
    })
  }

  if (route.tags.includes('opening-torpedo-preferred')) {
    const openingTorpedoBuild = builds.find(
      (build) => build.ship.shipTypeId === 3 && build.equipment.some((gear) => gear?.typeId === 22),
    )
    if (openingTorpedoBuild) {
      reasons.push({
        code: 'OPENING_TORPEDO_PREFERENCE_APPLIED',
        message: `${openingTorpedoBuild.ship.name} 可裝甲標的，已優先採用先制雷擊輕巡配置。`,
        values: {
          shipId: openingTorpedoBuild.ship.id,
          shipName: openingTorpedoBuild.ship.name,
        },
      })
    } else {
      warnings.push({
        code: 'OPENING_TORPEDO_PREFERENCE_UNAVAILABLE',
        message: '此方案採用一般輕巡配裝，未採用甲標的先制雷擊偏好。',
      })
    }
  }

  if (metrics.airPowerRecommended > 0 && metrics.airPower >= metrics.airPowerRecommended) {
    reasons.push({
      code: 'AIR_POWER_RECOMMENDED',
      message: `制空值 ${metrics.airPower}，已達建議值 ${metrics.airPowerRecommended}。`,
      values: { airPower: metrics.airPower, recommended: metrics.airPowerRecommended },
    })
  } else if (metrics.airPowerRecommended > 0) {
    warnings.push({
      code: 'AIR_POWER_BELOW_RECOMMENDED',
      message: `制空值 ${metrics.airPower} 未達建議值 ${metrics.airPowerRecommended}。`,
      values: { airPower: metrics.airPower, recommended: metrics.airPowerRecommended },
    })
  }

  const losMargin = metrics.los33 - metrics.losMinimum
  if (metrics.losRequired) {
    reasons.push({
      code: 'LOS_CONSTRAINT_PASSED',
      message: `33 式索敵為 ${metrics.los33.toFixed(1)}，餘裕 ${losMargin.toFixed(1)}。`,
      values: { los: metrics.los33.toFixed(1), margin: losMargin.toFixed(1) },
    })
  }
  if (metrics.losRequired && losMargin < 5) {
    warnings.push({
      code: 'LOW_LOS_MARGIN',
      message: '索敵餘裕低於 5；更換艦娘或偵察裝備後請重新產生方案。',
    })
  }
  if (metrics.openingAswRequired) {
    reasons.push({
      code: 'OASW_REQUIREMENT_PASSED',
      message: `先制對潛可成立 ${metrics.openingAswCount} 艘，已達最低 ${metrics.openingAswMinimum} 艘。`,
      values: { count: metrics.openingAswCount, minimum: metrics.openingAswMinimum },
    })
  }
  if (route.tags.includes('ise-class-zuiun-cut-in-preferred')) {
    const iseClassKaiNiBuild = builds.find((build) => isIseClassKaiNi(build.ship))
    if (iseClassKaiNiBuild && hasZuiunMultiAngleAttack(iseClassKaiNiBuild)) {
      reasons.push({
        code: 'ZUIUN_MULTI_ANGLE_ATTACK_READY',
        message: `${iseClassKaiNiBuild.ship.name} 已配置主砲與兩架瑞雲；取得航空優勢以上且瑞雲槽仍有飛機時，可發動瑞雲立體攻擊。`,
        values: { shipId: iseClassKaiNiBuild.ship.id, shipName: iseClassKaiNiBuild.ship.name },
      })
    } else if (iseClassKaiNiBuild) {
      warnings.push({
        code: 'ZUIUN_MULTI_ANGLE_ATTACK_FALLBACK',
        message: `${iseClassKaiNiBuild.ship.name} 採用一般配裝；本方案未配置可成立瑞雲立體攻擊的組合。`,
        values: { shipId: iseClassKaiNiBuild.ship.id, shipName: iseClassKaiNiBuild.ship.name },
      })
    }
  }
  const antiInstallationShellTag = route.tags.find((tag) =>
    tag.startsWith('anti-installation-type3-shells-'),
  )
  const antiInstallationShellCount = antiInstallationShellTag
    ? Number(antiInstallationShellTag.match(/(\d+)$/)?.[1] ?? 0)
    : 0
  const antiInstallationSurfaceTag = route.tags.find((tag) =>
    tag.startsWith('anti-installation-surface-gears-'),
  )
  const antiInstallationSurfaceCount = antiInstallationSurfaceTag
    ? Number(antiInstallationSurfaceTag.match(/(\d+)$/)?.[1] ?? 0)
    : 0
  const antiInstallationCarrierTag = route.tags.find((tag) =>
    tag.startsWith('anti-installation-carriers-'),
  )
  const antiInstallationCarrierCount = antiInstallationCarrierTag
    ? Number(antiInstallationCarrierTag.match(/(\d+)$/)?.[1] ?? 0)
    : 0
  if (antiInstallationShellCount > 0) {
    reasons.push({
      code: 'ANTI_INSTALLATION_REQUIREMENT_PASSED',
      message: `已為 ${antiInstallationShellCount} 艘戰艦／重巡級配置三式彈系裝備，符合此路線的對陸配置模型。`,
      values: { minimum: antiInstallationShellCount },
    })
  }
  if (antiInstallationSurfaceCount > 0) {
    reasons.push({
      code: 'ANTI_INSTALLATION_REQUIREMENT_PASSED',
      message: `已為 ${antiInstallationSurfaceCount} 艘水上艦配置三式彈系或戰車／登陸艇系裝備，符合此路線的對陸配置模型。`,
      values: { minimum: antiInstallationSurfaceCount },
    })
  }
  if (antiInstallationCarrierCount > 0) {
    reasons.push({
      code: 'ANTI_INSTALLATION_CARRIER_READY',
      message: `已讓 ${antiInstallationCarrierCount} 艘空母保有對陸攻擊能力，且未配置會阻止攻擊陸上型的普通艦爆。`,
      values: { count: antiInstallationCarrierCount },
    })
  }
  const drumCanisterCarrierTag = route.tags.find((tag) => tag.startsWith('drum-canister-carriers-'))
  const drumCanisterCarrierCount = drumCanisterCarrierTag
    ? Number(drumCanisterCarrierTag.match(/(\d+)$/)?.[1] ?? 0)
    : 0
  if (drumCanisterCarrierCount > 0) {
    reasons.push({
      code: 'DRUM_CANISTER_REQUIREMENT_PASSED',
      message: `已為 ${drumCanisterCarrierCount} 艘不同艦娘各配置一個運輸桶，符合此路線的分歧條件。`,
      values: { count: drumCanisterCarrierCount },
    })
  }
  if (route.tags.includes('special-attack-modeled')) {
    const setup = specialAttackSetupForOrderedFleet(builds)
    if (setup) {
      reasons.push({
        code: 'SPECIAL_ATTACK_READY',
        message: `已依「${setup.name}」排好艦隊站位；預定發動節點請選${setup.formation}。`,
        values: { name: setup.name, formation: setup.formation },
      })
      warnings.push({
        code: 'SPECIAL_ATTACK_SORTIE_CHECK',
        message: `出擊中只需確認：特殊砲擊尚未使用、參與艦未超過可發動損傷，並在預定節點選${setup.formation}。`,
        values: { formation: setup.formation },
      })
    }
  }

  const movedEquipmentCount = builds.reduce(
    (total, build) =>
      total +
      [...build.equipment, build.expansionSlot].filter(
        (gear) => gear?.currentlyEquippedBy && gear.currentlyEquippedBy !== build.ship.id,
      ).length,
    0,
  )
  if (movedEquipmentCount > 0) {
    warnings.push({
      code: 'EQUIPMENT_MOVEMENT_REQUIRED',
      message: `需從其他艦娘調度 ${movedEquipmentCount} 件現有裝備；系統不會自動換裝。`,
      values: { count: movedEquipmentCount },
    })
  }
  if (metrics.estimatedResourceGain !== null && metrics.estimatedNetResourceGain !== null) {
    const resourceLabel = metrics.resourceTarget ? RESOURCE_LABELS[metrics.resourceTarget] : '資源'
    reasons.push({
      code: 'RESOURCE_NET_GAIN_CALCULATED',
      message: `依路線到達率估計可取得 ${metrics.estimatedResourceGain} ${resourceLabel}，扣除同資源出擊消耗後淨收益 ${metrics.estimatedNetResourceGain}；已裝 ${metrics.landingCraftCount} 件有效大發系、${metrics.drumCount} 個運輸桶。`,
      values: {
        gain: metrics.estimatedResourceGain,
        net: metrics.estimatedNetResourceGain,
        resource: metrics.resourceTarget || 'resource',
        resourceLabel,
        landingCraft: metrics.landingCraftCount,
        drums: metrics.drumCount,
      },
    })
  } else if (route.category === 'resource') {
    warnings.push({
      code: 'RESOURCE_GAIN_NOT_CALCULATED',
      message: '此資源路線尚無完整節點收益模型；目前只比較出擊消耗，結果不代表最高淨收益。',
    })
  }
  if (emptyEquipmentCount > 0) {
    warnings.push({
      code: 'EMPTY_EQUIPMENT_SLOTS',
      message: `帳號內可裝且符合用途的裝備不足，方案仍有 ${emptyEquipmentCount} 個空槽；請勿直接照抄出擊。`,
      values: { count: emptyEquipmentCount },
    })
  }
  if (route.tags.includes('oasw') && metrics.openingAswCount === 0) {
    warnings.push({
      code: 'OASW_NOT_READY',
      message: '此路線依賴先制對潛，但目前方案沒有符合艦種門檻且已裝聲納的艦娘。',
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
  const world = Number(route.mapId.split('-')[0])
  if (route.category === 'boss' && world >= 2 && route.calculatedConstraints.length === 0) {
    warnings.push({
      code: 'COMBAT_THRESHOLDS_UNVERIFIED',
      message: '此模板已核對路線與艦種，但尚未建入完整制空／索敵硬門檻；出擊前請開啟攻略來源核對。',
    })
  }
  const externallyConfiguredTags = unresolvedExternalRouteTags(route)
  if (externallyConfiguredTags.length > 0) {
    warnings.push({
      code: 'EXTERNAL_COMBAT_SETUP_REQUIRED',
      message: `此路線另需人工設定：${externallyConfiguredTags.join('、')}；求解器尚未驗證這些條件。`,
      values: { tags: externallyConfiguredTags.join(', ') },
    })
  }
  warnings.push({
    code: 'HEURISTIC_COMBAT_SCORE',
    message:
      '適配度是規則與裝備的啟發式比較，不是勝率或通關保證；損傷、士氣、交戰形態與隨機分歧仍會影響結果。',
  })

  return { reasons, warnings }
}

export const recommendationTitle = (
  routeName: string,
  objective: RecommendationObjective,
  index: number,
): string => `${routeName} · ${RECOMMENDATION_TITLES[objective][index] ?? `方案 ${index + 1}`}`
