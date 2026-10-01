import { findQuestSynergies, questArsenalProfileSource } from './quest-synergy'
import { hasQuestObjective, questObjectiveMapIds } from './quest-objective-synergy'

export const QUEST_RECOMMENDATION_RANKING_VERSION = 19

const RECOMMENDATION_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'oneTime']
const RECOMMENDATION_PERIOD_SET = new Set(RECOMMENDATION_PERIODS)
const REPEATABLE_PERIOD_SET = new Set(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
const NORMAL_MAP_LAST_NUMBER = { 1: 6, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5 }
export const QUEST_CHAPTER_KEYS = [
  'world1',
  'world2',
  'world3',
  'world4',
  'world5',
  'world6',
  'world7',
  'crossWorld',
  'other',
]

const normalizeMapText = (value) =>
  String(value || '')
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .replace(/[－–—−]/g, '-')

export const extractNormalMapIds = (...values) => {
  const mapIds = new Set()
  values.forEach((value) => {
    const text = normalizeMapText(value)
    for (const match of text.matchAll(/(?:^|[^\d])([1-7])\s*-\s*([1-6])(?=$|[^\d])/g)) {
      const world = Number(match[1])
      const map = Number(match[2])
      if (map <= NORMAL_MAP_LAST_NUMBER[world]) mapIds.add(`${world}-${map}`)
    }
  })
  return [...mapIds].sort((left, right) => {
    const [leftWorld, leftMap] = left.split('-').map(Number)
    const [rightWorld, rightMap] = right.split('-').map(Number)
    return leftWorld - rightWorld || leftMap - rightMap
  })
}

export const questChapterKeyFromMapIds = (mapIds = []) => {
  const worlds = [
    ...new Set(
      mapIds
        .map((mapId) => Number(String(mapId).split('-')[0]))
        .filter((world) => world >= 1 && world <= 7),
    ),
  ]
  if (worlds.length === 0) return 'other'
  return worlds.length === 1 ? `world${worlds[0]}` : 'crossWorld'
}

const REWARD_CATEGORY_PRIORITIES = {
  medalBlueprint: 4,
  actionReport: 3,
  screws: 2,
  other: 1,
}

const REWARD_PATTERNS = {
  blueprint: /\bBlueprints?\b|改装設計図|改裝設計圖|改装设计图/iu,
  medal: /\bMedals?\b|勲章|勳章|勋章/iu,
  actionReport: /\b(?:Action|Combat) Reports?\b|戦闘詳報|戰鬥詳報|战斗详报/iu,
  screws: /\bScrews?\b|改修資材|改修资材/iu,
  skilledCrew: /Skilled Crew|熟練搭乗員|熟練搭乘員|熟练搭乘员/iu,
  newAviationMaterial: /New Aviation (?:Armament )?Material|新型航空兵装資材|新型航空兵裝資材/iu,
  daihatsu: /Daihatsu|大発動艇|大發動艇/iu,
  newRocketMaterial: /New Rocket Development Material|新型噴進装備開発資材|新型噴進裝備開發資材/iu,
  newGunArmamentMaterial: /New Gun Armament Material|新型砲熕兵装資材|新型砲熕兵裝資材/iu,
  newArmamentMaterial: /New Armament Material|新型兵装資材|新型兵裝資材/iu,
  catapult: /Prototype Flight Deck Catapult|試製甲板カタパルト/iu,
  reinforcementExpansion: /Reinforcement Expansion|補強増設|补强增设/iu,
  newAviationBlueprint: /New Aircraft Design Blueprint|新型航空機設計図|新型航空机设计图/iu,
  overseasEquipmentTech: /Overseas (?:Ship )?Latest Technology|海外艦最新技術|海外舰最新技术/iu,
  choice: /Selectable Reward|Choice Reward|選択報酬|選擇獎勵|选择奖励/iu,
}

const QUEST_GUIDANCE = {
  256: { tier: 'optional', reasonKeys: ['poorValue'] },
  663: { tier: 'conditional', steelCost: 18_000, reasonKeys: ['steelCost'] },
  872: { tier: 'optional', reasonKeys: ['highCost'] },
  873: { reasonKeys: ['stopLossChain'] },
  875: {
    requiredShipGroups: [
      { masterIds: [543, 743], key: 'naganamiKaiNi' },
      { masterIds: [344, 345, 359, 569, 578, 649, 744], key: 'desdivThirtyOnePartner' },
    ],
    reasonKeys: ['stopLossChain'],
  },
  888: { tier: 'conditional', reasonKeys: ['highCost'] },
  893: { tier: 'optional', reasonKeys: ['highSortieCount'] },
  903: {
    requiredShipGroups: [{ masterIds: [488, 622, 623, 624], key: 'yuubariOrYuraKaiNi' }],
    reasonKeys: ['highCost'],
  },
}

const ADVICE_PRIORITIES = {
  unavailable: 0,
  optional: 1,
  conditional: 2,
  recommended: 3,
  priority: 4,
  highest: 5,
}

const BASE_ADVICE_BY_REWARD = {
  medalBlueprint: 'highest',
  actionReport: 'priority',
  screws: 'recommended',
  other: 'optional',
}

export const classifyQuestRewards = ({ memo = '', rewardConsumables = [] } = {}) => {
  const rewardText = String(memo)
  const structuredConsumableCount = (index) => {
    const count = Number(rewardConsumables[index] || 0)
    return Math.max(0, Number.isFinite(count) ? Math.trunc(count) : 0)
  }
  // KC3 stores these as ibuild, bucket, devmat, screws. Keep the indices here rather than
  // inferring them from localized reward text so every structured consumable remains visible.
  const instantBuildCount = structuredConsumableCount(0)
  const bucketCount = structuredConsumableCount(1)
  const devmatCount = structuredConsumableCount(2)
  const screwCount = structuredConsumableCount(3)
  const hasBlueprint = REWARD_PATTERNS.blueprint.test(rewardText)
  const hasMedal = REWARD_PATTERNS.medal.test(rewardText)
  const hasActionReport = REWARD_PATTERNS.actionReport.test(rewardText)
  const hasScrews = screwCount > 0 || REWARD_PATTERNS.screws.test(rewardText)
  const materialKeys = [
    ...(REWARD_PATTERNS.skilledCrew.test(rewardText) ? ['skilledCrew'] : []),
    ...(REWARD_PATTERNS.newAviationMaterial.test(rewardText) ? ['newAviationMaterial'] : []),
    ...(REWARD_PATTERNS.daihatsu.test(rewardText) ? ['daihatsu'] : []),
    ...(REWARD_PATTERNS.newRocketMaterial.test(rewardText) ? ['newRocketMaterial'] : []),
    ...(REWARD_PATTERNS.newGunArmamentMaterial.test(rewardText) ? ['newGunArmamentMaterial'] : []),
    ...(REWARD_PATTERNS.newArmamentMaterial.test(rewardText) ? ['newArmamentMaterial'] : []),
    ...(REWARD_PATTERNS.catapult.test(rewardText) ? ['catapult'] : []),
    ...(REWARD_PATTERNS.reinforcementExpansion.test(rewardText) ? ['reinforcementExpansion'] : []),
    ...(REWARD_PATTERNS.newAviationBlueprint.test(rewardText) ? ['newAviationBlueprint'] : []),
    ...(REWARD_PATTERNS.overseasEquipmentTech.test(rewardText) ? ['overseasEquipmentTech'] : []),
  ]
  const isChoiceReward = REWARD_PATTERNS.choice.test(rewardText)

  const details = {
    hasBlueprint,
    hasMedal,
    hasActionReport,
    hasScrews,
    instantBuildCount,
    bucketCount,
    devmatCount,
    screwCount,
    materialKeys,
    isChoiceReward,
    valuable: hasBlueprint || hasMedal || hasActionReport || hasScrews || materialKeys.length > 0,
  }

  if (hasBlueprint || hasMedal) {
    return {
      category: 'medalBlueprint',
      priority: REWARD_CATEGORY_PRIORITIES.medalBlueprint,
      ...details,
    }
  }
  if (hasActionReport) {
    return {
      category: 'actionReport',
      priority: REWARD_CATEGORY_PRIORITIES.actionReport,
      ...details,
    }
  }
  if (hasScrews) {
    return {
      category: 'screws',
      priority: REWARD_CATEGORY_PRIORITIES.screws,
      ...details,
    }
  }
  return {
    category: 'other',
    priority: REWARD_CATEGORY_PRIORITIES.other,
    ...details,
  }
}

const baseAdviceForReward = (reward) =>
  reward.category === 'other' && reward.valuable
    ? 'recommended'
    : BASE_ADVICE_BY_REWARD[reward.category]

const evaluateQuestGuidance = (quest, reward, account, hasDownstreamValue) => {
  const rule = QUEST_GUIDANCE[Number(quest.id)] || {}
  const shipMasterIds = new Set((account?.shipMasterIds || []).map(Number))
  const accountAvailable = account?.status === 'available'
  const missingShipKeys = accountAvailable
    ? (rule.requiredShipGroups || [])
        .filter(({ masterIds }) => !masterIds.some((id) => shipMasterIds.has(id)))
        .map(({ key }) => key)
    : []
  const steel = Number(account?.steel)
  const hasSynchronizedSteel = account?.steel !== null && account?.steel !== undefined
  const insufficientSteel =
    Number.isFinite(rule.steelCost) &&
    accountAvailable &&
    hasSynchronizedSteel &&
    Number.isFinite(steel) &&
    steel < rule.steelCost
  const feasibility =
    missingShipKeys.length > 0 || insufficientSteel
      ? 'unavailable'
      : accountAvailable
        ? 'available'
        : 'unknown'
  const tier =
    feasibility === 'unavailable' ? 'unavailable' : rule.tier || baseAdviceForReward(reward)
  const reasonKeys = [
    ...(rule.reasonKeys || []),
    ...(reward.isChoiceReward ? ['choiceReward'] : []),
    ...(hasDownstreamValue ? ['downstreamValue'] : []),
    ...missingShipKeys.map((key) => `missingShip:${key}`),
    ...(insufficientSteel ? ['insufficientSteel'] : []),
  ]

  return {
    tier,
    priority: ADVICE_PRIORITIES[tier],
    feasibility,
    reasonKeys,
    costs: Number.isFinite(rule.steelCost) ? { steel: rule.steelCost } : {},
    requiredShipKeys: (rule.requiredShipGroups || []).map(({ key }) => key),
  }
}

const isRecommendationCandidate = (quest, now) =>
  quest &&
  RECOMMENDATION_PERIOD_SET.has(quest.period) &&
  (quest.status === 1 || quest.status === 2) &&
  (quest.limited ||
    quest.period === 'oneTime' ||
    (Number.isFinite(Number(quest.resetAt)) && Number(quest.resetAt) > now))

const rewardValuePriority = (reward) =>
  reward.category === 'other' && reward.valuable
    ? REWARD_CATEGORY_PRIORITIES.screws
    : Number(reward.priority || 0)

const findDownstreamRewardTargets = (quest, questsById) => {
  const visited = new Set([Number(quest.id)])
  const queue = (quest.unlockIds || []).map((id) => ({ id: Number(id), pathIds: [Number(id)] }))
  const targets = []

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || !Number.isFinite(current.id) || visited.has(current.id)) continue
    visited.add(current.id)
    const successor = questsById.get(current.id)
    if (!successor || successor.limited || successor.status === 3) continue
    // An already-open successor no longer depends on completing this quest, so it should rank on
    // its own instead of lending the same reward value to an unrelated open branch.
    if (successor.status === 1 || successor.status === 2) continue

    const reward = classifyQuestRewards(successor)
    if (reward.valuable) {
      targets.push({
        id: Number(successor.id),
        code: successor.code,
        name: successor.name,
        period: successor.period,
        depth: current.pathIds.length,
        pathIds: current.pathIds,
        reward,
      })
    }
    ;(successor.unlockIds || []).forEach((id) => {
      const successorId = Number(id)
      if (Number.isFinite(successorId) && !visited.has(successorId)) {
        queue.push({ id: successorId, pathIds: [...current.pathIds, successorId] })
      }
    })
  }

  return targets
    .sort(
      (left, right) =>
        rewardValuePriority(right.reward) - rewardValuePriority(left.reward) ||
        left.depth - right.depth ||
        left.id - right.id,
    )
    .slice(0, 3)
}

