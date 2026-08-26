export const EXPEDITION_RESOURCES = [
  { key: 'fuel', color: '#50a65d' },
  { key: 'ammo', color: '#8b6b42' },
  { key: 'steel', color: '#6f8795' },
  { key: 'bauxite', color: '#c47e37' },
]

export const LEDGER_RESOURCES = [
  { key: 'fuel', color: '#50a65d', icon: 'fuel.png' },
  { key: 'ammo', color: '#9a7449', icon: 'ammo.png' },
  { key: 'steel', color: '#718a99', icon: 'steel.png' },
  { key: 'bauxite', color: '#c77d36', icon: 'bauxite.png' },
  { key: 'bucket', color: '#3b9d91', icon: 'bucket.png' },
]

export const RESOURCE_CENTER_RESOURCES = [
  ...LEDGER_RESOURCES.slice(0, 4).map((resource) => ({ ...resource, group: 'material' })),
  { ...LEDGER_RESOURCES[4], group: 'consumable' },
  { key: 'devmat', color: '#288b8b', icon: 'devmat.png', group: 'consumable' },
  { key: 'screws', color: '#8d8d8d', icon: 'screws.png', group: 'consumable' },
  { key: 'torch', color: '#d3a343', icon: 'ibuild.png', group: 'consumable' },
]
