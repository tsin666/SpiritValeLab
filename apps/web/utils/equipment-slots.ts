export const EQUIPMENT_SLOT_PAIRS = [
  ['head', 'eyewear'],
  ['back', 'chest'],
  ['main-hand', 'off-hand'],
  ['legs', 'feet'],
  ['accessory-left', 'accessory-right']
] as const

export type CanonicalEquipmentSlot = (typeof EQUIPMENT_SLOT_PAIRS)[number][number]

export const CANONICAL_EQUIPMENT_SLOTS: CanonicalEquipmentSlot[] = EQUIPMENT_SLOT_PAIRS
  .flatMap(([left, right]) => [left, right])

export function splitEquipmentColumns<T>(pairedItems: readonly T[]) {
  return {
    left: pairedItems.filter((_, index) => index % 2 === 0),
    right: pairedItems.filter((_, index) => index % 2 === 1)
  }
}
