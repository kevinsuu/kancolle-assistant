const MAX_FLEET_SIZE = 6
const MAX_ACTIVE_QUEST_COUNT = 5
const compatibilityCacheByQuestList = new WeakMap()

const candidate = (id, ...tags) => ({ id, tags: new Set(tags) })

// Ship facts are atomic inputs to the fleet solver. Quest combinations are never listed here;
// every group is derived by intersecting actions and solving the merged fleet constraints.
const FLEET_CANDIDATES = [
  ...Array.from({ length: 6 }, (_, index) => candidate(`dd-${index}`, 'dd')),
  ...Array.from({ length: 4 }, (_, index) => candidate(`de-${index}`, 'de')),
  ...Array.from({ length: 3 }, (_, index) => candidate(`cl-${index}`, 'cl')),
  ...Array.from({ length: 3 }, (_, index) => candidate(`ca-${index}`, 'ca')),
  ...Array.from({ length: 2 }, (_, index) => candidate(`cav-${index}`, 'cav')),
  ...Array.from({ length: 3 }, (_, index) => candidate(`carrier-${index}`, 'carrier')),
  ...Array.from({ length: 2 }, (_, index) => candidate(`bb-${index}`, 'bb')),
  ...Array.from({ length: 2 }, (_, index) => candidate(`bbv-${index}`, 'bbv')),
  ...Array.from({ length: 2 }, (_, index) => candidate(`av-${index}`, 'av')),
  ...Array.from({ length: 4 }, (_, index) => candidate(`us-dd-${index}`, 'dd', 'us', 'usuk')),
  ...Array.from({ length: 4 }, (_, index) => candidate(`usuk-ca-${index}`, 'ca', 'usuk')),
  ...Array.from({ length: 4 }, (_, index) => candidate(`akizuki-${index}`, 'dd', 'akizuki')),
  candidate('kasumi', 'dd', 'kasumi'),
  candidate('arare', 'dd', 'arare'),
  candidate('kagerou', 'dd', 'kagerou'),
  candidate('shiranui', 'dd', 'shiranui'),
  candidate('fubuki', 'dd', 'fubuki'),
  candidate('shirayuki', 'dd', 'shirayuki'),
  candidate('hatsuyuki', 'dd', 'hatsuyuki'),
  candidate('miyuki', 'dd', 'miyuki'),
  candidate('mutsuki', 'dd', 'mutsuki'),
  candidate('kisaragi', 'dd', 'kisaragi'),
  candidate('yayoi', 'dd', 'yayoi'),
  candidate('mochizuki', 'dd', 'mochizuki'),
  candidate('ayanami', 'dd', 'ayanami'),
  candidate('shikinami', 'dd', 'shikinami'),
  candidate('shiratsuyu', 'dd', 'shiratsuyu'),
  candidate('shigure', 'dd', 'shigure'),
  candidate('yamakaze', 'dd', 'yamakaze'),
  candidate('murasame', 'dd', 'second-desdiv'),
  candidate('yuudachi', 'dd', 'second-desdiv'),
  candidate('harusame', 'dd', 'second-desdiv'),
  candidate('samidare', 'dd', 'second-desdiv'),
  candidate('akebono', 'dd', 'desdiv-seven'),
  candidate('ushio', 'dd', 'desdiv-seven'),
  candidate('sazanami', 'dd', 'desdiv-seven'),
  candidate('oboro', 'dd', 'desdiv-seven', 'oboro'),
  candidate('akigumo', 'dd', 'akigumo'),
  candidate('yukikaze', 'dd', 'yukikaze'),
  candidate('fletcher-1', 'dd', 'us', 'usuk', 'fletcher-group'),
  candidate('fletcher-2', 'dd', 'us', 'usuk', 'fletcher-group'),
  candidate('houshou-kai-ni', 'carrier', 'houshou-kai-ni'),
  candidate('gambier-bay-kai-ni', 'carrier', 'gambier-bay-kai-ni', 'us', 'usuk'),
  candidate('akagi-kai-ni', 'carrier', 'akagi-kai-ni'),
  candidate('kaga', 'carrier', 'kaga'),
  candidate('shoukaku', 'carrier', 'shoukaku'),
  candidate('zuikaku', 'carrier', 'zuikaku'),
  candidate('ise-kai-ni', 'bbv', 'ise-kai-ni', 'fourth-air-squadron'),
  candidate('hyuuga-kai-ni', 'bbv', 'hyuuga-kai-ni', 'fourth-air-squadron'),
  candidate('hiei-kai-ni', 'bb', 'hiei', 'hiei-kai-ni'),
  candidate('kirishima-kai-ni', 'bb', 'kirishima', 'kirishima-kai-ni'),
  candidate('nagato-kai-ni', 'bb', 'nagato'),
  candidate('mutsu-kai-ni', 'bb', 'mutsu'),
  candidate('tenryuu-kai-ni', 'cl', 'tenryuu', 'air-defense-ship'),
  candidate('tatsuta-kai-ni', 'cl', 'tatsuta', 'air-defense-ship'),
  candidate('isuzu-kai-ni', 'cl', 'isuzu', 'air-defense-ship'),
  candidate('noshiro-kai-ni', 'cl', 'noshiro-kai-ni'),
  candidate('yuubari-kai-ni', 'cl', 'yuubari-kai-ni'),
  candidate('maya-kai-ni', 'ca', 'maya', 'air-defense-ship'),
  candidate('mikuma-kai-ni', 'cav', 'mikuma-kai-ni'),
]

