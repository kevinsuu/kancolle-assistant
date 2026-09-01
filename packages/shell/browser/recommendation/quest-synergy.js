import { findObjectiveSynergies } from './quest-objective-synergy'

// Curated quest plans distinguish sorties that can be shared, objectives that should be run in
// sequence, and prerequisite unlocks. Quest IDs follow KC3's repeatable quest metadata.
const PLAN_RULES = [
  {
    id: 'one-five-monthly-stack',
    priority: 60,
    anchorIds: [228, 261, 265, 893],
    questIds: [265, 893, 261, 228],
    minimumOpenQuestCount: 1,
    stages: ({ openQuestIds, extraOperationStatus }) => [
      {
        kind: 'sameSortie',
        questIds: [265, 893, 261, 228].filter((id) => openQuestIds.has(id)),
        mapIds: ['1-5'],
        fleetKey: 'fourDe',
        extraObjectiveKeys:
          extraOperationStatus['1-5'] === 'available' ? ['oneFiveExtraOperation'] : [],
        instructionKeys: [
          ...(openQuestIds.has(261) || openQuestIds.has(893) ? ['oneFiveThreeBosses'] : []),
          ...(extraOperationStatus['1-5'] === 'available' ? ['oneFiveFourBosses'] : []),
          ...(openQuestIds.has(228) ? ['oneFiveFifteenSubmarines'] : []),
          ...(openQuestIds.has(265) ? ['oneFiveTenBosses'] : []),
        ],
      },
    ],
  },
  {
    id: 'daily-monthly-unlock-chain',
    priority: 85,
    anchorIds: [201, 216, 311, 280],
    questIds: [201, 216, 311, 280],
    minimumOpenQuestCount: 1,
    stages: ({ openQuestIds, visibleQuestIds }) => {
      const links = [
        { from: 201, to: 216, instructionKey: 'unlockBdOneBdTwo' },
        { from: 216, to: 311, instructionKey: 'unlockBdTwoCmOne' },
        { from: 311, to: 280, instructionKey: 'unlockCmOneBmEight' },
      ]
      const firstOpenLinkIndex = links.findIndex(({ from }) => openQuestIds.has(from))
      if (firstOpenLinkIndex < 0) return []
      return links
        .slice(firstOpenLinkIndex)
        .filter(({ from, to }) => visibleQuestIds.has(from) && visibleQuestIds.has(to))
        .map(({ from, to, instructionKey }) => ({
          kind: 'unlock',
          questIds: [from, to],
          mapIds: [],
          fleetKey: 'variedByStage',
          instructionKeys: [instructionKey],
        }))
    },
  },
  {
    id: 'southern-logistics-chain',
    priority: 90,
    anchorIds: [229, 257, 264, 280, 284, 845, 894],
    questIds: [257, 264, 280, 284, 845, 894, 229],
    minimumOpenQuestCount: 1,
    stages: ({ openQuestIds, visibleQuestIds, extraOperationStatus }) => [
      ...(openQuestIds.has(280) && openQuestIds.has(894)
        ? [
            {
              kind: 'sameSortie',
              questIds: [280, 894],
              mapIds: ['1-3', '1-4', '2-1'],
              fleetKey: 'carrierThreeDd',
              instructionKeys: ['bmEightBqNineSharedMaps'],
            },
          ]
        : []),
      ...(openQuestIds.has(284) && openQuestIds.has(894)
        ? [
            {
              kind: 'sameSortie',
              questIds: [284, 894],
              mapIds: ['1-4', '2-1', '2-2', '2-3'],
              fleetKey: 'cvlThreeDd',
              instructionKeys: ['bqNineBqElevenSharedMaps'],
            },
          ]
        : []),
      ...(openQuestIds.has(257) && openQuestIds.has(284)
        ? [
            {
              kind: 'sameSortie',
              questIds: [257, 284],
              mapIds: ['1-4'],
              fleetKey: 'clFlagshipThreeDd',
              instructionKeys: ['oneFourLightCruiser'],
            },
          ]
        : []),
      ...[
        { from: 280, to: 284, instructionKey: 'unlockBmEightBqEleven' },
        { from: 284, to: 845, instructionKey: 'unlockBqElevenBqTwelve' },
      ]
        .filter(({ from, to }) => openQuestIds.has(from) && visibleQuestIds.has(to))
        .map(({ from, to, instructionKey }) => ({
          kind: 'unlock',
          questIds: [from, to],
          mapIds: [],
          fleetKey: 'variedByStage',
          instructionKeys: [instructionKey],
        })),
      ...([264, 845, 229].filter((id) => openQuestIds.has(id)).length > 1
        ? [
            {
              kind: 'sameSortie',
              questIds: [264, 845, 229].filter((id) => openQuestIds.has(id)),
              mapIds: ['4-2'],
              fleetKey: 'twoCarrierTwoDd',
              instructionKeys: ['fourTwoCarrierStack'],
            },
          ]
        : []),
      ...(openQuestIds.has(845) && extraOperationStatus['4-5'] === 'available'
        ? [
            {
              kind: 'sameSortie',
              questIds: [845],
              mapIds: ['4-5'],
              fleetKey: 'regularEoFleet',
              extraObjectiveKeys: ['fourFiveExtraOperation'],
              instructionKeys: ['fourFiveWesternEo'],
            },
          ]
        : []),
    ],
  },
  {
    id: 'two-five-monthly-route',
    priority: 80,
    anchorIds: [249, 266],
    questIds: [249, 266],
    minimumOpenQuestCount: 1,
    stages: ({ openQuestIds, visibleQuestIds, extraOperationStatus }) => [
      {
        kind: 'sequence',
        questIds: [249, 266].filter((id) => openQuestIds.has(id) || visibleQuestIds.has(id)),
        mapIds: ['2-5'],
        fleetKey: 'separateRequiredFleets',
        extraObjectiveKeys:
          extraOperationStatus['2-5'] === 'available' ? ['twoFiveExtraOperation'] : [],
        instructionKeys: ['twoFiveMonthlySequence'],
      },
    ],
  },
  {
    id: 'z-front-quarterly-chain',
    priority: 95,
    anchorIds: [822, 854, 861, 862],
    questIds: [822, 854, 861, 862],
    minimumOpenQuestCount: 1,
    stages: ({ openQuestIds, visibleQuestIds }) => [
      ...(openQuestIds.has(822) && openQuestIds.has(854)
        ? [
            {
              kind: 'sameSortie',
              questIds: [822, 854],
              mapIds: ['2-4'],
              fleetKey: 'freeFleet',
              instructionKeys: ['twoFourDoubleQuest'],
            },
          ]
        : []),
      ...(openQuestIds.has(861) && visibleQuestIds.has(862)
        ? [
            {
              kind: 'unlock',
              questIds: [861, 862],
              mapIds: ['1-6', '6-3'],
              fleetKey: 'separateRequiredFleets',
              instructionKeys: ['unlockBqThreeBqFour'],
            },
          ]
        : []),
      ...(openQuestIds.has(854) && openQuestIds.has(862)
        ? [
            {
              kind: 'sameSortie',
              questIds: [854, 862],
              mapIds: ['6-3'],
              fleetKey: 'avOneClTwo',
              instructionKeys: ['sixThreeDoubleQuest'],
            },
          ]
        : []),
    ],
  },
  {
    id: 'northern-medal-report-chain',
    priority: 100,
    anchorIds: [873, 875],
    questIds: [873, 875],
    minimumOpenQuestCount: 1,
    stages: ({ openQuestIds, visibleQuestIds }) =>
      openQuestIds.has(873) && visibleQuestIds.has(875)
        ? [
            {
              kind: 'unlock',
              questIds: [873, 875],
              mapIds: ['3-1', '3-2', '3-3', '5-4'],
              fleetKey: 'separateRequiredFleets',
              instructionKeys: ['northernMedalReportChain'],
            },
          ]
        : [],
  },
  {
    id: 'five-one-surface-yuubari',
    priority: 50,
    anchorIds: [259, 903],
    questIds: [259, 903],
    requiredOpenQuestIds: [259, 903],
    stages: () => [
      {
        kind: 'sameSortie',
        questIds: [259, 903],
        mapIds: ['5-1'],
        fleetKey: 'yuubariThreeBbTwoDesronSix',
        instructionKeys: ['fiveOneSurfaceYuubari'],
      },
    ],
  },
  {
    id: 'five-one-mikawa-yuubari',
    priority: 40,
    anchorIds: [888, 903],
    questIds: [888, 903],
    requiredOpenQuestIds: [888, 903],
    stages: () => [
      {
        kind: 'sameSortie',
        questIds: [888, 903],
        mapIds: ['5-1'],
        fleetKey: 'yuubariThreeMikawaYura',
        instructionKeys: ['fiveOneMikawaYuubari'],
      },
    ],
  },
]

