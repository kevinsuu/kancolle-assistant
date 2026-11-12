import { escapeHtml } from './strategy-room-format'

// Draws one quest's prerequisite and successor chain as a layered SVG diagram. Everything here is
// computed on demand when the player opens a card's graph, from a few dozen nodes, so no layout
// library or continuous simulation runs inside the Strategy Room.
const RELATION_GRAPH_LOG_PREFIX = '[KancolleQuestRelationGraph]'
export const RELATION_GRAPH_MAX_DEPTH = 6
export const RELATION_GRAPH_MAX_NODES = 80
const NODE_WIDTH = 150
const NODE_HEIGHT = 44
// Layers run left to right (prerequisites on the left); quests in one layer stack vertically.
const LAYER_GAP = 56
const NODE_GAP = 14
const PADDING = 16
const ORDERING_SWEEPS = 4
const NAME_MAX_CHARACTERS = 10
const RELATION_STATES = new Set(['completed', 'active', 'open', 'locked'])

const graphIndexCache = new WeakMap()

const indexRelationGraph = (graph) => {
  if (graph && typeof graph === 'object' && graphIndexCache.has(graph)) {
    return graphIndexCache.get(graph)
  }
  const nodesById = new Map()
  ;(graph?.nodes || []).forEach((node) => nodesById.set(Number(node.id), node))
  const successors = new Map()
  const predecessors = new Map()
  ;(graph?.edges || []).forEach(([from, to]) => {
    if (!nodesById.has(from) || !nodesById.has(to)) return
    if (!successors.has(from)) successors.set(from, [])
    if (!predecessors.has(to)) predecessors.set(to, [])
    successors.get(from).push(to)
    predecessors.get(to).push(from)
  })
  const index = { nodesById, successors, predecessors }
  if (graph && typeof graph === 'object') graphIndexCache.set(graph, index)
  return index
}

export const questHasRelations = (graph, questId) => {
  const { successors, predecessors } = indexRelationGraph(graph)
  const id = Number(questId)
  return (successors.get(id) || []).length > 0 || (predecessors.get(id) || []).length > 0
}

// Ancestors and descendants of the center quest only, so siblings do not crowd the diagram.
// With `collapseCompleted`, a completed quest other than the center is shown but not expanded;
// its node reports how many further quests it hides in that direction.
export const relatedQuestSubgraph = (
  graph,
  centerId,
  {
    maxDepth = RELATION_GRAPH_MAX_DEPTH,
    maxNodes = RELATION_GRAPH_MAX_NODES,
    collapseCompleted = true,
  } = {},
) => {
  const { nodesById, successors, predecessors } = indexRelationGraph(graph)
  const center = Number(centerId)
  if (!nodesById.has(center)) return { nodes: [], edges: [], truncated: false }
  const included = new Set([center])
  const collapsedNeighbors = new Map()
  let truncated = false
  const isCollapsed = (id) =>
    collapseCompleted && id !== center && nodesById.get(id)?.state === 'completed'
  const walk = (neighbors) => {
    let frontier = [center]
    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
      const next = []
      frontier.forEach((id) => {
        if (isCollapsed(id)) {
          collapsedNeighbors.set(id, [
            ...(collapsedNeighbors.get(id) || []),
            ...(neighbors.get(id) || []),
          ])
          return
        }
        ;(neighbors.get(id) || []).forEach((neighborId) => {
          if (included.has(neighborId)) return
          if (included.size >= maxNodes) {
            truncated = true
            return
          }
          included.add(neighborId)
          next.push(neighborId)
        })
      })
      frontier = next
    }
    if (
      frontier.some(
        (id) => !isCollapsed(id) && (neighbors.get(id) || []).some((next) => !included.has(next)),
      )
    ) {
      truncated = true
    }
  }
  walk(predecessors)
  walk(successors)
  const nodes = [...included]
    .sort((left, right) => left - right)
    .map((id) => {
      const hiddenCount = new Set(
        (collapsedNeighbors.get(id) || []).filter((neighborId) => !included.has(neighborId)),
      ).size
      return hiddenCount > 0 ? { ...nodesById.get(id), hiddenCount } : nodesById.get(id)
    })
  const edges = []
  included.forEach((from) => {
    ;(successors.get(from) || []).forEach((to) => {
      if (included.has(to)) edges.push([from, to])
    })
  })
  edges.sort(([leftFrom, leftTo], [rightFrom, rightTo]) => leftFrom - rightFrom || leftTo - rightTo)
  return { nodes, edges, truncated }
}

