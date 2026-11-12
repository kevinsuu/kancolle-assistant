import assert from 'node:assert/strict'
import test from 'node:test'
import { rankQuestRecommendations } from '../browser/recommendation/quest-recommendation.js'
import {
  questGuideSearchUrl,
  questMatchesSearch,
} from '../browser/recommendation/quest-recommendation-search.js'
import {
  filterAndSortQuestRecommendationGroups,
  questRecommendationListMarkup,
} from '../browser/recommendation/quest-recommendation-ui.js'

test('quest search matches every term across ID, code, title, and requirement', () => {
  const quest = { id: 214, code: 'Bw1', name: 'あ号作戦', description: 'Sortie 36 times.' }
  assert.equal(questMatchesSearch(quest, ''), true)
  assert.equal(questMatchesSearch(quest, 'bw1'), true)
  assert.equal(questMatchesSearch(quest, 'ＢＷ１'), true)
  assert.equal(questMatchesSearch(quest, '214 sortie'), true)
  assert.equal(questMatchesSearch(quest, 'あ号 exercise'), false)
  assert.equal(
    questGuideSearchUrl(quest),
    `https://www.google.com/search?q=${encodeURIComponent('艦これ Bw1 あ号作戦 攻略')}`,
  )
})

test('quest view filters by search and renders a guide search link', () => {
  const quest = (id, code, name, description) => ({
    id,
    code,
    name,
    description,
    period: 'oneTime',
    status: 1,
  })
  const result = rankQuestRecommendations(
    [
      quest(1401, 'B401', 'Sortie to 1-1', 'Sortie to 1-1.'),
      quest(1402, 'B402', 'Sortie to 2-2', 'Sortie to 2-2.'),
      quest(1403, 'C403', 'Exercise fixture', 'Win exercises.'),
    ],
    { now: Date.UTC(2026, 8, 1) },
  )
  const idsFor = (view) => view.groups.flatMap(({ quests }) => quests.map(({ id }) => id))
  assert.deepEqual(idsFor(filterAndSortQuestRecommendationGroups(result)), [1403, 1401, 1402])
  assert.deepEqual(idsFor(filterAndSortQuestRecommendationGroups(result, { searchQuery: '2-2' })), [
    1402,
  ])
  assert.equal(
    filterAndSortQuestRecommendationGroups(result, { searchQuery: 'no such quest' })
      .visibleQuestCount,
    0,
  )

  const markup = questRecommendationListMarkup({
    ...result,
    groups: filterAndSortQuestRecommendationGroups(result).groups,
  })
  assert.match(markup, /class="dqr-guide-link" href="https:\/\/www\.google\.com\/search\?q=/)
  assert.match(markup, /target="_blank" rel="noreferrer"/)
  assert.doesNotMatch(markup, /data-quest-pin|data-quest-memo/)
})