// These profiles mirror KC3's verified batch counters. They intentionally cover only actions
// known to advance the listed quests; sharing a broad category alone is not enough to group two
// quests, because fleet restrictions and required expedition or equipment types can conflict.
const GENERIC_EXERCISE_QUEST_IDS = new Set([302, 303, 304, 311])
const RESTRICTED_EXERCISE_QUEST_IDS = new Set([
  318, 330, 337, 339, 342, 345, 346, 348, 350, 353, 354, 355, 356, 357, 362, 368, 371, 372, 373,
  375, 377,
])

const EXPEDITION_MISSIONS_BY_QUEST_ID = new Map([
  [402, null],
  [403, null],
  [404, null],
  [410, [37, 38]],
  [411, [37, 38]],
  [424, [5]],
  [426, [3, 4, 5, 10]],
  [428, [4, 101, 102]],
  [434, [3, 5, 9, 100, 101]],
  [436, [1, 2, 3, 4, 10]],
  [437, [4, 104, 105, 110]],
  [438, [4, 9, 100, 114]],
  [439, [5, 11, 100, 110]],
  [440, [5, 40, 41, 46, 142]],
  [442, [29, 30, 131, 133]],
  [444, [5, 9, 11, 12, 110]],
])

const ARSENAL_PROFILE_BY_QUEST_ID = new Map([
  [605, { operation: 'develop' }],
  [606, { operation: 'construct' }],
  [607, { operation: 'develop' }],
  [608, { operation: 'construct' }],
  [626, { masterIds: [19, 20] }],
  [628, { masterIds: [21] }],
  [638, { typeIds: [21] }],
  [643, { masterIds: [20] }],
  [653, { masterIds: [4] }],
  [654, { masterIds: [242, 249] }],
  [655, { typeIds: [1, 2, 3, 8, 10] }],
  [657, { typeIds: [1, 2, 5, 32] }],
  [663, { typeIds: [3] }],
  [673, { typeIds: [1] }],
  [674, { typeIds: [21] }],
  [675, { typeIds: [6, 21] }],
  [676, { typeIds: [2, 4, 30] }],
  [677, { typeIds: [3, 5, 10, 32] }],
  [678, { masterIds: [19, 20] }],
  [680, { typeIds: [12, 13, 21] }],
  [681, { typeIds: [7, 8] }],
  [686, { masterIds: [3, 121] }],
  [688, { typeIds: [6, 7, 8, 10] }],
  [1103, { masterIds: [125] }],
  [1104, { masterIds: [106] }],
  [1105, { typeIds: [47] }],
  [1107, { typeIds: [6, 8] }],
  [1120, { typeIds: [6, 7, 8] }],
  [1123, { masterIds: [82] }],
  [1138, { masterIds: [120] }],
])

