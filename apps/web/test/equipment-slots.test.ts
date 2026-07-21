import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CANONICAL_EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_PAIRS,
  splitEquipmentColumns
} from '../utils/equipment-slots.ts'

test('desktop equipment columns match the SpiritVale character equipment layout', () => {
  assert.deepEqual(EQUIPMENT_SLOT_PAIRS, [
    ['head', 'eyewear'],
    ['back', 'chest'],
    ['main-hand', 'off-hand'],
    ['legs', 'feet'],
    ['accessory-left', 'accessory-right']
  ])

  const columns = splitEquipmentColumns(CANONICAL_EQUIPMENT_SLOTS)

  assert.deepEqual(columns.left, [
    'head',
    'back',
    'main-hand',
    'legs',
    'accessory-left'
  ])
  assert.deepEqual(columns.right, [
    'eyewear',
    'chest',
    'off-hand',
    'feet',
    'accessory-right'
  ])
})

test('canonical traversal preserves each left and right slot pair', () => {
  assert.deepEqual(CANONICAL_EQUIPMENT_SLOTS, [
    'head', 'eyewear',
    'back', 'chest',
    'main-hand', 'off-hand',
    'legs', 'feet',
    'accessory-left', 'accessory-right'
  ])
})
