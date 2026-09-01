import { QUEST_RECOMMENDATIONS_CHANNEL } from './channels'
import { createStrategyRoomI18n } from './i18n'
import { QUEST_CHAPTER_KEYS } from './quest-recommendation'
import { escapeHtml, formatLocalizedDate } from './strategy-room-format'
import { panelMarkup, styles } from './views/quest-recommendation-view'

let { locale, t, translateMessage } = createStrategyRoomI18n()
const MARKDOWN_EXPORT_LOG_PREFIX = '[KancolleQuestMarkdownExport]'

const markdownText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([*_`[\]<>])/g, '\\$1')
    .replace(/\r?\n/g, '<br>')
const markdownList = (items) => items.map(markdownText).join(t('common.listSeparator'))

const sanitizedErrorMessage = (error) => String(error?.message || error || 'unknown').slice(0, 200)

const formatResetAt = (value) =>
  formatLocalizedDate(
    value,
    locale,
    { dateStyle: 'medium', timeStyle: 'short', hour12: false },
    '—',
  )

const remainingLabel = (remainingMs) => {
  const totalMinutes = Math.max(1, Math.ceil(Number(remainingMs || 0) / 60_000))
  let days = Math.floor(totalMinutes / 1_440)
  let hours = Math.ceil((totalMinutes % 1_440) / 60)
  if (hours === 24) {
    days += 1
    hours = 0
  }
  if (days > 0) return t('quest.remainingDaysHours', { days, hours })
  if (totalMinutes >= 60) return t('quest.remainingHours', { hours: Math.ceil(totalMinutes / 60) })
  return t('quest.remainingMinutes', { minutes: totalMinutes })
}

const rewardItems = (reward) => {
  const items = []
  if (reward?.hasBlueprint) {
    items.push({ key: 'blueprint', icon: 'medal.png', label: t('quest.reward.blueprint') })
  }
  if (reward?.hasMedal) {
    items.push({ key: 'medal', icon: 'medal.png', label: t('quest.reward.medal') })
  }
  if (reward?.hasActionReport) {
    items.push({ key: 'actionReport', icon: 'bounty.png', label: t('quest.reward.actionReport') })
  }
  if (Number(reward?.screwCount) > 0) {
    items.push({
      key: 'screws',
      icon: 'screws.png',
      label: t('quest.reward.screws', { count: reward.screwCount }),
    })
  } else if (reward?.hasScrews) {
    items.push({
      key: 'screws',
      icon: 'screws.png',
      label: t('quest.reward.screwsGeneric'),
    })
  }
  ;(reward?.materialKeys || []).forEach((key) => {
    items.push({ key, icon: 'gear.png', label: t(`quest.reward.material.${key}`) })
  })
  if (reward?.isChoiceReward) {
    items.push({ key: 'choice', icon: 'box3.png', label: t('quest.reward.choice') })
  }
  return items.length > 0
    ? items
    : [{ key: 'other', icon: 'box3.png', label: t('quest.reward.other') }]
}

const rewardCategoryFor = (reward) =>
  ['medalBlueprint', 'actionReport', 'screws'].includes(reward?.category)
    ? reward.category
    : 'other'

export const QUEST_REWARD_FILTERS = [
  'medalBlueprint',
  'actionReport',
  'screws',
  'equipmentMaterials',
]

export const QUEST_SORT_MODES = ['deadlineAsc', 'deadlineDesc', 'stepsAsc']
export const QUEST_MAP_CHAPTER_KEYS = QUEST_CHAPTER_KEYS.filter((chapterKey) =>
  /^world[1-7]$/.test(chapterKey),
)

const rewardMatchesFilter = (reward, filter) => {
  if (filter === 'equipmentMaterials') {
    return rewardCategoryFor(reward) === 'other' || (reward?.materialKeys || []).length > 0
  }
  return rewardCategoryFor(reward) === filter
}

const groupsFor = (result) =>
  result.groups ||
  (result.recommendations || []).map((quest) => ({
    id: `quest:${quest.id}`,
    kind: quest.synergies?.length ? 'combined' : 'single',
    resetAt: quest.resetAt,
    quests: [quest],
    synergy: quest.synergies?.[0] || null,
  }))

const questMatchesFilters = (quest, filters) => {
  if (filters.size === 0) return true
  const rewards = [quest.reward, ...(quest.downstreamTargets || []).map((target) => target.reward)]
  return rewards.some((reward) =>
    [...filters].some((filter) => rewardMatchesFilter(reward, filter)),
  )
}

const questMapChapterKeys = (quest) => [
  ...new Set(
    (quest.mapIds || [])
      .map((mapId) => Number(String(mapId).split('-')[0]))
      .filter((world) => world >= 1 && world <= 7)
      .map((world) => `world${world}`),
  ),
]

const normalizeScopedGroup = (group, quests, mapScope, preserveCombination) => {
  const isCombined =
    preserveCombination && group.kind === 'combined' && group.synergy && quests.length > 1
  return {
    ...group,
    id: `${group.id}:${mapScope}`,
    kind: isCombined ? 'combined' : 'single',
    synergy: isCombined ? group.synergy : null,
    quests,
    mapScope,
  }
}

const splitGroupsByMapScope = (groups) =>
  groups.flatMap((group) => {
    const nonSortieQuests = (group.quests || []).filter(
      (quest) => questMapChapterKeys(quest).length === 0,
    )
    const sortieQuests = (group.quests || []).filter(
      (quest) => questMapChapterKeys(quest).length > 0,
    )
    const splitScope = (quests, mapScope) => {
      if (quests.length === 0) return []
      const preserveCombination = quests.length === (group.quests || []).length
      return preserveCombination
        ? [normalizeScopedGroup(group, quests, mapScope, true)]
        : quests.map((quest) => normalizeScopedGroup(group, [quest], mapScope, false))
    }
    return [...splitScope(nonSortieQuests, 'nonSortie'), ...splitScope(sortieQuests, 'sortie')]
  })

const questStepCount = (quest, filters) => {
  const currentRewardMatches =
    filters.size === 0
      ? quest.reward?.valuable === true
      : [...filters].some((filter) => rewardMatchesFilter(quest.reward, filter))
  if (currentRewardMatches) return 0

  const matchingDepths = (quest.downstreamTargets || [])
    .filter((target) =>
      filters.size === 0
        ? target.reward?.valuable === true
        : [...filters].some((filter) => rewardMatchesFilter(target.reward, filter)),
    )
    .map((target) => Number(target.depth))
    .filter(Number.isFinite)
  return matchingDepths.length > 0 ? Math.min(...matchingDepths) : Number.POSITIVE_INFINITY
}

const groupDeadline = (group, direction) => {
  const resetTimes = (group.quests || [])
    .map((quest) => quest.resetAt)
    .filter((resetAt) => resetAt !== null && resetAt !== undefined)
    .map(Number)
    .filter(Number.isFinite)
  if (resetTimes.length === 0) return null
  return direction === 'desc' ? Math.max(...resetTimes) : Math.min(...resetTimes)
}

const compareDeadline = (left, right, direction = 'asc') => {
  const leftDeadline = groupDeadline(left, direction)
  const rightDeadline = groupDeadline(right, direction)
  if (leftDeadline === null && rightDeadline === null) return 0
  if (leftDeadline === null) return 1
  if (rightDeadline === null) return -1
  return direction === 'desc' ? rightDeadline - leftDeadline : leftDeadline - rightDeadline
}

export const filterAndSortQuestRecommendationGroups = (
  result,
  { chapterFilters = QUEST_MAP_CHAPTER_KEYS, rewardFilters = [], sortMode = 'deadlineAsc' } = {},
) => {
  const filters = new Set(rewardFilters.filter((filter) => QUEST_REWARD_FILTERS.includes(filter)))
  const chapters = new Set(
    chapterFilters.filter((chapterKey) => QUEST_MAP_CHAPTER_KEYS.includes(chapterKey)),
  )
  const normalizedSortMode = QUEST_SORT_MODES.includes(sortMode) ? sortMode : 'deadlineAsc'
  const groups = splitGroupsByMapScope(
    groupsFor(result)
      .map((group, originalIndex) => ({
        ...group,
        originalIndex,
        quests: (group.quests || []).filter((quest) => questMatchesFilters(quest, filters)),
      }))
      .filter((group) => group.quests.length > 0),
  )
    .map((group) => ({
      ...group,
      quests:
        group.mapScope === 'nonSortie'
          ? group.quests
          : group.quests.filter((quest) =>
              questMapChapterKeys(quest).some((chapterKey) => chapters.has(chapterKey)),
            ),
    }))
    .filter((group) => group.quests.length > 0)

  groups.sort((left, right) => {
    const scopeComparison =
      Number(left.mapScope !== 'nonSortie') - Number(right.mapScope !== 'nonSortie')
    if (scopeComparison !== 0) return scopeComparison
    let comparison = 0
    if (normalizedSortMode === 'stepsAsc') {
      const leftSteps = Math.min(...left.quests.map((quest) => questStepCount(quest, filters)))
      const rightSteps = Math.min(...right.quests.map((quest) => questStepCount(quest, filters)))
      comparison = leftSteps - rightSteps
      if (!Number.isFinite(comparison)) comparison = 0
      if (comparison === 0) comparison = compareDeadline(left, right)
    } else {
      comparison = compareDeadline(
        left,
        right,
        normalizedSortMode === 'deadlineDesc' ? 'desc' : 'asc',
      )
    }
    return comparison || left.originalIndex - right.originalIndex
  })

  return {
    groups: groups.map(({ originalIndex: _originalIndex, ...group }) => group),
    visibleQuestCount: groups.reduce((count, group) => count + group.quests.length, 0),
  }
}

const rewardItemMarkup = (reward, compact = false) => {
  const rewardCategory = rewardCategoryFor(reward)
  return rewardItems(reward)
    .map(
      ({ key, icon, label }) =>
        `<span class="dqr-reward ${rewardCategory} ${escapeHtml(key)}${compact ? ' compact' : ''}"><img src="../../assets/img/client/${escapeHtml(icon)}" alt="" aria-hidden="true"><span>${escapeHtml(label)}</span></span>`,
    )
    .join('')
}

const downstreamTargetsMarkup = (targets) => {
  if (!targets?.length) return ''
  return `<section class="dqr-downstream">
    <strong>${escapeHtml(t('quest.downstream.title'))}</strong>
    ${targets
      .map(
        (target) => `<article>
          <header><b>${escapeHtml(target.code || target.id)}</b><span>${escapeHtml(target.name || t('quest.unknownName'))}</span><em>${escapeHtml(t('quest.downstream.steps', { count: target.depth }))}</em></header>
          <div class="dqr-rewards ${rewardCategoryFor(target.reward)}">${rewardItemMarkup(target.reward, true)}</div>
        </article>`,
      )
      .join('')}
  </section>`
}

const adviceTier = (quest) =>
  quest.guidance?.tier ||
  { medalBlueprint: 'highest', actionReport: 'priority', screws: 'recommended' }[
    quest.reward?.category
  ] ||
  'optional'

const guidanceReasonLabels = (guidance) =>
  (guidance?.reasonKeys || []).map((key) => {
    if (key.startsWith('missingShip:')) {
      return t('quest.guidance.missingShip', {
        ship: t(`quest.requirement.ship.${key.slice('missingShip:'.length)}`),
      })
    }
    if (key === 'steelCost') {
      return t('quest.guidance.steelCost', { count: guidance.costs?.steel || 0 })
    }
    return t(`quest.guidance.${key}`)
  })

const stageMarkup = (stage) => {
  const objectives = (stage.extraObjectiveKeys || []).map((key) => t(`quest.synergy.extra.${key}`))
  const participants = stage.participants || []
  return `
    <section class="dqr-plan-stage ${escapeHtml(stage.kind)}">
      <header class="dqr-stage-heading">
        <span class="dqr-relation ${escapeHtml(stage.kind)}">${escapeHtml(
          t(`quest.relation.${stage.kind}`),
        )}</span>
        ${
          stage.mapIds?.length
            ? `<strong>${escapeHtml(t('quest.synergy.maps', { maps: stage.mapIds.join(' / ') }))}</strong>`
            : ''
        }
        <span>${escapeHtml(t(`quest.synergy.fleet.${stage.fleetKey}`))}</span>
      </header>
      ${
        participants.length
          ? `<div class="dqr-stage-participants">${participants
              .map(
                ({ id, code, name, locked }) =>
                  `<span class="${locked ? 'locked' : ''}"><b>${escapeHtml(code || id)}</b> ${escapeHtml(name || '')}${
                    locked ? `<em>${escapeHtml(t('quest.state.locked'))}</em>` : ''
                  }</span>`,
              )
              .join('')}</div>`
          : ''
      }
      ${
        objectives.length
          ? `<div class="dqr-stage-objectives"><span>${escapeHtml(t('quest.synergy.objectivesLabel'))}</span><strong>${objectives.map(escapeHtml).join('・')}</strong></div>`
          : ''
      }
      <ol class="dqr-synergy-steps">${(stage.instructionKeys || [])
        .map((key) => `<li>${escapeHtml(t(`quest.synergy.instruction.${key}`))}</li>`)
        .join('')}</ol>
    </section>
  `
}

const synergyStages = (synergy) =>
  synergy.stages || [
    {
      kind: 'sameSortie',
      mapIds: synergy.mapIds || [],
      fleetKey: synergy.fleetKey,
      extraObjectiveKeys: synergy.extraObjectiveKeys || [],
      instructionKeys: synergy.instructionKeys || [],
      participants: synergy.companions || [],
    },
  ]
const synergyDetailMarkup = (synergy) => {
  const stages = synergyStages(synergy)
  return `<aside class="dqr-synergy-detail" aria-label="${escapeHtml(
    t('quest.synergy.title'),
  )}">${stages.map(stageMarkup).join('')}</aside>`
}

