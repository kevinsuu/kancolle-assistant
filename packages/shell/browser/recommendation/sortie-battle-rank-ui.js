// Reuse KC3's recorded result images; never infer ranks from battle damage or node colors.
export const recordedBattleRank = (src) => {
  const match = /\/ratings\/(SS|S|A|B|C|D|E)\.png(?:[?#].*)?$/.exec(src || '')
  return match?.[1] ?? null
}

export const refreshSortieBattleRanks = (root, report = console.info) => {
  let added = 0
  let missing = 0
  const rows = root.querySelectorAll('.tab_maps .sortie_list .sortie_box')
  for (const row of rows) {
    const edges = Array.from(row.querySelectorAll('.sortie_edge'))
    for (const node of row.querySelectorAll('.sortie_nodes .sortie_nodeinfo')) {
      const label = node.querySelector('.node_id')?.textContent?.trim()
      const rank = recordedBattleRank(node.querySelector('.node_rating img')?.getAttribute('src'))
      if (!rank) {
        missing += 1
        continue
      }
      const edge = edges.find(
        (element) => (element.dataset.kcaNodeLabel ?? element.textContent.trim()) === label,
      )
      if (!edge || edge.dataset.kcaBattleRank === rank) continue
      edge.dataset.kcaNodeLabel = label
      edge.dataset.kcaBattleRank = rank
      edge.querySelector('.kca-battle-rank')?.remove()
      const badge = root.ownerDocument.createElement('span')
      badge.className = 'kca-battle-rank'
      badge.textContent = rank
      edge.append(badge)
      added += 1
    }
  }
  if (added || missing) {
    report('[sortie-battle-ranks] refreshed', {
      outcome: added ? 'recorded-results-displayed' : 'result-unavailable',
      reasonCode: missing ? 'MISSING_RECORDED_RANK' : 'RECORDED_RANK',
      rowCount: rows.length,
      addedCount: added,
      missingResultCount: missing,
    })
  }
  return { added, missing }
}

export const injectSortieBattleRanks = () => {
  if (document.getElementById('kca-sortie-battle-ranks')) return
  const style = document.createElement('style')
  style.id = 'kca-sortie-battle-ranks'
  style.textContent = `
    .tab_maps .sortie_edge[data-kca-battle-rank] { position: relative; overflow: visible; }
    .tab_maps .kca-battle-rank {
      position: absolute; right: -3px; bottom: -3px; z-index: 1;
      min-width: 14px; padding: 0 2px; border: 1px solid #fff; border-radius: 4px;
      background: #172b42; color: #fff; font: bold 10px/13px sans-serif;
      text-align: center; pointer-events: none;
    }
  `
  document.head.append(style)
  let scheduled = false
  const observer = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    window.setTimeout(() => {
      scheduled = false
      refreshSortieBattleRanks(document.documentElement)
    }, 0)
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  })
  refreshSortieBattleRanks(document.documentElement)
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true })
}
