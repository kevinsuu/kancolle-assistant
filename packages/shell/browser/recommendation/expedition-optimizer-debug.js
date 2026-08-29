import {
  compareOptimizationCombinations,
  validateOptimizationDebugReport,
} from '@kancolle-assistant/recommendation-core'

const PREFIX = '[KancolleOptimizer]'
const DEBUG_STORAGE_KEY = 'kancolleOptimizerDebug'
const GLOBAL_DEBUG_FLAG = '__KANCOLLE_OPTIMIZER_DEBUG__'
const resourceKeys = ['fuel', 'ammo', 'steel', 'bauxite', 'bucket']
const baselineComparisonIds = ['02', '05', '38']
const winnerChallengerIds = [
  ['A2', '05', '38'],
  ['02', 'A2', '38'],
  ['05', 'A2', 'B1'],
  ['02', 'A2', 'B1'],
]
const bucketDebugExpeditionIds = ['02', '04', '09', 'A2', 'B1', '41']

let lastOptimizationDebugReport = null

const storage = () => {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

export const isOptimizerDebugEnabled = () =>
  globalThis[GLOBAL_DEBUG_FLAG] === true || storage()?.getItem(DEBUG_STORAGE_KEY) === 'true'

const setOptimizerDebugEnabled = (enabled) => {
  globalThis[GLOBAL_DEBUG_FLAG] = enabled
  const localStorage = storage()
  if (!localStorage) return
  if (enabled) {
    localStorage.setItem(DEBUG_STORAGE_KEY, 'true')
  } else {
    localStorage.removeItem(DEBUG_STORAGE_KEY)
  }
}

const fixed = (value, digits) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue.toFixed(digits) : String(value)
}

const rounded = (value, digits) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? Number(numericValue.toFixed(digits)) : null
}

const digitsForResource = (resource) => (resource === 'bucket' ? 3 : 2)

const combinationLabel = (combination) => combination.expeditionIds.join(' + ')
const combinationLabelFromIds = (ids) => ids.join(' + ')
const compactCombinationLabelFromIds = (ids) => ids.join('+')
const compactCombinationLabel = (combination) =>
  compactCombinationLabelFromIds(combination.expeditionIds)
const topYield = (report, combination, resource) => {
  const value = fixed(
    combination.resourceScores[resource].rawYieldPerHour,
    digitsForResource(resource),
  )
  return report.context.preferences?.[resource]?.mode === 'constraint' ? `${value} ✓` : value
}

const resourceRows = (combination) =>
  resourceKeys.map((resource) => {
    const score = combination.resourceScores[resource]
    return {
      resource,
      netPerHour: fixed(score.rawYieldPerHour, digitsForResource(resource)),
      benchmark: fixed(score.benchmarkPerHour, digitsForResource(resource)),
      satisfaction: fixed(score.satisfaction, 4),
      utility: fixed(score.utility, 4),
      rawWeight: score.rawWeight,
      normalizedWeight: fixed(score.normalizedWeight, 4),
      contribution: fixed(score.weightedContribution, 6),
      contributionPercent: `${fixed(score.contributionRatio * 100, 1)}%`,
    }
  })

const topRankingRows = (report) =>
  report.topCombinations.map((combination) => ({
    rank: combination.rank,
    expeditions: combinationLabel(combination),
    score: fixed(combination.totalScore, 6),
    fuelPerHour: topYield(report, combination, 'fuel'),
    ammoPerHour: topYield(report, combination, 'ammo'),
    steelPerHour: topYield(report, combination, 'steel'),
    bauxitePerHour: topYield(report, combination, 'bauxite'),
    bucketPerHour: topYield(report, combination, 'bucket'),
  }))

const benchmarkRows = (report) =>
  resourceKeys.map((resource) => {
    const benchmark = report.benchmarks[resource]
    return {
      Resource: resource,
      Benchmark: fixed(benchmark.bestPerHour, digitsForResource(resource)),
      'Combination producing benchmark': benchmark.bestCombination.join(' + '),
    }
  })

