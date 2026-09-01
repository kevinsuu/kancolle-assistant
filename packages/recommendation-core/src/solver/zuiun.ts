import type { OwnedEquipment, OwnedShip, RecommendedShipBuild } from '../types'

const ISE_CLASS_KAI_NI_MASTER_IDS = new Set([553, 554])

const normalizedName = (name: string): string => name.normalize('NFKC')

export const isIseClassKaiNi = (ship: OwnedShip): boolean =>
  ISE_CLASS_KAI_NI_MASTER_IDS.has(ship.masterId) ||
  /(?:伊勢|日向)改二|Ise Kai Ni|Hy(?:u|ū|uu)ga Kai Ni/i.test(normalizedName(ship.name))

export const isZuiun = (gear: OwnedEquipment): boolean =>
  gear.typeId === 11 && /瑞雲|Zuiun/i.test(normalizedName(gear.name))

export const hasZuiunMultiAngleAttack = (build: RecommendedShipBuild): boolean =>
  isIseClassKaiNi(build.ship) &&
  build.equipment.filter((gear) => gear?.typeId === 3).length >= 1 &&
  build.equipment.filter((gear) => gear !== null && isZuiun(gear)).length >= 2
