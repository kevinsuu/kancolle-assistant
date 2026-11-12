import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RELATION_GRAPH_MAX_NODES,
  clampRelationViewBox,
  initialRelationViewBox,
  layoutQuestRelationGraph,
  questHasRelations,
  questRelationGraphPanelMarkup,
  questRelationGraphSvgMarkup,
  relatedQuestSubgraph,
} from '../browser/recommendation/quest-relation-graph.js'
import { rankQuestRecommendations } from '../browser/recommendation/quest-recommendation.js'
import { questRecommendationListMarkup } from '../browser/recommendation/quest-recommendation-ui.js'
import { normalizeQuestRelationGraph } from '../browser/recommendation/kc3-quest-recommendation.js'
import { en } from '../browser/recommendation/i18n/en.js'

const t = (key, values = {}) =>
  String(en[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match)

const node = (id, state = 'locked', name = `Quest ${id}`) => ({ id, code: `A${id}`, name, state })

// 1 → 2 → 4, 3 → 4 (4 needs both), 4 → 5, and sibling 1 → 6 that is unrelated to 4.
const graph = {
  nodes: [
    node(1, 'completed'),
    node(2, 'open'),
    node(3, 'active'),
    node(4),
    node(5),
    node(6),
    node(7),
  ],
  edges: [
    [1, 2],
    [2, 4],
    [3, 4],
    [4, 5],
    [1, 6],
  ],
  truncated: false,
}

test('relation subgraph keeps only ancestors and descendants of the center quest', () => {
  const subgraph = relatedQuestSubgraph(graph, 4)
  assert.deepEqual(
    subgraph.nodes.map(({ id }) => id),
    [1, 2, 3, 4, 5],
  )
  assert.deepEqual(subgraph.edges, [
    [1, 2],
    [2, 4],
    [3, 4],
    [4, 5],
  ])
  assert.equal(subgraph.truncated, false)
  assert.equal(questHasRelations(graph, 4), true)
  assert.equal(questHasRelations(graph, 7), false)
  assert.deepEqual(relatedQuestSubgraph(graph, 999), { nodes: [], edges: [], truncated: false })
})

test('relation subgraph is bounded by depth and node count', () => {
  const chain = {
    nodes: Array.from({ length: 20 }, (_, index) => node(index + 1)),
    edges: Array.from({ length: 19 }, (_, index) => [index + 1, index + 2]),
  }
  const byDepth = relatedQuestSubgraph(chain, 10, { maxDepth: 2 })
  assert.deepEqual(
    byDepth.nodes.map(({ id }) => id),
    [8, 9, 10, 11, 12],
  )
  assert.equal(byDepth.truncated, true)

  const star = {
    nodes: Array.from({ length: RELATION_GRAPH_MAX_NODES + 10 }, (_, index) => node(index + 1)),
    edges: Array.from({ length: RELATION_GRAPH_MAX_NODES + 9 }, (_, index) => [1, index + 2]),
  }
  const byCount = relatedQuestSubgraph(star, 1)
  assert.equal(byCount.nodes.length, RELATION_GRAPH_MAX_NODES)
  assert.equal(byCount.truncated, true)
})

test('relation layout places prerequisites left of successors without overlap', () => {
  const layout = layoutQuestRelationGraph(relatedQuestSubgraph(graph, 4))
  const byId = new Map(layout.nodes.map((placed) => [placed.id, placed]))
  for (const [from, to] of [
    [1, 2],
    [2, 4],
    [3, 4],
    [4, 5],
  ]) {
    assert.ok(byId.get(from).x < byId.get(to).x, `${from} should be left of ${to}`)
  }
  // 4 waits for the longer 1 → 2 chain; the short branch 3 sits right before 4, beside 2.
  assert.ok(byId.get(4).x > byId.get(2).x)
  assert.equal(byId.get(3).x, byId.get(2).x)
  assert.ok(byId.get(1).x < byId.get(3).x)
  for (const left of layout.nodes) {
    for (const right of layout.nodes) {
      if (left.id >= right.id || left.x !== right.x) continue
      assert.ok(Math.abs(left.y - right.y) >= left.height, `${left.id} overlaps ${right.id}`)
    }
    assert.ok(left.x >= 0 && left.x + left.width <= layout.width)
    assert.ok(left.y >= 0 && left.y + left.height <= layout.height)
  }
  assert.equal(layout.edges.length, 4)
  assert.match(layout.edges[0].path, /^M [\d.]+ [\d.]+ C /)

  const cyclic = layoutQuestRelationGraph({
    nodes: [node(1), node(2)],
    edges: [
      [1, 2],
      [2, 1],
    ],
  })
  assert.equal(cyclic.nodes.length, 2)
})

test('relation graph SVG escapes quest text and marks the center and states', () => {
  const subgraph = {
    nodes: [node(1, 'completed', '<script>x</script>'), node(2, 'open')],
    edges: [[1, 2]],
  }
  const markup = questRelationGraphSvgMarkup(layoutQuestRelationGraph(subgraph), 2, t)
  assert.match(markup, /class="dqr-graph-node completed"/)
  assert.match(markup, /class="dqr-graph-node open center"/)
  assert.match(markup, /marker-end="url\(#dqr-graph-arrow\)"/)
  assert.match(markup, />&lt;script&gt;x&lt;…<\/text>/)
  assert.match(markup, /<title>A1 &lt;script&gt;x&lt;\/script&gt; \(Completed\)<\/title>/)
  assert.doesNotMatch(markup, /<script>/)
  assert.match(questRelationGraphPanelMarkup(t), /Scroll the mouse wheel to move left and right/)
  assert.match(questRelationGraphPanelMarkup(t), /6 levels each way and up to 80 quests/)
})

test('quest cards offer the relation graph only for quests with relations', () => {
  const result = rankQuestRecommendations(
    [
      { id: 2, code: 'A2', name: 'Linked', description: '', period: 'oneTime', status: 1 },
      { id: 7, code: 'A7', name: 'Alone', description: '', period: 'oneTime', status: 1 },
    ],
    { now: Date.UTC(2026, 8, 1) },
  )
  const markup = questRecommendationListMarkup({ ...result, relationGraph: graph })
  assert.match(markup, /<details class="dqr-relations" data-quest-relations="2">/)
  assert.doesNotMatch(markup, /data-quest-relations="7"/)
  assert.match(markup, /Quest relation graph/)
  assert.doesNotMatch(questRecommendationListMarkup(result), /dqr-relations/)
})

test('relation graph normalization bounds untrusted snapshot data', () => {
  assert.deepEqual(
    normalizeQuestRelationGraph({
      nodes: [
        { id: 1, code: 'A1', name: 'x'.repeat(200), state: 'completed' },
        { id: 2, code: 'A2', name: 'B', state: 'weird' },
        { id: -1, code: 'bad' },
      ],
      edges: [[1, 2], [2, 2], [1, 99], 'bad'],
      truncated: true,
    }),
    {
      nodes: [
        { id: 1, code: 'A1', name: 'x'.repeat(120), state: 'completed' },
        { id: 2, code: 'A2', name: 'B', state: 'locked' },
      ],
      edges: [[1, 2]],
      truncated: true,
    },
  )
  assert.deepEqual(normalizeQuestRelationGraph(undefined), {
    nodes: [],
    edges: [],
    truncated: false,
  })
})

test('relation graph opens at full scale centered on the selected quest', () => {
  const small = { width: 300, height: 200, nodes: [] }
  assert.deepEqual(initialRelationViewBox(small, null, 600, 400), {
    x: -150,
    y: -100,
    width: 600,
    height: 400,
  })
  const tall = { width: 400, height: 2000, nodes: [] }
  const center = { x: 100, y: 1000, width: 150, height: 44 }
  assert.deepEqual(initialRelationViewBox(tall, center, 600, 400), {
    x: -100,
    y: 822,
    width: 600,
    height: 400,
  })
  // Near an edge the window stays inside the graph instead of showing empty space.
  assert.equal(initialRelationViewBox(tall, { ...center, y: 10 }, 600, 400).y, 0)
  assert.equal(initialRelationViewBox(tall, { ...center, y: 1990 }, 600, 400).y, 1600)
})

test('completed quests are collapsed by default and can be expanded', () => {
  const chain = {
    nodes: [
      node(1, 'completed'),
      node(2, 'completed'),
      node(3, 'completed'),
      node(4, 'open'),
      node(5),
    ],
    edges: [
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ],
  }
  const collapsed = relatedQuestSubgraph(chain, 4)
  assert.deepEqual(
    collapsed.nodes.map(({ id, hiddenCount }) => [id, hiddenCount ?? 0]),
    [
      [3, 1],
      [4, 0],
      [5, 0],
    ],
  )
  assert.equal(collapsed.truncated, false)
  assert.deepEqual(
    relatedQuestSubgraph(chain, 4, { collapseCompleted: false }).nodes.map(({ id }) => id),
    [1, 2, 3, 4, 5],
  )
  // A completed quest chosen as the center is still expanded around itself.
  assert.deepEqual(
    relatedQuestSubgraph(chain, 2).nodes.map(({ id, hiddenCount }) => [id, hiddenCount ?? 0]),
    [
      [1, 0],
      [2, 0],
      [3, 1],
    ],
  )

  const markup = questRelationGraphSvgMarkup(layoutQuestRelationGraph(collapsed), 4, t)
  assert.match(markup, /class="dqr-graph-node completed has-hidden"/)
  assert.match(markup, /class="dqr-graph-hidden"[^>]*>\+1<\/text>/)
  assert.match(markup, /1 more quests collapsed/)
  assert.match(questRelationGraphPanelMarkup(t), /aria-pressed="false">Expand completed</)
})

test('relation view stays fixed unless the graph overflows the stage', () => {
  const wide = { width: 1600, height: 300 }
  // The graph fits vertically, so y stays centered no matter how far it is dragged.
  assert.deepEqual(clampRelationViewBox({ x: 500, y: 90, width: 600, height: 400 }, wide), {
    x: 500,
    y: -50,
    width: 600,
    height: 400,
  })
  // Horizontal scrolling stops at either edge of the graph.
  assert.equal(clampRelationViewBox({ x: -80, y: 0, width: 600, height: 400 }, wide).x, 0)
  assert.equal(clampRelationViewBox({ x: 5000, y: 0, width: 600, height: 400 }, wide).x, 1000)
  // A graph smaller than the stage cannot move at all.
  assert.deepEqual(
    clampRelationViewBox({ x: 300, y: 300, width: 600, height: 400 }, { width: 200, height: 100 }),
    { x: -200, y: -150, width: 600, height: 400 },
  )
})