const effectiveQuestReward = (reward, downstreamTargets) => {
  const bestDownstream = downstreamTargets[0]
  if (
    !bestDownstream ||
    rewardValuePriority(reward) >= rewardValuePriority(bestDownstream.reward)
  ) {
    return { reward, source: 'current', sourceQuestId: null }
  }
  return {
    reward: bestDownstream.reward,
    source: 'downstream',
    sourceQuestId: bestDownstream.id,
  }
}

const questValueBand = (quest, effectiveReward) => {
  const repeatable = REPEATABLE_PERIOD_SET.has(quest.period)
  if (effectiveReward.valuable) return repeatable ? 4 : 3
  return repeatable ? 2 : 1
}

const SIMULTANEOUS_RELATION_KINDS = new Set([
  'sameSortie',
  'sameExercise',
  'sameExpedition',
  'sameArsenal',
])

const uniqueValues = (values) => [...new Set(values)]

const simultaneousStageGroup = (synergy, stage, simultaneousStageCount) => {
  const supportingStages = (synergy.stages || []).filter(
    (candidateStage) => !SIMULTANEOUS_RELATION_KINDS.has(candidateStage.kind),
  )
  const stages = [stage, ...supportingStages]
  const stageQuestIds = uniqueValues(
    (stage.questIds || [])
      .map(Number)
      .filter(Number.isFinite)
      .sort((left, right) => left - right),
  )
  const stageId = [
    synergy.id,
    stage.kind,
    stageQuestIds.join('-'),
    (stage.mapIds || []).join('-'),
  ].join(':')
  return {
    id: simultaneousStageCount === 1 ? synergy.id : stageId,
    sourcePlanId: synergy.id,
    priority: synergy.priority,
    relationKinds: uniqueValues(stages.map(({ kind }) => kind)),
    mapIds: uniqueValues(stages.flatMap(({ mapIds = [] }) => mapIds)),
    fleetKey: stages.length === 1 ? stage.fleetKey : 'variedByStage',
    extraObjectiveKeys: uniqueValues(
      stages.flatMap(({ extraObjectiveKeys = [] }) => extraObjectiveKeys),
    ),
    instructionKeys: uniqueValues(stages.flatMap(({ instructionKeys = [] }) => instructionKeys)),
    companions: [],
    stages,
  }
}

