const DEFAULT_MAX_QUEST_COUNT = 5
const compatibilityCachesByQuestList = new WeakMap()

export const isOpenQuest = (quest) => quest && (quest.status === 1 || quest.status === 2)

export const questSynergyParticipant = (quest) => ({
  id: quest.id,
  code: quest.code,
  name: quest.name,
  status: quest.status,
  period: quest.period,
  resetAt: quest.resetAt,
  locked: !isOpenQuest(quest),
})

export const createSharedQuestPlan = ({
  id,
  priority,
  relationKind,
  mapIds = [],
  fleetKey,
  instructionKey = fleetKey,
  anchorQuest,
  quests,
}) => {
  const questIds = quests
    .map(({ id: questId }) => Number(questId))
    .sort((left, right) => left - right)
  const participants = quests.map(questSynergyParticipant)
  return {
    id,
    priority,
    relationKinds: [relationKind],
    mapIds,
    fleetKey,
    extraObjectiveKeys: [],
    instructionKeys: [instructionKey],
    companions: participants.filter(
      ({ id: participantId }) => Number(participantId) !== Number(anchorQuest.id),
    ),
    stages: [
      {
        kind: relationKind,
        questIds,
        mapIds,
        fleetKey,
        extraObjectiveKeys: [],
        instructionKeys: [instructionKey],
        participants,
      },
    ],
  }
}

const uniquePlans = (plans) => [
  ...new Map(plans.filter(Boolean).map((plan) => [plan.id, plan])).values(),
]

// Every supported quest category supplies only its objective adapter and compatibility predicate.
// The bounded combination search, anchor handling, and plan de-duplication stay shared so changes
// to co-completion selection apply to sorties, exercises, expeditions, and arsenal actions alike.
export const findCompatibleQuestSynergies = ({
  anchorQuest,
  quests,
  objectivesForQuest,
  entriesAreCompatible,
  planForEntries,
  cacheNamespace,
  maximumQuestCount = DEFAULT_MAX_QUEST_COUNT,
}) => {
  if (!isOpenQuest(anchorQuest)) return []
  const questList = Array.isArray(quests) ? quests : []
  const anchorObjectives = objectivesForQuest(anchorQuest, questList)
  if (anchorObjectives.length === 0) return []

  const openEntries = questList.filter(isOpenQuest).flatMap((quest) =>
    objectivesForQuest(quest, questList).map((objective, objectiveIndex) => ({
      key: `${Number(quest.id)}:${objectiveIndex}`,
      quest,
      objective,
    })),
  )
  const plans = []
  const cachesByNamespace = compatibilityCachesByQuestList.get(questList) || new Map()
  compatibilityCachesByQuestList.set(questList, cachesByNamespace)
  const compatibilityCache = cachesByNamespace.get(cacheNamespace) || new Map()
  cachesByNamespace.set(cacheNamespace, compatibilityCache)
  const areCompatible = (entries) => {
    const key = entries
      .map((entry) => entry.key)
      .sort()
      .join('|')
    if (!compatibilityCache.has(key)) {
      compatibilityCache.set(key, entriesAreCompatible(entries))
    }
    return compatibilityCache.get(key)
  }

  anchorObjectives.forEach((anchorObjective, objectiveIndex) => {
    const anchorEntry = {
      key: `${Number(anchorQuest.id)}:${objectiveIndex}`,
      quest: anchorQuest,
      objective: anchorObjective,
    }
    const candidates = openEntries.filter(
      ({ quest, objective }) =>
        Number(quest.id) !== Number(anchorQuest.id) && objective.kind === anchorObjective.kind,
    )
    let best = [anchorEntry]

    const visit = (index, selected) => {
      if (selected.length > best.length) best = selected
      if (best.length >= maximumQuestCount) return
      for (let candidateIndex = index; candidateIndex < candidates.length; candidateIndex += 1) {
        const candidateEntry = candidates[candidateIndex]
        if (selected.some(({ quest }) => Number(quest.id) === Number(candidateEntry.quest.id))) {
          continue
        }
        const next = [...selected, candidateEntry]
        if (areCompatible(next)) visit(candidateIndex + 1, next)
        if (best.length >= maximumQuestCount) return
      }
    }

    visit(0, [anchorEntry])
    if (best.length > 1) plans.push(planForEntries(anchorQuest, best))
  })

  return uniquePlans(plans)
}