FLEET_CANDIDATES.forEach((ship) => {
  if (ship.tags.has('akizuki')) ship.tags.add('air-defense-ship')
})

const count = (tag, minimum, maximum = null) => ({ tags: [tag], minimum, maximum })
const countAny = (tags, minimum, maximum = null) => ({ tags, minimum, maximum })
const fleet = ({ flag, second, counts = [], allowed, forbidden = [] } = {}) => ({
  flag: flag ? [flag].flat() : [],
  second: second ? [second].flat() : [],
  counts,
  allowed: allowed ? [allowed].flat() : [],
  forbidden: [forbidden].flat(),
})
const objective = (kind, fleetVariants = [fleet()], maps = null) => ({
  kind,
  fleetVariants,
  maps,
})

const EXERCISE_FREE = objective('exercise')
const SORTIE_FREE = objective('sortie')

// These are individual quest facts, not pair or stack recipes. The generic solver below derives
// every compatible exercise and sortie group from these independent constraints.
const OBJECTIVES_BY_CODE = {
  Cw1: EXERCISE_FREE,
  Cd1: EXERCISE_FREE,
  Cd2: EXERCISE_FREE,
  Cm1: EXERCISE_FREE,
  Cq1: objective('exercise', [
    fleet({ flag: 'carrier', counts: [count('carrier', 2), count('dd', 2)] }),
  ]),
  Cq2: objective('exercise', [
    fleet({
      counts: [count('kasumi', 1), count('arare', 1), count('kagerou', 1), count('shiranui', 1)],
    }),
  ]),
  C22: objective('exercise', [fleet({ flag: 'ise-kai-ni', counts: [count('dd', 2)] })]),
  C70: objective('exercise', [fleet({ flag: 'houshou-kai-ni', counts: [count('dd', 3)] })]),
  C72: objective('exercise', [
    fleet({
      counts: [
        count('fubuki', 1),
        count('shirayuki', 1),
        count('hatsuyuki', 1),
        count('miyuki', 1),
      ],
    }),
  ]),
  Cy10: objective('exercise', [
    fleet({
      counts: [
        count('fubuki', 1),
        count('shirayuki', 1),
        count('hatsuyuki', 1),
        count('miyuki', 1),
      ],
    }),
  ]),
  Cy6: objective('exercise', [
    fleet({ flag: 'gambier-bay-kai-ni', counts: [count('fletcher-group', 2)] }),
  ]),
  Cy15: objective('exercise', [
    fleet({
      counts: [count('hiei', 1), count('kirishima', 1), count('cl', 1), count('dd', 2)],
    }),
  ]),
  C77: objective('exercise', [
    fleet({
      counts: [
        count('hiei-kai-ni', 1),
        count('kirishima-kai-ni', 1),
        count('cl', 1),
        count('dd', 2),
      ],
    }),
  ]),

  Bw6: { ...SORTIE_FREE, maps: ['4-1', '4-2', '4-3', '4-4', '4-5'] },
  Bw7: SORTIE_FREE,
  Bq8: SORTIE_FREE,
  B162: SORTIE_FREE,
  B175: SORTIE_FREE,
  B202: objective('sortie', [fleet({ counts: [count('air-defense-ship', 3)] })]),
  Bq9: objective('sortie', [fleet({ counts: [count('carrier', 1)] })]),
  By6: objective('sortie', [
    fleet({ flag: ['dd', 'ca', 'cav'], counts: [countAny(['dd', 'de'], 3)] }),
  ]),
  B171: objective('sortie', [fleet({ counts: [count('dd', 3)] })]),
  B191: objective('sortie', [
    fleet({ counts: [count('de', 3)] }),
    fleet({ counts: [count('dd', 4)] }),
    fleet({ counts: [count('av', 2)] }),
  ]),
  Bm3: objective('sortie', [
    fleet({
      flag: 'cl',
      counts: [count('cl', 1, 3), count('dd', 3, 5)],
      allowed: ['cl', 'dd'],
    }),
  ]),
  B120: objective('sortie', [
    fleet({ counts: [count('tenryuu', 1), count('tatsuta', 1), count('dd', 2)] }),
  ]),
  B124: objective('sortie', [fleet({ counts: [count('desdiv-seven', 2)] })]),
  B147: objective('sortie', [fleet({ counts: [count('us', 2)] })]),
  B160: objective('sortie', [fleet({ flag: 'yukikaze' })]),
  Bq5: objective('sortie', [fleet({ counts: [count('cl', 1)] })]),
  B22: objective('sortie', [
    fleet({
      counts: [count('mutsuki', 1), count('kisaragi', 1), count('yayoi', 1), count('mochizuki', 1)],
    }),
  ]),
  B164: objective('sortie', [fleet({ flag: 'noshiro-kai-ni', counts: [count('dd', 3)] })]),
  By11: objective('sortie', [fleet({ counts: [count('usuk', 3)], forbidden: ['carrier'] })]),
  B140: objective('sortie', [fleet({ flag: 'yuubari-kai-ni' })]),
  B172: objective('sortie', [fleet({ flag: 'yamakaze', counts: [countAny(['dd', 'de'], 4)] })]),
  B197: objective('sortie', [fleet({ counts: [count('second-desdiv', 3)] })]),
  B143: objective('sortie', [
    fleet({
      counts: [count('shoukaku', 1), count('zuikaku', 1), count('oboro', 1), count('akigumo', 1)],
    }),
  ]),
  B132: objective('sortie', [
    fleet({ counts: [count('ise-kai-ni', 1), count('hyuuga-kai-ni', 1)] }),
  ]),
  B99: objective('sortie', [fleet({ flag: 'nagato', second: 'mutsu' })]),
  B121: objective('sortie', [fleet({ counts: [count('shiratsuyu', 1), count('shigure', 1)] })]),
  B137: objective('sortie', [fleet({ flag: 'akagi-kai-ni', second: 'kaga' })]),
  By1: objective('sortie', [fleet({ counts: [count('ayanami', 1), count('shikinami', 1)] })]),
  B102: objective('sortie', [
    fleet({
      flag: 'fourth-air-squadron',
      second: 'fourth-air-squadron',
      counts: [count('fourth-air-squadron', 2), count('cl', 1), count('dd', 2)],
    }),
  ]),
  B196: objective('sortie', [fleet({ flag: 'mikuma-kai-ni' })]),
  By4: objective('sortie', [fleet({ counts: [count('ca', 3), count('dd', 1)] })]),
}