// Longest-path layering keeps every prerequisite above its successors; a few barycenter sweeps
// then reduce edge crossings. Any cycle in bad data falls back to one extra layer.
const assignLayers = (nodeIds, edges) => {
  const incoming = new Map(nodeIds.map((id) => [id, 0]))
  const outgoing = new Map(nodeIds.map((id) => [id, []]))
  edges.forEach(([from, to]) => {
    outgoing.get(from).push(to)
    incoming.set(to, incoming.get(to) + 1)
  })
  const layers = new Map(nodeIds.map((id) => [id, 0]))
  const queue = nodeIds.filter((id) => incoming.get(id) === 0)
  const visited = new Set()
  while (queue.length > 0) {
    const id = queue.shift()
    visited.add(id)
    outgoing.get(id).forEach((to) => {
      layers.set(to, Math.max(layers.get(to), layers.get(id) + 1))
      incoming.set(to, incoming.get(to) - 1)
      if (incoming.get(to) === 0) queue.push(to)
    })
  }
  // Pull each quest right so it sits just before its nearest successor; otherwise a short side
  // branch would start at the far left and stretch its edge across the whole diagram.
  ;[...visited].reverse().forEach((id) => {
    const successorLayers = outgoing
      .get(id)
      .filter((to) => visited.has(to))
      .map((to) => layers.get(to))
    if (successorLayers.length > 0) {
      layers.set(id, Math.max(layers.get(id), Math.min(...successorLayers) - 1))
    }
  })
  const deepest = Math.max(0, ...layers.values())
  nodeIds.forEach((id) => {
    if (!visited.has(id)) layers.set(id, deepest + 1)
  })
  return layers
}

const orderLayers = (rows, edges) => {
  const position = new Map()
  const record = () =>
    rows.forEach((row) => row.forEach((id, index) => position.set(id, index / row.length)))
  record()
  const neighborsOf = (direction) => {
    const map = new Map()
    edges.forEach(([from, to]) => {
      const [key, value] = direction === 'down' ? [to, from] : [from, to]
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(value)
    })
    return map
  }
  const above = neighborsOf('down')
  const below = neighborsOf('up')
  const barycenter = (id, neighbors) => {
    const values = (neighbors.get(id) || []).map((neighborId) => position.get(neighborId))
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : position.get(id)
  }
  for (let sweep = 0; sweep < ORDERING_SWEEPS; sweep += 1) {
    const downward = sweep % 2 === 0
    const indexes = rows.map((_, index) => index)
    ;(downward ? indexes : indexes.reverse()).forEach((rowIndex) => {
      const neighbors = downward ? above : below
      rows[rowIndex].sort(
        (left, right) => barycenter(left, neighbors) - barycenter(right, neighbors) || left - right,
      )
      rows[rowIndex].forEach((id, index) => position.set(id, index / rows[rowIndex].length))
    })
  }
  return rows
}

