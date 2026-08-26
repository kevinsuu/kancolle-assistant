import type { FleetMember } from './internal-types'

export interface SpecialAttackSetup {
  readonly name: string
  readonly formation: '梯形陣' | '複縱陣'
  readonly members: readonly FleetMember[]
}

const isBattleship = (member: FleetMember): boolean =>
  [8, 9, 10, 12].includes(member.ship.shipTypeId)

const isCarrierOrSubmarine = (member: FleetMember): boolean =>
  [7, 11, 13, 14, 18].includes(member.ship.shipTypeId)

const nameMatches = (member: FleetMember, pattern: RegExp): boolean =>
  pattern.test(member.ship.name)

const arrangePairAttack = (
  members: readonly FleetMember[],
  flagshipPattern: RegExp,
  helperPredicate: (member: FleetMember, flagship: FleetMember) => boolean,
  name: string,
): SpecialAttackSetup | null => {
  for (const flagship of members.filter((member) => nameMatches(member, flagshipPattern))) {
    const helper = members.find(
      (member) => member.ship.id !== flagship.ship.id && helperPredicate(member, flagship),
    )
    if (!helper) continue
    return {
      name,
      formation: '梯形陣',
      members: [
        flagship,
        helper,
        ...members.filter(
          (member) => member.ship.id !== flagship.ship.id && member.ship.id !== helper.ship.id,
        ),
      ],
    }
  }
  return null
}

const arrangeNelsonTouch = (members: readonly FleetMember[]): SpecialAttackSetup | null => {
  const flagship = members.find((member) =>
    /(?:Nelson|Rodney|ネルソン|ロドニー).*改/.test(member.ship.name),
  )
  if (!flagship) return null
  const remaining = members.filter((member) => member.ship.id !== flagship.ship.id)
  const helpers = remaining.filter((member) => !isCarrierOrSubmarine(member)).slice(0, 2)
  if (helpers.length < 2) return null
  const fillers = remaining.filter(
    (member) => !helpers.some((helper) => helper.ship.id === member.ship.id),
  )
  return {
    name: 'Nelson Touch',
    formation: '複縱陣',
    members: [flagship, fillers[0], helpers[0], fillers[1], helpers[1], fillers[2]].filter(
      (member): member is FleetMember => Boolean(member),
    ),
  }
}

export const arrangeSpecialAttack = (members: readonly FleetMember[]): SpecialAttackSetup | null =>
  arrangePairAttack(
    members,
    /大和改二(?:重)?|Yamato Kai Ni(?: Juu)?/,
    (member) => /武[藏蔵]改二|Musashi Kai Ni/.test(member.ship.name),
    '大和型改二特殊砲擊',
  ) ??
  arrangePairAttack(
    members,
    /(?:長門|陸奥)改二|(?:Nagato|Mutsu) Kai Ni/,
    (member) => isBattleship(member),
    '長門型改二特殊砲擊',
  ) ??
  arrangeNelsonTouch(members)

export const specialAttackSetupForOrderedFleet = (
  members: readonly FleetMember[],
): Omit<SpecialAttackSetup, 'members'> | null => {
  const arranged = arrangeSpecialAttack(members)
  if (!arranged) return null
  const unchanged = arranged.members.every(
    (member, index) => member.ship.id === members[index]?.ship.id,
  )
  return unchanged ? { name: arranged.name, formation: arranged.formation } : null
}