const normalizedObjectives = (quest) => {
  const explicit = Array.isArray(quest?.synergyObjectives) ? quest.synergyObjectives : null
  const source = explicit?.length ? explicit : [OBJECTIVES_BY_CODE[String(quest?.code || '')]]
  return source.filter(Boolean).map((entry) => ({
    ...entry,
    maps:
      entry.kind === 'sortie'
        ? entry.maps || (Array.isArray(quest?.mapIds) ? quest.mapIds : [])
        : [],
  }))
}

const matchesAnyTag = (ship, tags) => tags.some((tag) => ship.tags.has(tag))
const matchingCount = (ships, tags) => ships.filter((ship) => matchesAnyTag(ship, tags)).length

const fleetSatisfiesConstraints = (ships, constraints) => {
  if (constraints.allowed.length > 0) {
    if (ships.some((ship) => constraints.allowed.some((tags) => !matchesAnyTag(ship, tags)))) {
      return false
    }
  }
  if (constraints.forbidden.some((tag) => ships.some((ship) => ship.tags.has(tag)))) return false
  if (
    constraints.counts.some(({ tags, minimum, maximum }) => {
      const actual = matchingCount(ships, tags)
      return actual < minimum || (Number.isFinite(maximum) && actual > maximum)
    })
  ) {
    return false
  }

  const flagCandidates = constraints.flag.length
    ? ships.filter((ship) => constraints.flag.every((tags) => matchesAnyTag(ship, tags)))
    : ships
  if (flagCandidates.length === 0) return false
  if (constraints.second.length === 0) return true
  return flagCandidates.some((flagship) =>
    ships.some(
      (ship) =>
        ship.id !== flagship.id && constraints.second.every((tags) => matchesAnyTag(ship, tags)),
    ),
  )
}

