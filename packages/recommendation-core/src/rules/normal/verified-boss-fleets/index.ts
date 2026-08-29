import map11 from './1-1.json'
import map12 from './1-2.json'
import map13 from './1-3.json'
import map14 from './1-4.json'
import map16 from './1-6.json'
import map21 from './2-1.json'
import map22 from './2-2.json'
import map23 from './2-3.json'
import map24 from './2-4.json'
import map31 from './3-1.json'
import map32 from './3-2.json'
import map33 from './3-3.json'
import map34 from './3-4.json'
import map41 from './4-1.json'
import map42 from './4-2.json'
import map43 from './4-3.json'
import map44 from './4-4.json'
import map51 from './5-1.json'
import map52 from './5-2.json'
import map53 from './5-3.json'
import map54 from './5-4.json'
import map61 from './6-1.json'
import map62 from './6-2.json'
import map63 from './6-3.json'
import map64 from './6-4.json'
import map71 from './7-1.json'
import map72 from './7-2.json'
import map73 from './7-3.json'
import map74 from './7-4.json'

// Keep this explicit so esbuild can include every source file in the bundled core package.
const perMapVerifiedBossFleets = [
  map11,
  map12,
  map13,
  map14,
  map16,
  map21,
  map22,
  map23,
  map24,
  map31,
  map32,
  map33,
  map34,
  map41,
  map42,
  map43,
  map44,
  map51,
  map52,
  map53,
  map54,
  map61,
  map62,
  map63,
  map64,
  map71,
  map72,
  map73,
  map74,
] as readonly unknown[]

const normalizeVerifiedBossFleetFile = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [value]

const verifiedBossFleetData = [...perMapVerifiedBossFleets.flatMap(normalizeVerifiedBossFleetFile)]

export default verifiedBossFleetData
