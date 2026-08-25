import type { OwnedEquipment } from './types'

const NORMAL_RESOURCE_ZERO_BONUS_LANDING_CRAFT_MASTER_IDS = new Set([230, 355, 482, 494, 495, 514])

export const isNormalResourceLandingCraft = (gear: OwnedEquipment): boolean =>
  [24, 46].includes(gear.typeId) &&
  !NORMAL_RESOURCE_ZERO_BONUS_LANDING_CRAFT_MASTER_IDS.has(gear.masterId)

export const isDrumCanister = (gear: OwnedEquipment): boolean => gear.typeId === 30