const mergedConstraints = (variants) => ({
  flag: variants.filter(({ flag }) => flag.length > 0).map(({ flag }) => flag),
  second: variants.filter(({ second }) => second.length > 0).map(({ second }) => second),
  counts: variants.flatMap(({ counts }) => counts),
  allowed: variants.filter(({ allowed }) => allowed.length > 0).map(({ allowed }) => allowed),
  forbidden: variants.flatMap(({ forbidden }) => forbidden),
})

const flattenConstraintTags = (constraints) =>
  new Set([
    ...constraints.flag.flat(),
    ...constraints.second.flat(),
    ...constraints.counts.flatMap(({ tags }) => tags),
    ...constraints.allowed.flat(),
    ...constraints.forbidden,
  ])

const candidatePool = (constraints) => {
  const relevantTags = flattenConstraintTags(constraints)
  const groups = new Map()
  FLEET_CANDIDATES.filter((ship) => matchesAnyTag(ship, [...relevantTags])).forEach((ship) => {
    const signature = [...ship.tags]
      .filter((tag) => relevantTags.has(tag))
      .sort()
      .join('|')
    const sameSignature = groups.get(signature) || []
    if (sameSignature.length < MAX_FLEET_SIZE) sameSignature.push(ship)
    groups.set(signature, sameSignature)
  })
  return [...groups.values()].flat()
}

const constraintsHaveFleet = (constraints) => {
  if (flattenConstraintTags(constraints).size === 0) return true
  const pool = candidatePool(constraints).filter(
    (ship) =>
      constraints.allowed.every((tags) => matchesAnyTag(ship, tags)) &&
      !matchesAnyTag(ship, constraints.forbidden),
  )
  const positionRequirements = [constraints.flag, constraints.second].filter(
    (requirements) => requirements.length > 0,
  )

  const exceedsMaximum = (ships) =>
    constraints.counts.some(
      ({ tags, maximum }) => Number.isFinite(maximum) && matchingCount(ships, tags) > maximum,
    )

  const fillRequiredCounts = (selected) => {
    if (selected.length > MAX_FLEET_SIZE || exceedsMaximum(selected)) return false
    const unsatisfied = constraints.counts
      .filter(({ tags, minimum }) => matchingCount(selected, tags) < minimum)
      .map((requirement) => ({
        requirement,
        candidates: pool.filter(
          (ship) => !selected.includes(ship) && matchesAnyTag(ship, requirement.tags),
        ),
      }))
      .sort((left, right) => left.candidates.length - right.candidates.length)[0]

    if (!unsatisfied) {
      if (selected.length > 0 && (!constraints.second.length || selected.length > 1)) {
        return fleetSatisfiesConstraints(selected, constraints)
      }
      return pool.some(
        (ship) =>
          !selected.includes(ship) && fleetSatisfiesConstraints([...selected, ship], constraints),
      )
    }

    return unsatisfied.candidates.some((ship) => fillRequiredCounts([...selected, ship]))
  }

  const choosePositions = (index, selected) => {
    if (index === positionRequirements.length) return fillRequiredCounts(selected)
    const requirements = positionRequirements[index]
    return pool.some(
      (ship) =>
        !selected.includes(ship) &&
        requirements.every((tags) => matchesAnyTag(ship, tags)) &&
        choosePositions(index + 1, [...selected, ship]),
    )
  }

  return choosePositions(0, [])
}

const fleetRulesAreCompatible = (rules) => {
  const chooseVariants = (index, selected) => {
    if (index === rules.length) return constraintsHaveFleet(mergedConstraints(selected))
    return rules[index].some((variant) => chooseVariants(index + 1, [...selected, variant]))
  }
  return chooseVariants(0, [])
}

