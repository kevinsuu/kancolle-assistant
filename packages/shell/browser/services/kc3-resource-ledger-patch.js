import fs from 'fs'
import path from 'path'

const PATCH_MARKER = 'KancolleAssistantResourceLedgerPatch'
const REPAIR_HANDLER = '"api_req_nyukyo/start":function'
const REPAIR_SPEEDCHANGE_HANDLER = '"api_req_nyukyo/speedchange":function'
const REPAIR_RESOURCE_UPDATE =
  /PlayerManager\.setResources\(\s*utcSeconds\s*,\s*null\s*,\s*\[\s*-shipData\.repair\[1\]\s*,\s*0\s*,\s*-shipData\.repair\[2\]\s*,\s*0\s*\]\s*\)\s*;?/

export const applyKC3ResourceLedgerPatch = (extensionPath) => {
  const sourcePath = path.join(extensionPath, 'library', 'modules', 'Kcsapi.js')
  if (!fs.existsSync(sourcePath)) return { outcome: 'skipped', reason: 'SOURCE_NOT_FOUND' }

  let source
  try {
    source = fs.readFileSync(sourcePath, 'utf8')
  } catch (error) {
    return { outcome: 'failed', reason: 'SOURCE_READ_FAILED', error }
  }

  if (source.includes(PATCH_MARKER)) return { outcome: 'already-applied' }

  const handlerStart = source.indexOf(REPAIR_HANDLER)
  const handlerEnd = source.indexOf(REPAIR_SPEEDCHANGE_HANDLER, handlerStart)
  if (handlerStart < 0 || handlerEnd < 0) {
    return { outcome: 'skipped', reason: 'REPAIR_HANDLER_NOT_FOUND' }
  }

  const handler = source.slice(handlerStart, handlerEnd)
  const matches = [...handler.matchAll(new RegExp(REPAIR_RESOURCE_UPDATE.source, 'g'))]
  if (matches.length !== 1) {
    return { outcome: 'skipped', reason: 'REPAIR_RESOURCE_UPDATE_NOT_UNIQUE' }
  }

  const match = matches[0]
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n'
  const lineStart = handler.lastIndexOf('\n', match.index) + 1
  const linePrefix = handler.slice(lineStart, match.index)
  const indentation = /^[\t ]*$/.test(linePrefix) ? linePrefix : ''
  const resourceUpdate = match[0].replace(/;?$/, ';')
  const ledgerUpdate = [
    resourceUpdate,
    '',
    `${indentation}// ${PATCH_MARKER}: include dock-repair fuel and steel in the resource ledger.`,
    `${indentation}KC3Database.Naverall({`,
    `${indentation}hour: Math.floor(utcSeconds / 3600),`,
    `${indentation}type: "repair-dock",`,
    `${indentation}data: [-shipData.repair[1], 0, -shipData.repair[2], 0, 0, 0, 0, 0]`,
    `${indentation}});`,
  ].join(lineEnding)
  const patchedHandler =
    handler.slice(0, match.index) + ledgerUpdate + handler.slice(match.index + match[0].length)
  const patchedSource = source.slice(0, handlerStart) + patchedHandler + source.slice(handlerEnd)
  const temporaryPath = `${sourcePath}.kancolle-assistant.tmp`

  try {
    fs.writeFileSync(temporaryPath, patchedSource, 'utf8')
    fs.renameSync(temporaryPath, sourcePath)
  } catch (error) {
    return { outcome: 'failed', reason: 'SOURCE_WRITE_FAILED', error }
  }

  return { outcome: 'applied' }
}