const GEAR_TYPE_BY_MASTER_ID = new Map([
  [3, 1],
  [4, 2],
  [19, 6],
  [20, 6],
  [21, 6],
  [82, 8],
  [106, 12],
  [120, 36],
  [121, 36],
  [125, 5],
  [242, 7],
  [249, 7],
])

const isOpenQuest = (quest) => quest && (quest.status === 1 || quest.status === 2)

const questParticipant = (quest) => ({
  id: quest.id,
  code: quest.code,
  name: quest.name,
  status: quest.status,
  period: quest.period,
  resetAt: quest.resetAt,
  locked: !isOpenQuest(quest),
})

const sharedActionPlan = (category, actionKey, anchorQuest, groupQuests) => {
  const questIds = groupQuests.map(({ id }) => Number(id)).sort((left, right) => left - right)
  const relationKind = {
    exercise: 'sameExercise',
    expedition: 'sameExpedition',
    arsenal: 'sameArsenal',
  }[category]
  const fleetKey = {
    exercise: 'sharedExercise',
    expedition: 'sharedExpedition',
    arsenal: 'sharedArsenal',
  }[category]
  const participants = groupQuests.map(questParticipant)
  return {
    id: `shared-${category}-${actionKey}-${questIds.join('-')}`,
    priority: 120,
    relationKinds: [relationKind],
    mapIds: [],
    fleetKey,
    extraObjectiveKeys: [],
    instructionKeys: [fleetKey],
    companions: participants.filter(({ id }) => Number(id) !== Number(anchorQuest.id)),
    stages: [
      {
        kind: relationKind,
        questIds,
        mapIds: [],
        fleetKey,
        extraObjectiveKeys: [],
        instructionKeys: [fleetKey],
        participants,
      },
    ],
  }
}