const sharedAction = (entries) => {
  const kinds = new Set(entries.map(({ objective: entry }) => entry.kind))
  if (kinds.size !== 1) return null
  const kind = entries[0]?.objective.kind
  if (kind === 'exercise') return { kind, maps: [] }
  if (kind !== 'sortie') return null
  const commonMaps = entries
    .slice(1)
    .reduce(
      (maps, { objective: entry }) => maps.filter((mapId) => entry.maps.includes(mapId)),
      [...entries[0].objective.maps],
    )
  return commonMaps.length > 0 ? { kind, maps: commonMaps } : null
}

const entriesAreCompatible = (entries) => {
  if (!sharedAction(entries)) return false
  return fleetRulesAreCompatible(entries.map(({ objective: entry }) => entry.fleetVariants))
}

const participant = (quest) => ({
  id: quest.id,
  code: quest.code,
  name: quest.name,
  status: quest.status,
  period: quest.period,
  resetAt: quest.resetAt,
  locked: false,
})

const planForEntries = (anchorQuest, entries) => {
  const action = sharedAction(entries)
  const quests = entries.map(({ quest }) => quest)
  const questIds = quests.map(({ id }) => Number(id)).sort((left, right) => left - right)
  const relationKind = action.kind === 'exercise' ? 'sameExercise' : 'sameSortie'
  const fleetKey = action.kind === 'exercise' ? 'sharedExercise' : 'compatibleFleet'
  const instructionKey = action.kind === 'exercise' ? 'sharedExercise' : 'compatibleSortie'
  const participants = quests.map(participant)
  return {
    id: `objective-${action.kind}-${questIds.join('-')}-${action.maps.join('-')}`,
    priority: 140,
    relationKinds: [relationKind],
    mapIds: action.maps,
    fleetKey,
    extraObjectiveKeys: [],
    instructionKeys: [instructionKey],
    companions: participants.filter(({ id }) => Number(id) !== Number(anchorQuest.id)),
    stages: [
      {
        kind: relationKind,
        questIds,
        mapIds: action.maps,
        fleetKey,
        extraObjectiveKeys: [],
        instructionKeys: [instructionKey],
        participants,
      },
    ],
  }
}

export const findObjectiveSynergies = (anchorQuest, quests) => {
  if (!anchorQuest || (anchorQuest.status !== 1 && anchorQuest.status !== 2)) return []
  const anchorObjectives = normalizedObjectives(anchorQuest)
  if (anchorObjectives.length === 0) return []

  const compatibilityCache = compatibilityCacheByQuestList.get(quests) || new Map()
  compatibilityCacheByQuestList.set(quests, compatibilityCache)
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
  const openEntries = quests
    .filter((quest) => quest && (quest.status === 1 || quest.status === 2))
    .flatMap((quest) =>
      normalizedObjectives(quest).map((entry, objectiveIndex) => ({
        key: `${Number(quest.id)}:${objectiveIndex}`,
        quest,
        objective: entry,
      })),
    )
  const plans = []

  anchorObjectives.forEach((anchorObjective, objectiveIndex) => {
    const anchorEntry = {
      key: `${Number(anchorQuest.id)}:${objectiveIndex}`,
      quest: anchorQuest,
      objective: anchorObjective,
    }
    const candidates = openEntries.filter(
      ({ quest, objective: entry }) =>
        Number(quest.id) !== Number(anchorQuest.id) && entry.kind === anchorObjective.kind,
    )
    let best = [anchorEntry]

    const visit = (index, selected) => {
      if (selected.length > best.length) best = selected
      if (best.length >= MAX_ACTIVE_QUEST_COUNT) return
      for (let candidateIndex = index; candidateIndex < candidates.length; candidateIndex += 1) {
        const candidateEntry = candidates[candidateIndex]
        if (selected.some(({ quest }) => Number(quest.id) === Number(candidateEntry.quest.id))) {
          continue
        }
        const next = [...selected, candidateEntry]
        if (areCompatible(next)) visit(candidateIndex + 1, next)
        if (best.length >= MAX_ACTIVE_QUEST_COUNT) return
      }
    }

    visit(0, [anchorEntry])
    if (best.length > 1) plans.push(planForEntries(anchorQuest, best))
  })

  return [...new Map(plans.map((plan) => [plan.id, plan])).values()]
}

export const hasQuestObjective = (quest) => normalizedObjectives(quest).length > 0