export const layoutQuestRelationGraph = (subgraph) => {
  const nodeIds = (subgraph?.nodes || []).map(({ id }) => Number(id))
  if (nodeIds.length === 0) return { nodes: [], edges: [], width: 0, height: 0 }
  const edges = (subgraph.edges || []).filter(
    ([from, to]) => nodeIds.includes(from) && nodeIds.includes(to),
  )
  const layers = assignLayers(nodeIds, edges)
  const rows = []
  nodeIds.forEach((id) => {
    const layer = layers.get(id)
    if (!rows[layer]) rows[layer] = []
    rows[layer].push(id)
  })
  const orderedRows = orderLayers(
    rows.filter(Boolean).map((row) => row.sort((left, right) => left - right)),
    edges,
  )
  const tallest = Math.max(...orderedRows.map((row) => row.length))
  const width = orderedRows.length * NODE_WIDTH + (orderedRows.length - 1) * LAYER_GAP + PADDING * 2
  const height = tallest * NODE_HEIGHT + (tallest - 1) * NODE_GAP + PADDING * 2
  const nodesById = new Map(subgraph.nodes.map((node) => [Number(node.id), node]))
  const placed = new Map()
  orderedRows.forEach((row, layerIndex) => {
    const columnHeight = row.length * NODE_HEIGHT + (row.length - 1) * NODE_GAP
    const offset = (height - columnHeight) / 2
    row.forEach((id, index) => {
      placed.set(id, {
        ...nodesById.get(id),
        x: PADDING + layerIndex * (NODE_WIDTH + LAYER_GAP),
        y: offset + index * (NODE_HEIGHT + NODE_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })
    })
  })
  const layoutEdges = edges.map(([from, to]) => {
    const source = placed.get(from)
    const target = placed.get(to)
    const x1 = source.x + NODE_WIDTH
    const y1 = source.y + NODE_HEIGHT / 2
    const x2 = target.x
    const y2 = target.y + NODE_HEIGHT / 2
    const bend = Math.max(LAYER_GAP / 2, (x2 - x1) / 2)
    return { from, to, path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` }
  })
  return { nodes: [...placed.values()], edges: layoutEdges, width, height }
}

const shortName = (name) => {
  const characters = [...String(name || '')]
  return characters.length > NAME_MAX_CHARACTERS
    ? `${characters.slice(0, NAME_MAX_CHARACTERS).join('')}…`
    : characters.join('')
}

export const questRelationGraphSvgMarkup = (layout, centerId, t) => {
  const center = Number(centerId)
  const nodes = layout.nodes
    .map((node) => {
      const state = RELATION_STATES.has(node.state) ? node.state : 'locked'
      const stateLabel = t(`quest.relations.state.${state}`)
      const hiddenCount = Number(node.hiddenCount || 0)
      const classes = [
        'dqr-graph-node',
        state,
        Number(node.id) === center ? 'center' : '',
        hiddenCount > 0 ? 'has-hidden' : '',
      ]
        .filter(Boolean)
        .join(' ')
      const title = [
        `${node.code} ${node.name} (${stateLabel})`,
        hiddenCount > 0 ? t('quest.relations.hiddenCount', { count: hiddenCount }) : '',
      ]
        .filter(Boolean)
        .join(' · ')
      return `<g class="${classes}" data-relation-quest="${escapeHtml(node.id)}" transform="translate(${node.x} ${node.y})" tabindex="0" role="button">
        <title>${escapeHtml(title)}</title>
        <rect width="${node.width}" height="${node.height}" rx="5"></rect>
        <text class="dqr-graph-code" x="8" y="17">${escapeHtml(node.code)}</text>
        ${hiddenCount > 0 ? `<text class="dqr-graph-hidden" x="${node.width - 8}" y="17" text-anchor="end">+${hiddenCount}</text>` : ''}
        <text class="dqr-graph-name" x="8" y="34">${escapeHtml(shortName(node.name))}</text>
      </g>`
    })
    .join('')
  const edges = layout.edges
    .map(
      ({ from, to, path }) =>
        `<path class="dqr-graph-edge" data-edge="${escapeHtml(`${from}-${to}`)}" d="${path}" marker-end="url(#dqr-graph-arrow)"></path>`,
    )
    .join('')
  return `<svg class="dqr-graph-canvas" role="img" aria-label="${escapeHtml(t('quest.relations.ariaLabel'))}" viewBox="0 0 ${layout.width} ${layout.height}" preserveAspectRatio="xMidYMid meet">
    <defs><marker id="dqr-graph-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z"></path></marker></defs>
    <g class="dqr-graph-edges">${edges}</g>
    <g class="dqr-graph-nodes">${nodes}</g>
  </svg>`
}

export const questRelationGraphPanelMarkup = (t) => `
  <div class="dqr-graph-toolbar">
    <div class="dqr-graph-legend">
      ${['center', 'completed', 'active', 'open', 'locked']
        .map(
          (state) =>
            `<span class="dqr-graph-legend-item ${state}">${escapeHtml(t(`quest.relations.state.${state}`))}</span>`,
        )
        .join('')}
    </div>
    <div class="dqr-graph-actions">
      <button class="dqr-graph-completed" type="button" aria-pressed="false">${escapeHtml(t('quest.relations.showCompleted'))}</button>
      <button class="dqr-graph-reset" type="button">${escapeHtml(t('quest.relations.reset'))}</button>
    </div>
  </div>
  <p class="dqr-graph-hint">${escapeHtml(t('quest.relations.hint'))}</p>
  <div class="dqr-graph-stage"></div>
  <p class="dqr-graph-truncated" hidden>${escapeHtml(
    t('quest.relations.truncated', {
      depth: RELATION_GRAPH_MAX_DEPTH,
      count: RELATION_GRAPH_MAX_NODES,
    }),
  )}</p>`

const parseViewBox = (svg) => {
  const [x, y, width, height] = String(svg.getAttribute('viewBox') || '0 0 0 0')
    .split(/\s+/)
    .map(Number)
  return { x, y, width, height }
}

const setViewBox = (svg, { x, y, width, height }) =>
  svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`)

// Keeps a fixed 1:1 window inside the graph. An axis where the graph fits is centered and cannot
// move; only an axis where the graph is larger than the stage can scroll or be dragged.
export const clampRelationViewBox = (viewBox, layout) => {
  const clampAxis = (value, size, extent) =>
    extent <= size ? (extent - size) / 2 : Math.min(Math.max(value, 0), extent - size)
  return {
    x: clampAxis(viewBox.x, viewBox.width, layout.width),
    y: clampAxis(viewBox.y, viewBox.height, layout.height),
    width: viewBox.width,
    height: viewBox.height,
  }
}

// Opens at 1:1 scale centered on the selected quest so labels stay readable.
export const initialRelationViewBox = (layout, centerNode, stageWidth, stageHeight) => {
  const width = Math.max(1, stageWidth)
  const height = Math.max(1, stageHeight)
  const centerX = centerNode ? centerNode.x + centerNode.width / 2 : layout.width / 2
  const centerY = centerNode ? centerNode.y + centerNode.height / 2 : layout.height / 2
  return clampRelationViewBox(
    { x: centerX - width / 2, y: centerY - height / 2, width, height },
    layout,
  )
}

// The mouse wheel scrolls horizontally when the graph is wider than the stage; otherwise the
// page scrolls as usual. Dragging moves the view only along overflowing axes.
const attachScrolling = (svg, onSelect, layout) => {
  const view = parseViewBox(svg)
  const canScrollX = layout.width > view.width
  const canScrollY = layout.height > view.height
  svg.classList.toggle('can-drag', canScrollX || canScrollY)
  let drag = null
  svg.addEventListener('pointerdown', (event) => {
    drag = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      viewBox: parseViewBox(svg),
      moved: false,
      // Pointer capture retargets later events to the SVG, so remember the pressed node now.
      nodeId: event.target.closest?.('[data-relation-quest]')?.dataset.relationQuest ?? null,
    }
    svg.setPointerCapture?.(event.pointerId)
  })
  svg.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.clientX
    const dy = event.clientY - drag.clientY
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
    if (!drag.moved || (!canScrollX && !canScrollY)) return
    const rect = svg.getBoundingClientRect()
    const scale = drag.viewBox.width / Math.max(rect.width, 1)
    svg.classList.add('is-dragging')
    setViewBox(
      svg,
      clampRelationViewBox(
        {
          ...drag.viewBox,
          x: drag.viewBox.x - (canScrollX ? dx * scale : 0),
          y: drag.viewBox.y - (canScrollY ? dy * scale : 0),
        },
        layout,
      ),
    )
  })
  const endDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    const { moved, nodeId } = drag
    drag = null
    svg.classList.remove('is-dragging')
    if (!moved && nodeId !== null && event.type === 'pointerup') onSelect(Number(nodeId))
  }
  svg.addEventListener('pointerup', endDrag)
  svg.addEventListener('pointercancel', endDrag)
  svg.addEventListener('keydown', (event) => {
    const node = event.target.closest?.('[data-relation-quest]')
    if (node && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onSelect(Number(node.dataset.relationQuest))
    }
  })
  svg.addEventListener(
    'wheel',
    (event) => {
      if (!canScrollX) return
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      const current = parseViewBox(svg)
      const scale = current.width / Math.max(rect.width, 1)
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      setViewBox(svg, clampRelationViewBox({ ...current, x: current.x + delta * scale }, layout))
    },
    { passive: false },
  )
}