const scoreSummaryRow = (combination) => ({
  Combination: combinationLabel(combination),
  Score: fixed(combination.totalScore, 6),
  'Fuel/h': fixed(combination.resourceScores.fuel.rawYieldPerHour, 2),
  'Ammo/h': fixed(combination.resourceScores.ammo.rawYieldPerHour, 2),
  'Steel/h': fixed(combination.resourceScores.steel.rawYieldPerHour, 2),
  'Bauxite/h': fixed(combination.resourceScores.bauxite.rawYieldPerHour, 2),
  'Bucket/h': fixed(combination.resourceScores.bucket.rawYieldPerHour, 3),
})

const requestedComparisonIds = [baselineComparisonIds, ...winnerChallengerIds]

const combinationKeyFromIds = (ids) => ids.map(String).sort().join('|')

const findCombinationScore = (report, ids) => {
  const key = combinationKeyFromIds(ids)
  const candidates = [...(report.rankedCombinations ?? []), ...report.topCombinations]
  report.pareto.watchedCombinations.forEach((combination) => {
    if (combination.score) candidates.push(combination.score)
  })
  return candidates.find((combination) => combinationKeyFromIds(combination.expeditionIds) === key)
}

const requestedCombinationRows = (report) =>
  requestedComparisonIds.map((ids) => {
    const combination = findCombinationScore(report, ids)
    const label = combination ? combinationLabel(combination) : combinationLabelFromIds(ids)
    if (!combination) {
      return {
        Combination: label,
        Status: 'missing',
        'Fuel/h': 'missing',
        'Ammo/h': 'missing',
        'Steel/h': 'missing',
        'Bauxite/h': 'missing',
        'Bucket/h': 'missing',
        'Fuel Satisfaction': 'missing',
        'Bucket Satisfaction': 'missing',
        'Fuel Contribution': 'missing',
        'Bucket Contribution': 'missing',
        'Total Score': 'missing',
      }
    }
    return {
      Combination: label,
      Status: 'scored',
      'Fuel/h': fixed(combination.resourceScores.fuel.rawYieldPerHour, 2),
      'Ammo/h': fixed(combination.resourceScores.ammo.rawYieldPerHour, 2),
      'Steel/h': fixed(combination.resourceScores.steel.rawYieldPerHour, 2),
      'Bauxite/h': fixed(combination.resourceScores.bauxite.rawYieldPerHour, 2),
      'Bucket/h': fixed(combination.resourceScores.bucket.rawYieldPerHour, 3),
      'Fuel Satisfaction': fixed(combination.resourceScores.fuel.satisfaction, 4),
      'Bucket Satisfaction': fixed(combination.resourceScores.bucket.satisfaction, 4),
      'Fuel Contribution': fixed(combination.resourceScores.fuel.weightedContribution, 6),
      'Bucket Contribution': fixed(combination.resourceScores.bucket.weightedContribution, 6),
      'Total Score': fixed(combination.totalScore, 6),
    }
  })

const netYieldJson = (combination) =>
  resourceKeys.reduce((values, resource) => {
    values[resource] = rounded(
      combination.resourceScores[resource].rawYieldPerHour,
      digitsForResource(resource),
    )
    return values
  }, {})

const resourceScoreJson = (combination) =>
  resourceKeys.reduce((values, resource) => {
    const score = combination.resourceScores[resource]
    values[resource] = {
      benchmark: rounded(score.benchmarkPerHour, digitsForResource(resource)),
      satisfaction: rounded(score.satisfaction, 6),
      utility: rounded(score.utility, 6),
      rawWeight: score.rawWeight,
      normalizedWeight: rounded(score.normalizedWeight, 6),
      contribution: rounded(score.weightedContribution, 9),
    }
    return values
  }, {})

const combinationJson = (combination) => ({
  rank: combination.rank,
  expeditionIds: [...combination.expeditionIds],
  expeditionNames: [...combination.expeditionNames],
  netYieldPerHour: netYieldJson(combination),
  resources: resourceScoreJson(combination),
  totalScore: rounded(combination.totalScore, 9),
})

const contextJson = (report) => ({
  preferenceMode: report.context.preferenceMode,
  preferences: report.context.preferences,
  priorityOrder: report.context.priorityOrder,
  weights: report.context.weights,
  normalizedWeights: report.context.normalizedWeights,
  fleetCount: report.context.fleetCount,
  collectionIntervalMinutes: report.context.collectionIntervalMinutes,
  successMode: report.context.successMode,
  resourceMultiplier: report.context.effectiveResourceMultiplier,
  comparisonWindowMinutes: report.context.comparisonWindowMinutes,
})