const groupQuestRecommendations = (recommendations) => {
  const recommendationsById = new Map(recommendations.map((quest) => [Number(quest.id), quest]))
  const groups = []
  const seenStageIds = new Set()
  const groupedQuestIds = new Set()

  recommendations.forEach((quest) => {
    const questId = Number(quest.id)
    ;(quest.synergies || []).forEach((synergy) => {
      const simultaneousStages = (synergy.stages || []).filter(
        ({ kind, questIds = [] }) =>
          SIMULTANEOUS_RELATION_KINDS.has(kind) &&
          questIds.filter((id) => recommendationsById.has(Number(id))).length > 1,
      )
      simultaneousStages.forEach((stage) => {
        const stageQuestIds = uniqueValues(
          (stage.questIds || []).map(Number).filter((id) => recommendationsById.has(id)),
        ).sort((left, right) => left - right)
        const stageKey = [
          synergy.id,
          stage.kind,
          stageQuestIds.join('-'),
          (stage.mapIds || []).join('-'),
        ].join(':')
        if (seenStageIds.has(stageKey)) return
        seenStageIds.add(stageKey)
        const groupQuests = stageQuestIds.map((id) => recommendationsById.get(id)).filter(Boolean)
        if (groupQuests.length < 2) return
        const groupSynergy = simultaneousStageGroup(synergy, stage, simultaneousStages.length)
        groups.push({
          id: `synergy:${groupSynergy.id}`,
          kind: 'combined',
          resetAt:
            groupQuests
              .map(({ resetAt }) => Number(resetAt))
              .filter(Number.isFinite)
              .sort((left, right) => left - right)[0] ?? null,
          quests: groupQuests,
          synergy: groupSynergy,
        })
      })
    })
  })

  const uniqueActionGroups = groups.filter((group, groupIndex) => {
    const questIds = new Set(group.quests.map(({ id }) => Number(id)))
    const relationKind = group.synergy?.stages?.[0]?.kind
    const mapIds = (group.synergy?.stages?.[0]?.mapIds || []).join('|')
    return !groups.some((candidate, candidateIndex) => {
      if (candidateIndex === groupIndex) return false
      const candidateRelationKind = candidate.synergy?.stages?.[0]?.kind
      const candidateMapIds = (candidate.synergy?.stages?.[0]?.mapIds || []).join('|')
      if (relationKind !== candidateRelationKind || mapIds !== candidateMapIds) return false
      const candidateQuestIds = new Set(candidate.quests.map(({ id }) => Number(id)))
      if (![...questIds].every((id) => candidateQuestIds.has(id))) return false
      return (
        candidateQuestIds.size > questIds.size ||
        (candidateQuestIds.size === questIds.size && candidateIndex < groupIndex)
      )
    })
  })
  groups.splice(0, groups.length, ...uniqueActionGroups)
  groups.forEach((group) => {
    group.quests.forEach(({ id }) => groupedQuestIds.add(Number(id)))
  })

  recommendations.forEach((quest) => {
    if (groupedQuestIds.has(Number(quest.id))) return
    groups.push({
      id: `quest:${quest.id}`,
      kind: 'single',
      resetAt: Number.isFinite(Number(quest.resetAt)) ? Number(quest.resetAt) : null,
      quests: [quest],
      synergy: null,
    })
  })

  const groupMembershipCount = groups.reduce((counts, group) => {
    group.quests.forEach(({ id }) => {
      counts.set(Number(id), (counts.get(Number(id)) || 0) + 1)
    })
    return counts
  }, new Map())
  return groups.map((group) => ({
    ...group,
    repeatedQuestIds: group.quests
      .map(({ id }) => Number(id))
      .filter((id) => (groupMembershipCount.get(id) || 0) > 1),
  }))
}