const exerciseSharedActionPlans = (anchorQuest, openQuests) => {
  const anchorId = Number(anchorQuest?.id)
  const isGenericAnchor = GENERIC_EXERCISE_QUEST_IDS.has(anchorId)
  const isRestrictedAnchor = RESTRICTED_EXERCISE_QUEST_IDS.has(anchorId)
  if (!isGenericAnchor && !isRestrictedAnchor) return []

  const genericQuests = openQuests.filter(({ id }) => GENERIC_EXERCISE_QUEST_IDS.has(Number(id)))
  const restrictedQuests = openQuests.filter(({ id }) =>
    RESTRICTED_EXERCISE_QUEST_IDS.has(Number(id)),
  )
  const groups = isRestrictedAnchor
    ? [[...genericQuests, anchorQuest]]
    : [genericQuests, ...restrictedQuests.map((quest) => [...genericQuests, quest])]

  return groups
    .map((quests) => [...new Map(quests.map((quest) => [Number(quest.id), quest])).values()])
    .filter(
      (quests) => quests.length > 1 && quests.some(({ id }) => Number(id) === Number(anchorId)),
    )
    .map((quests) => sharedActionPlan('exercise', 'victory', anchorQuest, quests))
}

const expeditionSharedActionPlans = (anchorQuest, openQuests) => {
  const anchorId = Number(anchorQuest?.id)
  if (!EXPEDITION_MISSIONS_BY_QUEST_ID.has(anchorId)) return []
  const profiledQuests = openQuests.filter(({ id }) =>
    EXPEDITION_MISSIONS_BY_QUEST_ID.has(Number(id)),
  )
  const anchorMissions = EXPEDITION_MISSIONS_BY_QUEST_ID.get(anchorId)
  const missionIds = anchorMissions || [
    ...new Set(
      profiledQuests.flatMap(({ id }) => EXPEDITION_MISSIONS_BY_QUEST_ID.get(Number(id)) || []),
    ),
  ]
  const groups = missionIds.map((missionId) => ({
    actionKey: String(missionId),
    quests: profiledQuests.filter(({ id }) => {
      const missions = EXPEDITION_MISSIONS_BY_QUEST_ID.get(Number(id))
      return missions === null || missions.includes(missionId)
    }),
  }))
  if (anchorMissions === null) {
    groups.push({
      actionKey: 'any',
      quests: profiledQuests.filter(
        ({ id }) => EXPEDITION_MISSIONS_BY_QUEST_ID.get(Number(id)) === null,
      ),
    })
  }

  return groups
    .filter(
      ({ quests }) => quests.length > 1 && quests.some(({ id }) => Number(id) === Number(anchorId)),
    )
    .map(({ actionKey, quests }) => sharedActionPlan('expedition', actionKey, anchorQuest, quests))
}

const arsenalProfileMatches = (profile, action) => {
  if (profile.operation || action.operation) return profile.operation === action.operation
  if (action.masterId && (profile.masterIds || []).includes(action.masterId)) return true
  return Number.isFinite(action.typeId) && (profile.typeIds || []).includes(action.typeId)
}

const arsenalSharedActionPlans = (anchorQuest, openQuests) => {
  const anchorId = Number(anchorQuest?.id)
  const anchorProfile = ARSENAL_PROFILE_BY_QUEST_ID.get(anchorId)
  if (!anchorProfile) return []
  const profiledQuests = openQuests.filter(({ id }) => ARSENAL_PROFILE_BY_QUEST_ID.has(Number(id)))
  const actions = [
    ...new Set(
      [...ARSENAL_PROFILE_BY_QUEST_ID.values()].map(({ operation }) => operation).filter(Boolean),
    ),
  ].map((operation) => ({ operation, key: operation }))
  ;[
    ...new Set([...ARSENAL_PROFILE_BY_QUEST_ID.values()].flatMap(({ typeIds = [] }) => typeIds)),
  ].forEach((typeId) => actions.push({ typeId, key: `type-${typeId}` }))
  ;[
    ...new Set(
      [...ARSENAL_PROFILE_BY_QUEST_ID.values()].flatMap(({ masterIds = [] }) => masterIds),
    ),
  ].forEach((masterId) =>
    actions.push({
      masterId,
      typeId: GEAR_TYPE_BY_MASTER_ID.get(masterId),
      key: `item-${masterId}`,
    }),
  )

  return actions
    .filter((action) => arsenalProfileMatches(anchorProfile, action))
    .map((action) => ({
      actionKey: action.key,
      quests: profiledQuests.filter((quest) =>
        arsenalProfileMatches(ARSENAL_PROFILE_BY_QUEST_ID.get(Number(quest.id)), action),
      ),
    }))
    .filter(({ quests }) => quests.length > 1)
    .map(({ actionKey, quests }) => sharedActionPlan('arsenal', actionKey, anchorQuest, quests))
}