const benchmarksJson = (report) =>
  resourceKeys.reduce((values, resource) => {
    const benchmark = report.benchmarks[resource]
    values[resource] = {
      benchmark: rounded(benchmark.bestPerHour, digitsForResource(resource)),
      combinationProducingBenchmark: [...benchmark.bestCombination],
    }
    return values
  }, {})

const paretoStatisticsRows = (report) => [
  {
    totalCombinationCount: report.context.totalCombinationCount,
    constraintRejectedCount: report.context.constraintRejectedCount,
    feasibleCombinationCount: report.context.feasibleCombinationCount,
    paretoRemovedCount: report.context.paretoRemovedCount,
    paretoRemainingCount: report.context.paretoRemainingCount,
    remainingCombinationCount: report.context.remainingCombinationCount,
  },
]

const watchedCombinationRows = (report) =>
  report.pareto.watchedCombinations.map((combination) => ({
    Combination: combinationLabelFromIds(combination.expeditionIds),
    ValidBeforePruning: combination.validBeforePruning,
    ParetoDominated: combination.paretoDominated,
    PresentAfterPruning: combination.presentAfterPruning,
    DominatedBy: combination.dominatedBy ? combination.dominatedBy.join(' + ') : '',
  }))

const watchedScoreRows = (report) =>
  report.pareto.watchedCombinations
    .filter((combination) => combination.validBeforePruning && combination.score)
    .map((combination) => scoreSummaryRow(combination.score))

const expeditionYieldRows = (combination) =>
  combination.expeditionYields.map((expedition) => ({
    expedition: `${expedition.displayNo} ${expedition.name}`,
    durationMinutes: expedition.durationMinutes,
    effectiveCycleMinutes: expedition.effectiveCycleMinutes,
    fuelPerHour: fixed(expedition.expectedNetPerHour.fuel, 2),
    ammoPerHour: fixed(expedition.expectedNetPerHour.ammo, 2),
    steelPerHour: fixed(expedition.expectedNetPerHour.steel, 2),
    bauxitePerHour: fixed(expedition.expectedNetPerHour.bauxite, 2),
    bucketPerHour: fixed(expedition.expectedNetPerHour.bucket, 3),
    bucketPerRun: fixed(expedition.bucketExpectedPerRun, 3),
  }))

const expeditionYieldJson = (expedition) => ({
  id: expedition.displayNo,
  name: expedition.name,
  durationMinutes: expedition.durationMinutes,
  effectiveCycleMinutes: expedition.effectiveCycleMinutes,
  baseReward: expedition.baseReward,
  resourceRewardAfterSuccessMultiplier: expedition.resourceRewardAfterSuccessMultiplier,
  resourceRewardAfterDaihatsu: expedition.resourceRewardAfterDaihatsu,
  bucketExpectedPerRun: expedition.bucketExpectedPerRun,
  supplyCostPerRun: expedition.supplyCostPerRun,
  netRewardPerRun: expedition.netRewardPerRun,
  expectedNetPerHour: expedition.expectedNetPerHour,
  itemRewardDebug: expedition.itemRewardDebug,
  selectedReasons: [...expedition.selectedReasons],
})

const logExpeditionYields = (combination) => {
  console.table(expeditionYieldRows(combination))
  combination.expeditionYields.forEach((expedition) => {
    console.log(
      `${PREFIX} Expedition ${expedition.displayNo} ${expedition.name}\n` +
        JSON.stringify(expeditionYieldJson(expedition), null, 2),
    )
  })
}

const logDetailedCombination = (
  combination,
  labelPrefix = `Rank #${combination.rank} Breakdown`,
) => {
  console.group(`${PREFIX} ${labelPrefix} ${combinationLabel(combination)}`)
  console.table(resourceRows(combination))
  console.log('Total Score:', fixed(combination.totalScore, 6))
  if (combination.expeditionYields) {
    logExpeditionYields(combination)
  }
  console.groupEnd()
}

const explanationRows = (items) =>
  items.map((item) => ({
    Resource: item.resource,
    'Yield Difference/h': fixed(item.yieldDifferencePerHour, digitsForResource(item.resource)),
    'Contribution Difference': fixed(item.contributionDifference, 6),
  }))