// Renders the graph for `centerId` into a panel created from questRelationGraphPanelMarkup.
// Clicking a node re-centers the diagram on that quest; the reset button returns to the card's
// own quest.
export const mountQuestRelationGraph = ({
  panel,
  graph,
  questId,
  t,
  logger = globalThis.console,
}) => {
  const stage = panel.querySelector('.dqr-graph-stage')
  const truncatedNote = panel.querySelector('.dqr-graph-truncated')
  const completedToggle = panel.querySelector('.dqr-graph-completed')
  let showCompleted = false
  let currentCenterId = Number(questId)
  const show = (centerId) => {
    const startedAt = Date.now()
    currentCenterId = Number(centerId)
    const subgraph = relatedQuestSubgraph(graph, centerId, { collapseCompleted: !showCompleted })
    if (subgraph.nodes.length === 0) {
      stage.innerHTML = ''
      truncatedNote.hidden = true
      logger?.warn?.(RELATION_GRAPH_LOG_PREFIX, {
        event: 'quest-relation-graph-render',
        questId: Number(questId),
        centerId: Number(centerId),
        nodeCount: 0,
        edgeCount: 0,
        outcome: 'empty',
        reasonCode: 'QUEST_NOT_IN_RELATION_GRAPH',
      })
      return
    }
    const layout = layoutQuestRelationGraph(subgraph)
    stage.innerHTML = questRelationGraphSvgMarkup(layout, centerId, t)
    const svg = stage.querySelector('svg')
    const stageRect = stage.getBoundingClientRect()
    setViewBox(
      svg,
      initialRelationViewBox(
        layout,
        layout.nodes.find(({ id }) => Number(id) === Number(centerId)),
        stageRect.width || layout.width,
        stageRect.height || layout.height,
      ),
    )
    truncatedNote.hidden = !subgraph.truncated
    attachScrolling(svg, show, layout)
    logger?.info?.(RELATION_GRAPH_LOG_PREFIX, {
      event: 'quest-relation-graph-render',
      questId: Number(questId),
      centerId: Number(centerId),
      nodeCount: layout.nodes.length,
      edgeCount: layout.edges.length,
      truncated: subgraph.truncated,
      showCompleted,
      collapsedNodeCount: layout.nodes.filter(({ hiddenCount }) => hiddenCount > 0).length,
      elapsedMs: Date.now() - startedAt,
      outcome: 'shown',
    })
  }
  panel.querySelector('.dqr-graph-reset').addEventListener('click', () => show(questId))
  completedToggle.addEventListener('click', () => {
    showCompleted = !showCompleted
    completedToggle.setAttribute('aria-pressed', String(showCompleted))
    completedToggle.textContent = t(
      showCompleted ? 'quest.relations.hideCompleted' : 'quest.relations.showCompleted',
    )
    show(currentCenterId)
  })
  show(questId)
}