const findSharedActionSynergies = (anchorQuest, questList) => {
  const openQuests = questList.filter(isOpenQuest)
  const plans = [
    ...exerciseSharedActionPlans(anchorQuest, openQuests),
    ...expeditionSharedActionPlans(anchorQuest, openQuests),
    ...arsenalSharedActionPlans(anchorQuest, openQuests),
  ]
  const uniquePlans = new Map()
  plans.forEach((plan) => {
    const groupKey = plan.stages[0].questIds.join('-')
    if (!uniquePlans.has(groupKey)) uniquePlans.set(groupKey, plan)
  })
  return [...uniquePlans.values()]
}

const unique = (values) => [...new Set(values)]

const stageHasUsefulContent = (stage) =>
  stage.questIds.length > 1 ||
  (stage.extraObjectiveKeys || []).length > 0 ||
  stage.kind === 'unlock' ||
  stage.kind === 'sequence'

export const findQuestSynergies = (anchorQuest, quests, { extraOperationStatus = {} } = {}) => {
  const questList = Array.isArray(quests) ? quests : []
  const questsById = new Map(questList.map((quest) => [Number(quest.id), quest]))
  const openQuestIds = new Set(questList.filter(isOpenQuest).map(({ id }) => Number(id)))
  const visibleQuestIds = new Set(questsById.keys())

  const curatedPlans = PLAN_RULES.filter((rule) => rule.anchorIds.includes(Number(anchorQuest?.id)))
    .filter((rule) => {
      if (rule.requiredOpenQuestIds) {
        return rule.requiredOpenQuestIds.every((id) => openQuestIds.has(id))
      }
      return rule.questIds.filter((id) => openQuestIds.has(id)).length >= rule.minimumOpenQuestCount
    })
    .map((rule) => {
      const stages = rule
        .stages({ openQuestIds, visibleQuestIds, extraOperationStatus })
        .map((stage) => ({
          ...stage,
          extraObjectiveKeys: stage.extraObjectiveKeys || [],
          instructionKeys: stage.instructionKeys || [],
          participants: stage.questIds
            .map((id) => questsById.get(id))
            .filter(Boolean)
            .map(({ id, code, name, status, period, resetAt }) => ({
              id,
              code,
              name,
              status,
              period,
              resetAt,
              locked: !isOpenQuest(questsById.get(Number(id))),
            })),
        }))
        .filter(stageHasUsefulContent)
      if (!stages.some(({ questIds }) => questIds.includes(Number(anchorQuest.id)))) return null
      const relatedQuestIds = unique(stages.flatMap(({ questIds }) => questIds))
      const companions = relatedQuestIds
        .filter((id) => id !== Number(anchorQuest.id))
        .map((id) => questsById.get(id))
        .filter(Boolean)
        .map(({ id, code, name, status, period, resetAt }) => ({
          id,
          code,
          name,
          status,
          period,
          resetAt,
          locked: !isOpenQuest(questsById.get(Number(id))),
        }))
      return {
        id: rule.id,
        priority: rule.priority,
        relationKinds: unique(stages.map(({ kind }) => kind)),
        mapIds: unique(stages.flatMap(({ mapIds }) => mapIds)),
        fleetKey: stages.length === 1 ? stages[0].fleetKey : 'variedByStage',
        extraObjectiveKeys: unique(stages.flatMap(({ extraObjectiveKeys }) => extraObjectiveKeys)),
        instructionKeys: unique(stages.flatMap(({ instructionKeys }) => instructionKeys)),
        companions,
        stages,
      }
    })
    .filter(Boolean)
  return [
    ...findObjectiveSynergies(anchorQuest, questList),
    ...findSharedActionSynergies(anchorQuest, questList),
    ...curatedPlans,
  ]
}
