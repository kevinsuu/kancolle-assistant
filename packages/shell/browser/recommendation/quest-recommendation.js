import { findQuestSynergies, questArsenalProfileSource } from './quest-synergy'
import { hasQuestObjective, questObjectiveMapIds } from './quest-objective-synergy'

export const QUEST_RECOMMENDATION_RANKING_VERSION = 15

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
    requiredShipGroups: [{ masterIds: [622, 623, 624], key: 'yuubariKaiNi' }],
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
  const structuredScrewCount = Number(rewardConsumables[3] || 0)
  const screwCount = Math.max(
    0,
    Number.isFinite(structuredScrewCount) ? Math.trunc(structuredScrewCount) : 0,
  )
  const hasBlueprint = REWARD_PATTERNS.blueprint.test(rewardText)
  const hasMedal = REWARD_PATTERNS.medal.test(rewardText)
  const hasActionReport = REWARD_PATTERNS.actionReport.test(rewardText)
  const hasScrews = screwCount > 0 || REWARD_PATTERNS.screws.test(rewardText)
  const materialKeys = [
    ...(REWARD_PATTERNS.skilledCrew.test(rewardText) ? ['skilledCrew'] : []),
    ...(REWARD_PATTERNS.newAviationMaterial.test(rewardText) ? ['newAviationMaterial'] : []),
    ...(REWARD_PATTERNS.daihatsu.test(rewardText) ? ['daihatsu'] : []),
    ...(REWARD_PATTERNS.newRocketMaterial.test(rewardText) ? ['newRocketMaterial'] : []),
  ]
  const isChoiceReward = REWARD_PATTERNS.choice.test(rewardText)

  const details = {
    hasBlueprint,
    hasMedal,
    hasActionReport,
    hasScrews,
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

const groupQuestRecommendations = (recommendations) => {
  const recommendationsById = new Map(recommendations.map((quest) => [Number(quest.id), quest]))
  const assignedQuestIds = new Set()
  const groups = []

  recommendations.forEach((quest) => {
    const questId = Number(quest.id)
    if (assignedQuestIds.has(questId)) return

    const synergy = (quest.synergies || [])
      .map((candidate) => {
        const questIds = [questId]
        candidate.companions.forEach(({ id }) => {
          const companionId = Number(id)
          if (recommendationsById.has(companionId) && !assignedQuestIds.has(companionId)) {
            questIds.push(companionId)
          }
        })
        const uniqueQuestIds = [...new Set(questIds)]
        const externalCompanionCount = candidate.companions.filter(
          ({ id }) => !recommendationsById.has(Number(id)),
        ).length
        return {
          candidate,
          questIds: uniqueQuestIds,
          objectiveCount:
            uniqueQuestIds.length + externalCompanionCount + candidate.extraObjectiveKeys.length,
          // A combined group must contain at least two quests that can be acted on now. Locked
          // successors and EO objectives remain planning context, but cannot turn one current
          // quest into a misleading one-item combination.
          isUseful: uniqueQuestIds.length > 1,
        }
      })
      .filter(({ isUseful }) => isUseful)
      .sort(
        (left, right) =>
          right.questIds.length - left.questIds.length ||
          right.objectiveCount - left.objectiveCount ||
          Number(right.candidate.priority || 0) - Number(left.candidate.priority || 0) ||
          left.candidate.id.localeCompare(right.candidate.id),
      )[0]

    const groupQuests = (synergy?.questIds || [questId])
      .map((id) => recommendationsById.get(id))
      .filter(Boolean)
    groupQuests.forEach(({ id }) => assignedQuestIds.add(Number(id)))
    groups.push({
      id: synergy ? `synergy:${synergy.candidate.id}` : `quest:${questId}`,
      kind: synergy ? 'combined' : 'single',
      resetAt:
        groupQuests
          .map(({ resetAt }) => Number(resetAt))
          .filter(Number.isFinite)
          .sort((left, right) => left - right)[0] ?? null,
      quests: groupQuests,
      synergy: synergy?.candidate || null,
    })
  })

  return groups
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

  const recommendationsWithInternalObjectives = candidates.map((quest) => ({
    ...quest,
    synergies: findQuestSynergies(quest, questList, { extraOperationStatus }),
  }))
  const recommendations = recommendationsWithInternalObjectives.map(
    ({ synergyDescription: _synergyDescription, ...recommendation }) => recommendation,
  )
  const groups = groupQuestRecommendations(recommendations)
  const selectedSynergyIds = new Set(groups.map(({ synergy }) => synergy?.id).filter(Boolean))
  const simultaneousRelationKinds = new Set([
    'sameSortie',
    'sameExercise',
    'sameExpedition',
    'sameArsenal',
  ])
  const alternativeSynergyIds = new Set(
    recommendations.flatMap((quest) =>
      (quest.synergies || [])
        .filter(
          (synergy) =>
            !selectedSynergyIds.has(synergy.id) &&
            (synergy.relationKinds || []).some((kind) => simultaneousRelationKinds.has(kind)) &&
            (synergy.companions || []).some(({ id }) => questsById.has(Number(id))),
        )
        .map(({ id }) => id),
    ),
  )
  const objectiveDerivedGroups = groups.filter(({ synergy }) =>
    String(synergy?.id || '').startsWith('objective-'),
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
    alternativeSynergyCount: alternativeSynergyIds.size,
    objectiveDerivedGroupCount: objectiveDerivedGroups.length,
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
