import map13 from './1-3.json'
import map14 from './1-4.json'
import map15 from './1-5.json'
import map16 from './1-6.json'
import map21 from './2-1.json'
import map22 from './2-2.json'
import map24 from './2-4.json'
import map25 from './2-5.json'
import map32 from './3-2.json'
import map34 from './3-4.json'
import map35 from './3-5.json'
import map43 from './4-3.json'
import map45 from './4-5.json'
import map52 from './5-2.json'
import map53 from './5-3.json'
import map55 from './5-5.json'
import map56 from './5-6.json'
import map63 from './6-3.json'
import map65 from './6-5.json'
import map74 from './7-4.json'
import map75 from './7-5.json'

// Keep this explicit so esbuild can include every source file in the bundled core package.
const perMapStrategyOverlays = [
  map13,
  map14,
  map15,
  map16,
  map21,
  map22,
  map24,
  map25,
  map32,
  map34,
  map35,
  map43,
  map45,
  map52,
  map53,
  map55,
  map56,
  map63,
  map65,
  map74,
  map75,
] as readonly unknown[]

const normalizeOverlayFile = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [value]

const strategyOverlayData = [...perMapStrategyOverlays.flatMap(normalizeOverlayFile)]

export default strategyOverlayData