const prioritySummary = (report) => {
  if (report.context.preferenceMode !== 'priority') return null
  const ordered = report.context.priorityOrder.filter((item) => item.rank !== null)
  if (ordered.length === 0) return null
  return ordered
    .slice(0, 3)
    .map((item) => `${item.resource} is priority #${item.rank}`)
    .join(', ')
}

const logWinnerExplanation = (report) => {
  const explanation = report.winnerExplanation
  if (!explanation) return
  console.group(`${PREFIX} Why Rank #1 won`)
  console.log('Winner:', explanation.winner)
  console.log('Runner-up:', explanation.runnerUp)
  const priorityText = prioritySummary(report)
  if (priorityText) console.log('Priority summary:', priorityText)
  console.log('Score Difference:', fixed(explanation.scoreDifference, 6))
  if (explanation.advantages.length > 0) {
    console.log('Advantages')
    console.table(explanationRows(explanation.advantages))
  }
  if (explanation.disadvantages.length > 0) {
    console.log('Disadvantages')
    console.table(explanationRows(explanation.disadvantages))
  }
  console.groupEnd()
}

const logNearTie = (nearTie) => {
  if (!nearTie) return
  console.group(`${PREFIX} Near tie detected`)
  console.log('Score gap:', fixed(nearTie.scoreGap, 6))
  console.table(explanationRows(nearTie.contributionGaps))
  console.groupEnd()
}

const logViolations = (report) => {
  validateOptimizationDebugReport(report).forEach((violation) => {
    console.error(`${PREFIX} Scoring invariant violated\n${JSON.stringify(violation, null, 2)}`)
  })
}

const comparisonParties = (comparison) => {
  if (comparison.winner === 'right') {
    return {
      winnerLabel: comparison.right,
      challengerLabel: comparison.left,
      winnerScore: comparison.rightScore,
      challengerScore: comparison.leftScore,
      winnerIsLeft: false,
    }
  }
  return {
    winnerLabel: comparison.left,
    challengerLabel: comparison.right,
    winnerScore: comparison.leftScore,
    challengerScore: comparison.rightScore,
    winnerIsLeft: true,
  }
}

const orientedComparisonDeltas = (comparison) => {
  const parties = comparisonParties(comparison)
  return comparison.resourceDeltas.map((delta) => {
    const winnerYield = parties.winnerIsLeft ? delta.leftYieldPerHour : delta.rightYieldPerHour
    const challengerYield = parties.winnerIsLeft ? delta.rightYieldPerHour : delta.leftYieldPerHour
    const winnerContribution = parties.winnerIsLeft
      ? delta.leftContribution
      : delta.rightContribution
    const challengerContribution = parties.winnerIsLeft
      ? delta.rightContribution
      : delta.leftContribution
    return {
      resource: delta.resource,
      winnerYield,
      challengerYield,
      yieldDifference: winnerYield - challengerYield,
      winnerContribution,
      challengerContribution,
      contributionDifference: winnerContribution - challengerContribution,
    }
  })
}

const comparisonRows = (comparison) =>
  orientedComparisonDeltas(comparison).map((delta) => ({
    Resource: delta.resource,
    'Winner Yield': fixed(delta.winnerYield, digitsForResource(delta.resource)),
    'Challenger Yield': fixed(delta.challengerYield, digitsForResource(delta.resource)),
    'Yield Difference': fixed(delta.yieldDifference, digitsForResource(delta.resource)),
    'Winner Contribution': fixed(delta.winnerContribution, 6),
    'Challenger Contribution': fixed(delta.challengerContribution, 6),
    'Contribution Difference': fixed(delta.contributionDifference, 6),
  }))

const contributionReasonRows = (comparison, direction) =>
  orientedComparisonDeltas(comparison)
    .map((delta) => ({
      Resource: delta.resource,
      'Contribution Difference': delta.contributionDifference,
    }))
    .filter((delta) =>
      direction === 'advantage'
        ? delta['Contribution Difference'] > 0
        : delta['Contribution Difference'] < 0,
    )
    .sort(
      (left, right) =>
        Math.abs(right['Contribution Difference']) - Math.abs(left['Contribution Difference']),
    )
    .map((delta, index) => ({
      Rank: index + 1,
      Resource: delta.Resource,
      'Contribution Difference': fixed(delta['Contribution Difference'], 6),
    }))

