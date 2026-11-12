// Regenerates the bundled quest unlock corrections from KanColle Quest Navigator
// (https://kancolle-quest-navigator.pages.dev/, by verm_iy). The output uses KC3's
// `quests_meta.json` `unlock` shape: prerequisite quest ID -> successor quest IDs.
// Usage: node ./scripts/update-quest-unlock-corrections.js
const fs = require('fs')
const path = require('path')

const SOURCE_BASE_URL = 'https://kancolle-quest-navigator.pages.dev/data/'
const OUTPUT_PATH = path.resolve(
  __dirname,
  '../packages/shell/browser/recommendation/data/quest-unlock-corrections.json',
)
const REQUEST_TIMEOUT_MS = 30_000

const fetchJson = async (fileName) => {
  const response = await fetch(SOURCE_BASE_URL + fileName, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': 'kancolle-assistant-quest-data-updater' },
  })
  if (!response.ok) throw new Error(`${fileName} request failed with HTTP ${response.status}`)
  return response.json()
}

const isQuestId = (value) => Number.isInteger(value) && value > 0

const buildUnlockMap = (missions) => {
  const unlock = new Map()
  const knownIds = new Set(missions.map(({ id }) => id))
  let skippedEdgeCount = 0
  missions.forEach((mission) => {
    const prerequisiteIds = mission.prerequisites?.missionIds || []
    prerequisiteIds.forEach((prerequisiteId) => {
      if (!isQuestId(prerequisiteId) || !knownIds.has(prerequisiteId)) {
        skippedEdgeCount += 1
        return
      }
      if (!unlock.has(prerequisiteId)) unlock.set(prerequisiteId, new Set())
      unlock.get(prerequisiteId).add(mission.id)
    })
  })
  const sorted = Object.fromEntries(
    [...unlock.entries()]
      .sort(([left], [right]) => left - right)
      .map(([id, successors]) => [String(id), [...successors].sort((left, right) => left - right)]),
  )
  return { unlock: sorted, skippedEdgeCount }
}

const main = async () => {
  const [meta, data] = await Promise.all([fetchJson('quests-meta.json'), fetchJson('quests.json')])
  if (data?.schemaVersion !== 1 || !Array.isArray(data.missions)) {
    throw new Error(`Unsupported quests.json schema version: ${data?.schemaVersion}`)
  }
  const missions = data.missions.filter((mission) => isQuestId(mission?.id))
  if (missions.length === 0) throw new Error('quests.json contains no valid missions')
  const { unlock, skippedEdgeCount } = buildUnlockMap(missions)
  const edgeCount = Object.values(unlock).reduce((count, ids) => count + ids.length, 0)
  const output = {
    schemaVersion: 1,
    source: {
      name: '艦これ任務ナビゲーター',
      url: 'https://kancolle-quest-navigator.pages.dev/',
      contentHash: typeof meta?.contentHash === 'string' ? meta.contentHash : null,
      sourceUpdatedAt: typeof meta?.sourceUpdatedAt === 'string' ? meta.sourceUpdatedAt : null,
      correctionUpdatedAt:
        typeof meta?.correctionUpdatedAt === 'string' ? meta.correctionUpdatedAt : null,
    },
    missionCount: missions.length,
    edgeCount,
    unlock,
  }
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output) + '\n')
  console.log(
    JSON.stringify({
      event: 'quest-unlock-corrections.updated',
      missionCount: missions.length,
      prerequisiteCount: Object.keys(unlock).length,
      edgeCount,
      skippedEdgeCount,
      sourceUpdatedAt: output.source.sourceUpdatedAt,
      outputPath: path.relative(process.cwd(), OUTPUT_PATH),
    }),
  )
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'quest-unlock-corrections.failed',
      message: String(error?.message || error).slice(0, 240),
    }),
  )
  process.exitCode = 1
})
