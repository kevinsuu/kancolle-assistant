import fs from 'fs/promises'
import path from 'path'
import AdmZip from 'adm-zip'
import { Jimp } from '../kccacheproxy-tools-api'

const framesFor = async (source) => {
  try {
    return Object.values(
      JSON.parse(await fs.readFile(source.replace(/\.png$/, '.json'), 'utf8')).frames,
    ).map((item) => item.frame)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}
export const runMaintenance = async ({ operation, source, target, entry }) => {
  if (operation === 'zip-index') {
    const zip = new AdmZip(source)
    const metadata = zip.getEntries().find((item) => item.entryName.endsWith('cached.json'))
    if (!metadata) throw new Error('Archive does not contain cached.json')
    return {
      prefix: metadata.entryName.slice(0, -'cached.json'.length),
      entries: JSON.parse(metadata.getData().toString('utf8')),
    }
  }
  if (operation === 'zip-entry') {
    const zip = new AdmZip(source)
    const item = zip.getEntry(entry)
    if (!item || item.isDirectory) throw new Error('Cache entry missing from archive')
    return item.getData()
  }
  if (!['extract', 'outlines'].includes(operation)) throw new Error('Unknown maintenance operation')
  const input = await Jimp.read(source)
  const frames = await framesFor(source)
  if (operation === 'extract') {
    await fs.mkdir(target, { recursive: true })
    const parts = frames || [{ x: 0, y: 0, w: input.getWidth(), h: input.getHeight() }]
    for (let i = 0; i < parts.length; i++) {
      const { x, y, w, h } = parts[i]
      await input
        .clone()
        .crop(x, y, w, h)
        .writeAsync(
          path.join(
            target,
            `${path.basename(source, '.png')}_${String(i + 1).padStart(3, '0')}.png`,
          ),
        )
    }
    return { fileCount: parts.length }
  }
  if (!frames) throw new Error('Spritesheet metadata is required for outlines')
  const output = new Jimp(input.getWidth(), input.getHeight(), 0x0)
  for (const { x, y, w, h } of frames) {
    const horizontal = new Jimp(w + 2, 1, 0xff0000ff),
      vertical = new Jimp(1, h + 2, 0xff0000ff)
    output
      .composite(horizontal, x - 1, y - 1)
      .composite(horizontal, x - 1, y + h)
      .composite(vertical, x - 1, y - 1)
      .composite(vertical, x + w, y - 1)
  }
  await output.writeAsync(target)
  return { fileCount: 1 }
}