const logCombinationComparison = (comparison, label = 'COMBINATION COMPARISON') => {
  if (!comparison) {
    console.warn(`${PREFIX} ${label} unavailable: one or both combinations are missing.`)
    return null
  }
  const parties = comparisonParties(comparison)
  const winnerScoreDifference = parties.winnerScore - parties.challengerScore
  console.group(`${PREFIX} ${label}`)
  console.table(comparisonRows(comparison))
  console.log('Winner score:', fixed(parties.winnerScore, 6))
  console.log('Challenger score:', fixed(parties.challengerScore, 6))
  console.log('Score difference:', fixed(winnerScoreDifference, 6))
  console.log(`Why ${parties.winnerLabel} beats ${parties.challengerLabel}:`)
  console.log('Advantages')
  console.table(contributionReasonRows(comparison, 'advantage'))
  console.log('Disadvantages')
  console.table(contributionReasonRows(comparison, 'disadvantage'))
  console.log('Final:', fixed(winnerScoreDifference, 6))
  console.groupEnd()
  return comparison
}

const logWinnerComparisons = (report) => {
  const winner = report.topCombinations[0]
  if (!winner) return
  winnerChallengerIds.forEach((challengerIds) => {
    const comparison = compareOptimizationCombinations(report, winner.expeditionIds, challengerIds)
    logCombinationComparison(
      comparison,
      `Compare ${compactCombinationLabel(winner)} vs ${compactCombinationLabelFromIds(
        challengerIds,
      )}`,
    )
  })
}

const logBaselineComparisons = (report) => {
  const winner = report.topCombinations[0]
  if (
    winner &&
    compactCombinationLabel(winner) === compactCombinationLabelFromIds(baselineComparisonIds)
  ) {
    return
  }
  winnerChallengerIds.forEach((challengerIds) => {
    const comparison = compareOptimizationCombinations(report, baselineComparisonIds, challengerIds)
    logCombinationComparison(
      comparison,
      `Compare ${compactCombinationLabelFromIds(
        baselineComparisonIds,
      )} vs ${compactCombinationLabelFromIds(challengerIds)}`,
    )
  })
}

const logWatchedCombinations = (report) => {
  console.log(`${PREFIX} Watched Combinations`)
  const scoreRows = watchedScoreRows(report)
  if (scoreRows.length > 0) {
    console.table(scoreRows)
  }
  report.pareto.watchedCombinations.forEach((combination) => {
    if (!combination.validBeforePruning || !combination.score) return
    logDetailedCombination(
      combination.score,
      `Watched Breakdown ${compactCombinationLabelFromIds(combination.expeditionIds)}`,
    )
  })
}

const bucketDebugRows = (report) => {
  const candidates = [...report.detailedCombinations]
  report.pareto.watchedCombinations.forEach((combination) => {
    if (combination.score) candidates.push(combination.score)
  })

  const expeditionsById = new Map()
  candidates.forEach((combination) => {
    combination.expeditionYields?.forEach((expedition) => {
      if (!expeditionsById.has(expedition.displayNo)) {
        expeditionsById.set(expedition.displayNo, expedition)
      }
    })
  })

  return bucketDebugExpeditionIds.map((id) => {
    const expedition = expeditionsById.get(id)
    if (!expedition) {
      return {
        expeditionId: id,
        durationMinutes: 'missing',
        bucketMin: 'missing',
        bucketMax: 'missing',
        itemPosition: 'missing',
        rewardRule: 'missing',
        successMode: 'missing',
        acquisitionProbability: 'missing',
        expectedBucketPerRun: 'missing',
        expectedBucketPerHour: 'missing',
      }
    }
    return {
      expeditionId: expedition.displayNo,
      durationMinutes: expedition.durationMinutes,
      bucketMin: expedition.itemRewardDebug?.min ?? 0,
      bucketMax: expedition.itemRewardDebug?.max ?? 0,
      itemPosition: expedition.itemRewardDebug?.itemPosition ?? 'none',
      rewardRule: expedition.itemRewardDebug?.rewardRule ?? 'none',
      successMode: expedition.itemRewardDebug?.successMode ?? 'n/a',
      acquisitionProbability: expedition.itemRewardDebug?.acquisitionProbability ?? 0,
      expectedBucketPerRun: fixed(expedition.bucketExpectedPerRun, 3),
      expectedBucketPerHour: fixed(expedition.expectedNetPerHour.bucket, 3),
    }
  })
}

