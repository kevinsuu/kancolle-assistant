import type { FleetRole, OwnedShip, ShipInstanceId } from '../types'

export interface FleetMember {
  readonly ship: OwnedShip
  readonly role: FleetRole
}

export interface FleetSearchState {
  readonly members: readonly FleetMember[]
  readonly usedShipIds: ReadonlySet<ShipInstanceId>
  readonly score: number
  readonly lastCandidateIndex: number
}