const questNodeMarkup = (quest) => {
  const tier = adviceTier(quest)
  const period = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'oneTime'].includes(
    quest.period,
  )
    ? quest.period
    : 'other'
  const rewardCategory = rewardCategoryFor(quest.reward)
  const reasons = guidanceReasonLabels(quest.guidance)
  const hasDeadline = quest.remainingMs !== null && quest.resetAt !== null
  const isUrgent = hasDeadline && Number(quest.remainingMs) <= 24 * 60 * 60 * 1000
  return `
  <li class="dqr-quest-node">
    <article class="dqr-quest-row bscolor3 fcolor2">
      <header class="dqr-quest-header">
        <div class="dqr-quest-icon ${period}">${escapeHtml(quest.code || quest.id)}</div>
        <div class="dqr-heading">
          <h2>${escapeHtml(quest.name || t('quest.unknownName'))}</h2>
        </div>
        <div class="dqr-tags">
          <span class="dqr-tag period ${period}">${t(`quest.period.${period}`)}</span>
          <span class="dqr-tag state">${t(`quest.state.${quest.status === 2 ? 'active' : 'open'}`)}</span>
        </div>
      </header>
      <div class="dqr-card-grid">
        <section class="dqr-card-cell requirement">
          <span class="dqr-cell-label">${escapeHtml(t('quest.card.requirement'))}</span>
          <p class="dqr-description">${escapeHtml(
            quest.description || t('quest.requirement.unknown'),
          )}</p>
          ${reasons.length ? `<div class="dqr-guidance-reasons">${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')}</div>` : ''}
        </section>
        <section class="dqr-card-cell reward">
          <span class="dqr-cell-label">${escapeHtml(t('quest.card.reward'))}</span>
          <div class="dqr-rewards ${rewardCategory}">${rewardItemMarkup(quest.reward)}</div>
          ${downstreamTargetsMarkup(quest.downstreamTargets)}
        </section>
        <section class="dqr-card-cell schedule">
          <span class="dqr-cell-label">${escapeHtml(t('quest.card.schedule'))}</span>
          <div class="dqr-priority ${tier}">
            <span>${escapeHtml(t('quest.priority.label'))}</span>
            <strong>${escapeHtml(t(`quest.priority.${tier}`))}</strong>
          </div>
          <div class="dqr-deadline ${isUrgent ? 'urgent' : ''}">${escapeHtml(
            hasDeadline
              ? t('quest.deadline', {
                  remaining: remainingLabel(quest.remainingMs),
                  resetAt: formatResetAt(quest.resetAt),
                })
              : t('quest.noFixedDeadline'),
          )}</div>
        </section>
      </div>
    </article>
  </li>
  `
}

const groupMarkup = (group) => {
  const quests = group.quests || []
  const synergy = group.synergy
  const isCombined = group.kind === 'combined' && synergy
  return `
    <li class="dqr-list-entry ${isCombined ? 'combined' : 'single'}">
      <section class="dqr-group bscolor4 fcolor2" aria-label="${escapeHtml(
        isCombined ? t('quest.group.combined') : quests[0]?.name || t('quest.unknownName'),
      )}">
        ${
          isCombined
            ? `<header class="dqr-group-heading">
                <div><strong>${escapeHtml(t('quest.group.combined'))}</strong><span>${escapeHtml(t('quest.group.questCount', { count: quests.length }))}</span></div>
                <div class="dqr-group-relations">${(synergy.relationKinds || ['sameSortie'])
                  .map(
                    (kind) =>
                      `<span class="dqr-relation ${escapeHtml(kind)}">${escapeHtml(t(`quest.relation.${kind}`))}</span>`,
                  )
                  .join('')}</div>
              </header>`
            : ''
        }
        <ol class="dqr-branch">${quests.map(questNodeMarkup).join('')}</ol>
        ${isCombined ? synergyDetailMarkup(synergy) : ''}
      </section>
    </li>
  `
}

const extraOperationMarkup = (extraOperations) => {
  if (!extraOperations?.length) return ''
  return `
    <section class="dqr-eo-strip bscolor4 fcolor2" aria-label="${escapeHtml(t('quest.eo.title'))}">
      <div><strong>${escapeHtml(t('quest.eo.title'))}</strong><span>${escapeHtml(t('quest.eo.hint'))}</span></div>
      <div class="dqr-eo-list">${extraOperations
        .map(
          ({ mapId, status }) =>
            `<span class="${escapeHtml(status)}"><b>${escapeHtml(mapId)}</b>${escapeHtml(
              t(`quest.eo.status.${status}`),
            )}</span>`,
        )
        .join('')}</div>
    </section>`
}

export const questRecommendationListMarkup = (result) => {
  const groups = splitGroupsByMapScope(groupsFor(result)).sort(
    (left, right) => Number(left.mapScope !== 'nonSortie') - Number(right.mapScope !== 'nonSortie'),
  )
  return `${extraOperationMarkup(result.extraOperations)}<ol class="dqr-list">${groups
    .map(groupMarkup)
    .join('')}</ol>`
}

const questDeadlineLabel = (quest) =>
  quest.remainingMs !== null && quest.resetAt !== null
    ? t('quest.deadline', {
        remaining: remainingLabel(quest.remainingMs),
        resetAt: formatResetAt(quest.resetAt),
      })
    : t('quest.noFixedDeadline')

const questMarkdown = (quest, headingLevel, headingPrefix = '') => {
  const tier = adviceTier(quest)
  const period = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'oneTime'].includes(
    quest.period,
  )
    ? quest.period
    : 'other'
  const heading = `${'#'.repeat(headingLevel)} ${headingPrefix}${markdownText(
    quest.code || quest.id,
  )}｜${markdownText(quest.name || t('quest.unknownName'))}`
  const lines = [
    heading,
    '',
    `- **${markdownText(t(`quest.period.${period}`))}** · ${markdownText(
      t(`quest.state.${quest.status === 2 ? 'active' : 'open'}`),
    )}`,
    `- **${markdownText(t('quest.priority.label'))}:** ${markdownText(
      t(`quest.priority.${tier}`),
    )}`,
    `- **${markdownText(t('quest.card.schedule'))}:** ${markdownText(questDeadlineLabel(quest))}`,
    '',
    `${'#'.repeat(headingLevel + 1)} ${markdownText(t('quest.card.requirement'))}`,
    '',
    markdownText(quest.description || t('quest.requirement.unknown')),
  ]
  const guidanceReasons = guidanceReasonLabels(quest.guidance)
  if (guidanceReasons.length) {
    lines.push('', ...guidanceReasons.map((reason) => `- ${markdownText(reason)}`))
  }
  lines.push(
    '',
    `${'#'.repeat(headingLevel + 1)} ${markdownText(t('quest.card.reward'))}`,
    '',
    ...rewardItems(quest.reward).map(({ label }) => `- ${markdownText(label)}`),
  )
  if (quest.downstreamTargets?.length) {
    lines.push(
      '',
      `${'#'.repeat(headingLevel + 2)} ${markdownText(t('quest.downstream.title'))}`,
      '',
    )
    quest.downstreamTargets.forEach((target) => {
      lines.push(
        `- **${markdownText(target.code || target.id)}｜${markdownText(
          target.name || t('quest.unknownName'),
        )}** — ${markdownText(t('quest.downstream.steps', { count: target.depth }))}`,
      )
      rewardItems(target.reward).forEach(({ label }) => {
        lines.push(`  - ${markdownText(label)}`)
      })
    })
  }
  return lines
}

const synergyMarkdown = (synergy, headingLevel) => {
  const lines = [`${'#'.repeat(headingLevel)} ${markdownText(t('quest.synergy.title'))}`, '']
  synergyStages(synergy).forEach((stage, stageIndex) => {
    lines.push(
      `${'#'.repeat(headingLevel + 1)} ${stageIndex + 1}. ${markdownText(
        t(`quest.relation.${stage.kind}`),
      )}`,
      '',
    )
    if (stage.mapIds?.length) {
      lines.push(`- ${markdownText(t('quest.synergy.maps', { maps: stage.mapIds.join(' / ') }))}`)
    }
    lines.push(
      `- **${markdownText(t('quest.synergy.fleetLabel'))}:** ${markdownText(
        t(`quest.synergy.fleet.${stage.fleetKey}`),
      )}`,
    )
    if (stage.participants?.length) {
      lines.push(`- **${markdownText(t('quest.exportParticipants'))}:**`)
      stage.participants.forEach(({ id, code, name, locked }) => {
        const lockedLabel = locked ? ` · ${t('quest.state.locked')}` : ''
        lines.push(`  - ${markdownText(`${code || id}｜${name || ''}${lockedLabel}`)}`)
      })
    }
    const objectives = (stage.extraObjectiveKeys || []).map((key) =>
      t(`quest.synergy.extra.${key}`),
    )
    if (objectives.length) {
      lines.push(
        `- **${markdownText(t('quest.synergy.objectivesLabel'))}:** ${markdownList(objectives)}`,
      )
    }
    if (stage.instructionKeys?.length) {
      lines.push(
        '',
        ...stage.instructionKeys.map(
          (key) => `1. ${markdownText(t(`quest.synergy.instruction.${key}`))}`,
        ),
      )
    }
    lines.push('')
  })
  return lines
}

export const questRecommendationMarkdown = ({ result, viewState, exportedAt = new Date() }) => {
  if (!result || result.status === 'error') return ''
  const filtered = filterAndSortQuestRecommendationGroups(result, viewState)
  if (filtered.visibleQuestCount === 0) return ''

  const selectedChapters = viewState.chapterFilters.length
    ? viewState.chapterFilters.map((key) => t(`quest.chapter.${key}`))
    : [t('quest.exportNone')]
  const selectedRewards = viewState.rewardFilters.length
    ? viewState.rewardFilters.map((key) => t(`quest.filter.${key}`))
    : [t('quest.filter.all')]
  const lines = [
    `# ${markdownText(t('quest.title'))}`,
    '',
    `- ${markdownText(t('quest.exportedAt'))}: ${markdownText(formatResetAt(exportedAt))}`,
    `- ${markdownText(
      t('quest.status', {
        count: result.candidateCount,
        groups: result.groupCount,
        daily: result.dailyCount,
        weekly: result.weeklyCount,
        monthly: result.monthlyCount,
        quarterly: result.quarterlyCount,
        yearly: result.yearlyCount,
        oneTime: result.oneTimeCount || 0,
        downstream: result.downstreamValueQuestCount || 0,
        eo: result.availableExtraOperationCount || 0,
        unavailable: result.unavailableQuestCount || 0,
        updated: formatResetAt(result.generatedAt),
      }),
    )}`,
    '',
    `## ${markdownText(t('quest.exportFilters'))}`,
    '',
    `- **${markdownText(t('quest.chapterFilter.label'))}:** ${markdownList(selectedChapters)}`,
    `- **${markdownText(t('quest.filter.label'))}:** ${markdownList(selectedRewards)}`,
    `- **${markdownText(t('quest.sort.label'))}:** ${markdownText(
      t(`quest.sort.${viewState.sortMode}`),
    )}`,
    `- ${markdownText(t('quest.filter.visibleCount', { count: filtered.visibleQuestCount }))}`,
  ]

  if (result.extraOperations?.length) {
    lines.push('', `## ${markdownText(t('quest.eo.title'))}`, '')
    result.extraOperations.forEach(({ mapId, status }) => {
      lines.push(`- **${markdownText(mapId)}** — ${markdownText(t(`quest.eo.status.${status}`))}`)
    })
  }

  lines.push('', `## ${markdownText(t('quest.exportList'))}`, '')
  filtered.groups.forEach((group, groupIndex) => {
    const quests = group.quests || []
    const isCombined = group.kind === 'combined' && group.synergy
    if (isCombined) {
      lines.push(
        `### ${groupIndex + 1}. ${markdownText(t('quest.group.combined'))}`,
        '',
        `- ${markdownText(t('quest.group.questCount', { count: quests.length }))}`,
        `- ${markdownList(
          (group.synergy.relationKinds || ['sameSortie']).map((kind) =>
            t(`quest.relation.${kind}`),
          ),
        )}`,
        '',
      )
      quests.forEach((quest) => lines.push(...questMarkdown(quest, 4), ''))
      lines.push(...synergyMarkdown(group.synergy, 4))
    } else if (quests[0]) {
      lines.push(...questMarkdown(quests[0], 3, `${groupIndex + 1}. `), '')
    }
  })

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`
}

export const downloadQuestRecommendationMarkdown = (
  exportData,
  {
    documentObject = globalThis.document,
    urlObject = globalThis.URL,
    logger = globalThis.console,
  } = {},
) => {
  const markdown = questRecommendationMarkdown(exportData)
  const filtered = exportData.result
    ? filterAndSortQuestRecommendationGroups(exportData.result, exportData.viewState)
    : { groups: [], visibleQuestCount: 0 }
  const details = {
    event: 'quest-recommendation-markdown-export',
    visibleQuestCount: filtered.visibleQuestCount,
    groupCount: filtered.groups.length,
    chapterFilterCount: exportData.viewState?.chapterFilters?.length || 0,
    rewardFilterCount: exportData.viewState?.rewardFilters?.length || 0,
    sortMode: exportData.viewState?.sortMode || '',
    byteCount: new Blob([markdown]).size,
  }
  if (!markdown) {
    logger?.warn?.(MARKDOWN_EXPORT_LOG_PREFIX, {
      ...details,
      outcome: 'skipped',
      reasonCode: 'QUEST_RESULT_UNAVAILABLE',
    })
    return false
  }

  let objectUrl
  try {
    objectUrl = urlObject.createObjectURL(
      new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
    )
    const link = documentObject.createElement('a')
    const exportedAt = new Date(exportData.exportedAt || Date.now())
    const dateStamp = Number.isNaN(exportedAt.getTime())
      ? 'export'
      : exportedAt.toISOString().slice(0, 10)
    link.href = objectUrl
    link.download = `kancolle-quests-${dateStamp}.md`
    documentObject.body.appendChild(link)
    link.click()
    link.remove()
    logger?.info?.(MARKDOWN_EXPORT_LOG_PREFIX, { ...details, outcome: 'downloaded' })
    return true
  } catch (error) {
    logger?.warn?.(MARKDOWN_EXPORT_LOG_PREFIX, {
      ...details,
      outcome: 'failed',
      reasonCode: 'MARKDOWN_DOWNLOAD_FAILED',
      error: sanitizedErrorMessage(error),
    })
    return false
  } finally {
    if (objectUrl) urlObject.revokeObjectURL(objectUrl)
  }
}

const render = (root, result, viewState) => {
  const status = root.querySelector('.dqr-status')
  const output = root.querySelector('.dqr-output')
  const visibleCount = root.querySelector('.dqr-visible-count')
  if (!result || result.status === 'error') {
    status.classList.add('error')
    status.textContent = translateMessage(result?.error, 'quest.unavailable')
    visibleCount.textContent = ''
    output.innerHTML = `<div class="dqr-message bscolor3 fcolor2"><strong>${t('quest.notReady')}</strong><span>${t('quest.syncFirst')}</span></div>`
    return null
  }

  status.classList.remove('error')
  status.textContent = t('quest.status', {
    count: result.candidateCount,
    groups: result.groupCount,
    daily: result.dailyCount,
    weekly: result.weeklyCount,
    monthly: result.monthlyCount,
    quarterly: result.quarterlyCount,
    yearly: result.yearlyCount,
    oneTime: result.oneTimeCount || 0,
    downstream: result.downstreamValueQuestCount || 0,
    eo: result.availableExtraOperationCount || 0,
    unavailable: result.unavailableQuestCount || 0,
    updated: formatResetAt(result.generatedAt),
  })
  const filtered = filterAndSortQuestRecommendationGroups(result, viewState)
  visibleCount.textContent = t('quest.filter.visibleCount', { count: filtered.visibleQuestCount })
  if ((result.recommendations || []).length === 0) {
    output.innerHTML = `<div class="dqr-message bscolor3 fcolor2"><strong>${t('quest.emptyTitle')}</strong><span>${t('quest.emptyDetail')}</span></div>`
  } else if (filtered.visibleQuestCount === 0) {
    output.innerHTML = `<div class="dqr-message bscolor3 fcolor2"><strong>${t('quest.filter.emptyTitle')}</strong><span>${t('quest.filter.emptyDetail')}</span></div>`
  } else {
    output.innerHTML = questRecommendationListMarkup({ ...result, groups: filtered.groups })
  }
  return filtered
}

const mountPanel = (invoke) => {
  const content = document.querySelector('#content')
  const contentHtml = document.querySelector('#contentHtml')
  if (!content || !contentHtml) return
  content.style.display = 'block'
  contentHtml.innerHTML = panelMarkup(t)
  contentHtml.style.display = 'block'
  window.scrollTo(0, 0)

  const root = contentHtml.querySelector('.dqr-root')
  const exportButton = root.querySelector('.dqr-export')
  const refresh = root.querySelector('.dqr-refresh')
  const rewardFilterButtons = [...root.querySelectorAll('[data-quest-filter]')]
  const chapterFilterButtons = [...root.querySelectorAll('[data-quest-chapter]')]
  const filterButtons = [...rewardFilterButtons, ...chapterFilterButtons]
  const sortSelect = root.querySelector('.dqr-sort')
  const viewState = {
    chapterFilters: [...QUEST_MAP_CHAPTER_KEYS],
    rewardFilters: [],
    sortMode: 'deadlineAsc',
  }
  let currentResult = null
  let currentView = null
  let loadSequence = 0
  const renderCurrent = () => {
    currentView = render(root, currentResult, viewState)
    exportButton.disabled = !currentView || currentView.visibleQuestCount === 0
  }

  const syncControls = () => {
    rewardFilterButtons.forEach((button) => {
      const filter = button.dataset.questFilter
      const isActive =
        filter === 'all'
          ? viewState.rewardFilters.length === 0
          : viewState.rewardFilters.includes(filter)
      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', String(isActive))
    })
    chapterFilterButtons.forEach((button) => {
      const chapterKey = button.dataset.questChapter
      const isActive = viewState.chapterFilters.includes(chapterKey)
      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', String(isActive))
    })
  }

  rewardFilterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.questFilter
      if (filter === 'all') {
        viewState.rewardFilters = []
      } else if (QUEST_REWARD_FILTERS.includes(filter)) {
        viewState.rewardFilters = viewState.rewardFilters.includes(filter)
          ? viewState.rewardFilters.filter((value) => value !== filter)
          : [...viewState.rewardFilters, filter]
      }
      syncControls()
      if (currentResult) renderCurrent()
    })
  })

  chapterFilterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const chapterKey = button.dataset.questChapter
      if (!QUEST_MAP_CHAPTER_KEYS.includes(chapterKey)) return
      viewState.chapterFilters = viewState.chapterFilters.includes(chapterKey)
        ? viewState.chapterFilters.filter((value) => value !== chapterKey)
        : [...viewState.chapterFilters, chapterKey]
      syncControls()
      if (currentResult) renderCurrent()
    })
  })

  sortSelect.addEventListener('change', () => {
    viewState.sortMode = QUEST_SORT_MODES.includes(sortSelect.value)
      ? sortSelect.value
      : 'deadlineAsc'
    if (currentResult) renderCurrent()
  })
  syncControls()

  const load = async ({ forceSync = false } = {}) => {
    const sequence = ++loadSequence
    exportButton.disabled = true
    refresh.disabled = true
    filterButtons.forEach((button) => {
      button.disabled = true
    })
    sortSelect.disabled = true
    refresh.textContent = t(forceSync ? 'quest.syncingLatest' : 'common.refreshing')
    root.querySelector('.dqr-status').textContent = t(
      forceSync ? 'quest.syncingStatus' : 'quest.preparing',
    )
    root.querySelector('.dqr-output').innerHTML =
      `<div class="dqr-message bscolor3 fcolor2"><strong>${t(forceSync ? 'quest.syncingLatest' : 'quest.loading')}</strong><span>${t(forceSync ? 'quest.syncingDetail' : 'quest.loadingDetail')}</span></div>`
    let result
    try {
      result = await invoke(QUEST_RECOMMENDATIONS_CHANNEL, { forceSync })
    } catch {
      result = { status: 'error', error: { code: 'KC3_UNAVAILABLE' } }
    }
    if (sequence !== loadSequence) return
    currentResult = result
    renderCurrent()
    refresh.disabled = false
    filterButtons.forEach((button) => {
      button.disabled = false
    })
    sortSelect.disabled = false
    refresh.textContent = t('quest.syncLatest')
  }

  exportButton.addEventListener('click', () => {
    if (!currentResult || !currentView?.visibleQuestCount) return
    const exported = downloadQuestRecommendationMarkdown({
      result: currentResult,
      viewState: {
        chapterFilters: [...viewState.chapterFilters],
        rewardFilters: [...viewState.rewardFilters],
        sortMode: viewState.sortMode,
      },
      exportedAt: new Date(),
    })
    exportButton.querySelector('span').textContent = t(
      exported ? 'quest.exported' : 'quest.exportFailed',
    )
    window.setTimeout(() => {
      exportButton.querySelector('span').textContent = t('quest.exportMarkdown')
    }, 1_500)
  })
  refresh.addEventListener('click', () => void load({ forceSync: true }))
  void load()
}

export const injectQuestRecommendations = (invoke) => {
  ;({ locale, t, translateMessage } = createStrategyRoomI18n())
  if (!document.querySelector('#damecon-quest-recommendation-style')) {
    const style = document.createElement('style')
    style.id = 'damecon-quest-recommendation-style'
    style.textContent = styles
    document.head.appendChild(style)
  }

  const flowchartMenuItem = document.querySelector('#menu [data-id="flowchart"]')
  if (!flowchartMenuItem || document.querySelector('[data-id="damecon-quest-recommendation"]')) {
    return
  }
  const menuItem = document.createElement('li')
  menuItem.dataset.id = 'damecon-quest-recommendation'
  menuItem.textContent = t('quest.menu')
  menuItem.title = t('quest.menuTitle')
  menuItem.addEventListener(
    'click',
    (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      document.querySelectorAll('#menu .menulist li.active').forEach((item) => {
        item.classList.remove('active')
      })
      menuItem.classList.add('active')
      mountPanel(invoke)
    },
    true,
  )
  flowchartMenuItem.insertAdjacentElement('afterend', menuItem)
}