const fullScoreDebugJson = (report) => ({
  context: contextJson(report),
  benchmarks: benchmarksJson(report),
  constraintRejectedCombinations: report.constraintRejectedCombinations.map((combination) => ({
    expeditionIds: [...combination.expeditionIds],
    expeditions: combination.expeditions,
    constraintViolations: combination.constraintViolations.map((violation) => ({ ...violation })),
    totalNetYield: { ...combination.totalNetYield },
  })),
  pareto: {
    totalCombinationCount: report.pareto.totalCombinationCount,
    paretoRemovedCount: report.pareto.paretoRemovedCount,
    remainingCombinationCount: report.pareto.remainingCombinationCount,
    watchedCombinations: report.pareto.watchedCombinations.map((combination) => ({
      requestedExpeditionIds: [...combination.requestedExpeditionIds],
      expeditionIds: [...combination.expeditionIds],
      validBeforePruning: combination.validBeforePruning,
      paretoDominated: combination.paretoDominated,
      presentAfterPruning: combination.presentAfterPruning,
      dominatedBy: combination.dominatedBy ? [...combination.dominatedBy] : null,
      rankAfterPruning: combination.rankAfterPruning,
      score: combination.score ? combinationJson(combination.score) : null,
    })),
  },
  top10: report.topCombinations.map(combinationJson),
  requestedCombinationSummary: requestedCombinationRows(report),
  bucketDebug: bucketDebugRows(report),
})

export const logOptimizationDebugReport = (result) => {
  if (!isOptimizerDebugEnabled()) return
  const report = result?.optimizationDebug
  if (!report) {
    console.warn(`${PREFIX} Optimization debug was enabled, but no debug report was returned.`)
    return
  }

  lastOptimizationDebugReport = report
  console.group(`${PREFIX} Optimization started`)
  console.log(`${PREFIX} Context`)
  console.log(JSON.stringify(contextJson(report), null, 2))
  console.log(`${PREFIX} Benchmarks`)
  console.table(benchmarkRows(report))
  console.log(`${PREFIX} Pareto Statistics`)
  console.table(paretoStatisticsRows(report))
  console.table(watchedCombinationRows(report))
  console.log(`${PREFIX} Top 10`)
  console.table(topRankingRows(report))
  console.log(`${PREFIX} Requested Combination Summary`)
  console.table(requestedCombinationRows(report))
  report.detailedCombinations.forEach((combination) => logDetailedCombination(combination))
  logWatchedCombinations(report)
  logWinnerComparisons(report)
  logBaselineComparisons(report)
  console.log(`${PREFIX} Bucket Debug`)
  console.table(bucketDebugRows(report))
  logWinnerExplanation(report)
  logNearTie(report.nearTie)
  logViolations(report)
  console.log(`${PREFIX} FULL_SCORE_DEBUG\n${JSON.stringify(fullScoreDebugJson(report), null, 2)}`)
  console.groupEnd()
}

export const installOptimizerDebugConsoleHelper = () => {
  const api = {
    enable: () => {
      setOptimizerDebugEnabled(true)
      console.info(
        `${PREFIX} Debug logging enabled. Generate an expedition plan to print a report.`,
      )
    },
    disable: () => {
      setOptimizerDebugEnabled(false)
      console.info(`${PREFIX} Debug logging disabled.`)
    },
    isEnabled: isOptimizerDebugEnabled,
    lastReport: () => lastOptimizationDebugReport,
    compareOptimizationCombinations: (leftExpeditionIds, rightExpeditionIds) =>
      logCombinationComparison(
        lastOptimizationDebugReport
          ? compareOptimizationCombinations(
              lastOptimizationDebugReport,
              leftExpeditionIds,
              rightExpeditionIds,
            )
          : null,
      ),
  }
  globalThis.KancolleOptimizerDebug = api
  if (typeof globalThis.compareOptimizationCombinations === 'undefined') {
    globalThis.compareOptimizationCombinations = api.compareOptimizationCombinations
  }
}