export const rankQuestRecommendations = (
  quests,
  { now = Date.now(), extraOperationStatus = {}, account = {} } = {},
) => {
  const startedAt = Date.now()
  const questList = (Array.isArray(quests) ? quests : []).map((quest) => {
    const discoveredMapIds = [
      ...new Set([
        ...(Array.isArray(quest?.mapIds) ? quest.mapIds : []),
        ...extractNormalMapIds(quest?.name, quest?.description, quest?.memo),
      ]),
    ]
    return {
      ...quest,
      mapIds: [
        ...new Set([
          ...discoveredMapIds,
          ...questObjectiveMapIds({ ...quest, mapIds: discoveredMapIds }),
        ]),
      ],
    }
  })
  const questsById = new Map(questList.map((quest) => [Number(quest.id), quest]))
  const candidates = questList
    .filter((quest) => isRecommendationCandidate(quest, now))
    .map((quest) => {
      const resetAt = quest.period === 'oneTime' ? null : Number(quest.resetAt)
      const remainingMs = resetAt === null ? null : resetAt - now
      const reward = classifyQuestRewards(quest)
      const mapIds = quest.mapIds
      const downstreamTargets = findDownstreamRewardTargets(quest, questsById)
      const effectiveReward = effectiveQuestReward(reward, downstreamTargets)
      const hasDownstreamValue = effectiveReward.source === 'downstream'
      const guidance = evaluateQuestGuidance(
        quest,
        effectiveReward.reward,
        account,
        hasDownstreamValue,
      )
      const {
        memo: _memo,
        rewardConsumables: _rewardConsumables,
        unlockIds: _unlockIds,
        ...publicQuest
      } = quest
      return {
        ...publicQuest,
        mapIds,
        chapterKey: questChapterKeyFromMapIds(mapIds),
        resetAt,
        remainingMs,
        reward,
        downstreamTargets,
        effectiveReward: {
          category: effectiveReward.reward.category,
          priority: rewardValuePriority(effectiveReward.reward),
          source: effectiveReward.source,
          sourceQuestId: effectiveReward.sourceQuestId,
        },
        valueBand: questValueBand(quest, effectiveReward.reward),
        guidance,
      }
    })
    .sort(
      (left, right) =>
        Number(left.guidance.feasibility === 'unavailable') -
          Number(right.guidance.feasibility === 'unavailable') ||
        right.valueBand - left.valueBand ||
        right.effectiveReward.priority - left.effectiveReward.priority ||
        right.guidance.priority - left.guidance.priority ||
        Number(left.period === 'daily') - Number(right.period === 'daily') ||
        (left.resetAt ?? Number.POSITIVE_INFINITY) - (right.resetAt ?? Number.POSITIVE_INFINITY) ||
        right.reward.priority - left.reward.priority ||
        Number(right.reward.screwCount || 0) - Number(left.reward.screwCount || 0) ||
        Number(right.progress || 0) - Number(left.progress || 0) ||
        Number(right.status === 2) - Number(left.status === 2) ||
        Number(left.id) - Number(right.id),
    )

  const rewardCategoryCounts = candidates.reduce((counts, quest) => {
    counts[quest.reward.category] = (counts[quest.reward.category] || 0) + 1
    return counts
  }, {})
  const periodCounts = Object.fromEntries(
    RECOMMENDATION_PERIODS.map((period) => [
      period,
      candidates.filter((quest) => !quest.limited && quest.period === period).length,
    ]),
  )
  const limitedCount = candidates.filter(({ limited }) => limited).length
  const chapterCounts = Object.fromEntries(
    QUEST_CHAPTER_KEYS.map((chapterKey) => [
      chapterKey,
      candidates.filter((quest) => quest.chapterKey === chapterKey).length,
    ]),
  )

  const synergyDiagnostics = { curatedSortieFleetRejections: new Map() }
  const recommendationsWithInternalObjectives = candidates.map((quest) => ({
    ...quest,
    synergies: findQuestSynergies(quest, questList, {
      extraOperationStatus,
      diagnostics: synergyDiagnostics,
    }),
  }))
  const recommendations = recommendationsWithInternalObjectives.map(
    ({ synergyDescription: _synergyDescription, ...recommendation }) => recommendation,
  )
  const groups = groupQuestRecommendations(recommendations)
  const repeatedQuestIds = new Set(groups.flatMap(({ repeatedQuestIds: ids = [] }) => ids))
  const repeatedQuestGroupCount = groups.filter(
    ({ repeatedQuestIds: ids = [] }) => ids.length > 0,
  ).length
  const selectedSynergyIds = new Set(
    groups.map(({ synergy }) => synergy?.sourcePlanId || synergy?.id).filter(Boolean),
  )
  const alternativeSynergyIds = new Set(
    recommendations.flatMap((quest) =>
      (quest.synergies || [])
        .filter(
          (synergy) =>
            !selectedSynergyIds.has(synergy.id) &&
            (synergy.relationKinds || []).some((kind) => SIMULTANEOUS_RELATION_KINDS.has(kind)) &&
            (synergy.companions || []).some(({ id }) => questsById.has(Number(id))),
        )
        .map(({ id }) => id),
    ),
  )
  const objectiveDerivedGroups = groups.filter(({ synergy }) =>
    String(synergy?.id || '').startsWith('objective-'),
  )
  const curatedSortieFleetRejectionReasonCounts = Object.fromEntries(
    [...synergyDiagnostics.curatedSortieFleetRejections.values()].reduce((counts, reasonCode) => {
      counts.set(reasonCode, (counts.get(reasonCode) || 0) + 1)
      return counts
    }, new Map()),
  )
  const openArsenalProfileSources = questList
    .filter((quest) => quest.status === 1 || quest.status === 2)
    .map(questArsenalProfileSource)
    .filter(Boolean)
  const extraOperations = Object.entries(extraOperationStatus)
    .map(([mapId, status]) => ({ mapId, status }))
    .sort((left, right) => {
      const order = ['1-5', '2-5', '3-5', '4-5', '7-5', '6-5', '5-5']
      return order.indexOf(left.mapId) - order.indexOf(right.mapId)
    })

  return {
    generatedAt: new Date(now).toISOString(),
    rankingVersion: QUEST_RECOMMENDATION_RANKING_VERSION,
    candidateCount: candidates.length,
    periodCounts,
    chapterCounts,
    dailyCount: periodCounts.daily,
    weeklyCount: periodCounts.weekly,
    monthlyCount: periodCounts.monthly,
    quarterlyCount: periodCounts.quarterly,
    yearlyCount: periodCounts.yearly,
    oneTimeCount: periodCounts.oneTime,
    limitedCount,
    rewardCategoryCounts,
    recommendations,
    groups,
    groupCount: groups.length,
    combinedGroupCount: groups.filter(({ kind }) => kind === 'combined').length,
    groupingMode: 'separate-simultaneous-actions',
    repeatedQuestCount: repeatedQuestIds.size,
    repeatedQuestGroupCount,
    alternativeSynergyCount: alternativeSynergyIds.size,
    objectiveDerivedGroupCount: objectiveDerivedGroups.length,
    curatedSortieFleetRejectedStageCount: synergyDiagnostics.curatedSortieFleetRejections.size,
    curatedSortieFleetRejectionReasonCounts,
    objectiveProfiledQuestCount: questList.filter(hasQuestObjective).length,
    arsenalProfiledQuestCount: openArsenalProfileSources.length,
    derivedArsenalProfileCount: openArsenalProfileSources.filter(
      (source) => source === 'derived' || source === 'curatedAndDerived',
    ).length,
    derivedOnlyArsenalProfileCount: openArsenalProfileSources.filter(
      (source) => source === 'derived',
    ).length,
    extraOperations,
    availableExtraOperationCount: extraOperations.filter(({ status }) => status === 'available')
      .length,
    unavailableQuestCount: candidates.filter(
      ({ guidance }) => guidance.feasibility === 'unavailable',
    ).length,
    downstreamValueQuestCount: candidates.filter(
      ({ effectiveReward }) => effectiveReward.source === 'downstream',
    ).length,
    elapsedMs: Date.now() - startedAt,
  }
}
