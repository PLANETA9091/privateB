// (v0.576.0) THE DROP CENSUS - the leak's first measured sink (the live
// counter seat). All pure lifecycle arithmetic on ids, counts and clocks -
// every assertion is exact, no mocks, no timers (the `now` is a parameter).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DESPAWN_FLOOR_SHARE, DROP_MERGE_WINDOW_MS, DROP_RESOLVE_MIN_UNITS,
  itemCountOf, dropCensusRecord, observeItemSpawn, observeItemCollect,
  observeItemGone, openDropUnits, dropCensusRow
} from '../../src/lib/dropcensus.mjs'

const item = (id, count, name = 'item') => ({ id, name, metadata: count == null ? [] : [{ count }] })
const T0 = 1_000_000

test('itemCountOf reads the live metadata stack, junk-tolerant', () => {
  assert.equal(itemCountOf(item(1, 7)), 7)
  assert.equal(itemCountOf({ metadata: [{ itemId: 3 }, { count: 12.9 }] }), 12) // floored, first readable entry wins
  assert.equal(itemCountOf({ metadata: [{ count: 0 }] }), null) // zero is impossible data
  assert.equal(itemCountOf({ metadata: [{ count: -4 }] }), null)
  assert.equal(itemCountOf({ metadata: [{ count: NaN }] }), null)
  assert.equal(itemCountOf({ metadata: 'torn' }), null)
  assert.equal(itemCountOf({}), null)
  assert.equal(itemCountOf(null), null)
})

test('the live anchor: spawn -> collect books the mass once (the pool exits through a hand)', () => {
  const rec = dropCensusRecord()
  assert.equal(observeItemSpawn(rec, item(7, 3), T0), true)
  assert.equal(rec.spawned, 1)
  assert.equal(observeItemCollect(rec, item(7, 3), T0 + 500), true)
  assert.equal(rec.collectedUnits, 3)
  assert.equal(rec.collectedDrops, 1)
  assert.equal(rec.lostUnits, 0)
  // the same id can never resolve twice
  assert.equal(observeItemCollect(rec, item(7, 3), T0 + 900), false)
  assert.equal(observeItemGone(rec, item(7, 3), T0 + 901), false)
  assert.equal(rec.collectedUnits, 3)
  assert.equal(openDropUnits(rec).units, 0)
})

test('the lost class: a vanish past the merge window books the leak', () => {
  const rec = dropCensusRecord()
  observeItemSpawn(rec, item(9, 5), T0)
  assert.equal(observeItemGone(rec, item(9, 5), T0 + DROP_MERGE_WINDOW_MS + 1), true)
  assert.equal(rec.lostUnits, 5)
  assert.equal(rec.lostDrops, 1)
  assert.equal(rec.collectedUnits, 0)
})

test('the merge law: a vanish inside the window is forgotten, never lost', () => {
  const rec = dropCensusRecord()
  observeItemSpawn(rec, item(4, 6), T0)
  assert.equal(observeItemGone(rec, item(4, 6), T0 + DROP_MERGE_WINDOW_MS), false) // age == window is inside
  assert.equal(rec.lostUnits, 0)
  assert.equal(rec.lostDrops, 0)
  assert.equal(rec.spawned, 1) // the drop still happened
  assert.equal(rec.live.size, 0) // and the entity is off the books
})

test('the merge self-correction: the twin carries the merged mass, nothing is double-booked', () => {
  const rec = dropCensusRecord()
  observeItemSpawn(rec, item(10, 4), T0) // the vanishing twin
  observeItemSpawn(rec, item(11, 1), T0 + 10) // the survivor
  assert.equal(observeItemGone(rec, item(10, 4), T0 + 2000), false) // the merge class
  // the survivor's metadata now reads the merged stack (mineflayer updates it)
  assert.equal(observeItemCollect(rec, item(11, 5), T0 + 60_000), true)
  assert.equal(rec.collectedUnits, 5) // the merged mass, booked exactly once
  assert.equal(rec.lostUnits, 0)
})

test('unreadable count at resolve time: the lifecycle proceeds, the books stay clean', () => {
  const rec = dropCensusRecord()
  observeItemSpawn(rec, item(21, null), T0)
  assert.equal(observeItemCollect(rec, item(21, null), T0 + 100), true)
  assert.equal(rec.collectedUnits, 0)
  const rec2 = dropCensusRecord()
  observeItemSpawn(rec2, item(22, 8), T0)
  assert.equal(observeItemGone(rec2, item(22, null), T0 + 300_000), true)
  assert.equal(rec2.lostUnits, 0) // the loss happened, the mass is unreadable - no invention
  assert.equal(rec2.lostDrops, 0)
})

test('the junk battery: torn entities and torn records never throw, never book', () => {
  const rec = dropCensusRecord()
  assert.equal(observeItemSpawn(null, item(1, 1), T0), false)
  assert.equal(observeItemSpawn(rec, null, T0), false)
  assert.equal(observeItemSpawn(rec, { id: NaN, name: 'item' }, T0), false)
  assert.equal(observeItemSpawn(rec, { id: 1, name: 'player' }, T0), false) // only items count
  assert.equal(observeItemSpawn(rec, item(1, 1), T0), true)
  assert.equal(observeItemSpawn(rec, item(1, 1), T0 + 5), false) // no double spawn
  assert.equal(observeItemCollect(rec, item(99, 1), T0), false) // unknown id
  assert.equal(observeItemGone(rec, item(99, 1), T0 + 300_000), false) // unknown id
  assert.equal(observeItemGone(rec, item(1, 1), T0 - 5000), false) // impossible clock
  assert.equal(rec.spawned, 1)
  assert.equal(rec.collectedUnits, 0)
  assert.equal(rec.lostUnits, 0)
  // torn records at the row level
  assert.equal(dropCensusRow(null), 'drop census: none (no item drops observed this run)')
  assert.equal(dropCensusRow([null, 'junk', 42]), 'drop census: none (no item drops observed this run)')
  const torn = dropCensusRecord()
  torn.spawned = -5
  torn.collectedUnits = NaN
  torn.lostUnits = -2
  torn.live = 'torn'
  assert.equal(dropCensusRow([torn]), 'drop census: none (no item drops observed this run)')
})

test('openDropUnits sums the still-live pool, unreadable counts skipped', () => {
  const rec = dropCensusRecord()
  observeItemSpawn(rec, item(31, 4), T0)
  observeItemSpawn(rec, item(32, 9), T0 + 1)
  observeItemSpawn(rec, item(33, null), T0 + 2)
  observeItemSpawn(rec, item(34, 1), T0 + 3)
  observeItemCollect(rec, item(34, 1), T0 + 4) // collected leaves the open pool
  const open = openDropUnits(rec)
  assert.equal(open.units, 13)
  assert.equal(open.drops, 2)
})

test('the row: the trip form at a face-shaped total (the first suspect priced)', () => {
  const rec = dropCensusRecord()
  rec.spawned = 1825
  rec.collectedUnits = 1204
  rec.lostUnits = 411
  rec.live = new Map() // no open reads in this shape
  assert.equal(dropCensusRow([rec]),
    'drop census: 411u of 1615u resolved lost uncollected, 0u still live (25.4% - 1825 drops seen) - the shaft-drop sink is measured, the leak\'s first suspect priced')
})

test('the row: the below-floor form names the floor it sits under', () => {
  const rec = dropCensusRecord()
  rec.spawned = 900
  rec.collectedUnits = 849
  rec.lostUnits = 51
  assert.equal(dropCensusRow([rec]),
    'drop census: 51u of 900u resolved lost uncollected, 0u still live (5.7% - under the 25.0% floor) - the shaft drops stay minor, the leak\'s other suspects keep the cover')
})

test('the row: the 0.25 boundary trips (>= is the family law), 0.249 stays under', () => {
  const trip = dropCensusRecord()
  trip.spawned = 100
  trip.collectedUnits = 75
  trip.lostUnits = 25 // exactly the floor
  assert.ok(dropCensusRow([trip]).includes('the shaft-drop sink is measured'))
  const under = dropCensusRecord()
  under.spawned = 1000
  under.collectedUnits = 751
  under.lostUnits = 249
  assert.ok(dropCensusRow([under]).includes('under the 25.0% floor'))
})

test('the row: the grain form and the none forms are verdicts too', () => {
  const small = dropCensusRecord()
  small.spawned = 3
  small.collectedUnits = 6
  small.lostUnits = 2
  assert.equal(dropCensusRow([small]),
    'drop census: 2u lost of 8u resolved, 0u still live (25.0%) - under the 64u grain, the sample stays too small to judge')
  assert.equal(dropCensusRow([]), 'drop census: none (no item drops observed this run)')
  const seen = dropCensusRecord()
  seen.spawned = 12 // drops happened, all merged or unreadable - no mass resolved
  assert.equal(dropCensusRow([seen]), 'drop census: none (12 drops seen, no mass resolved)')
})

test('the row sums every record (reconnects append, nothing is erased)', () => {
  const a = dropCensusRecord()
  observeItemSpawn(a, item(41, 10), T0)
  observeItemGone(a, item(41, 10), T0 + 300_000) // lost 10
  const b = dropCensusRecord()
  observeItemSpawn(b, item(42, 100), T0)
  observeItemCollect(b, item(42, 100), T0 + 50) // collected 100
  assert.ok(dropCensusRow([a, b]).includes('10u of 110u resolved lost uncollected, 0u still live (9.1%'))
})

test('the constants route the row (one constant per judgment, no split by construction)', () => {
  assert.equal(DESPAWN_FLOOR_SHARE, 0.25)
  assert.equal(DROP_MERGE_WINDOW_MS, 10000)
  assert.equal(DROP_RESOLVE_MIN_UNITS, 64)
  const rec = dropCensusRecord()
  rec.spawned = 4 * DROP_RESOLVE_MIN_UNITS
  rec.collectedUnits = 3 * DROP_RESOLVE_MIN_UNITS
  rec.lostUnits = DROP_RESOLVE_MIN_UNITS
  const row = dropCensusRow([rec])
  assert.ok(row.includes('the shaft-drop sink is measured'))
  assert.ok(row.includes(`${(DESPAWN_FLOOR_SHARE * 100).toFixed(1)}%`))
})

test('the wiring pin: the fleet counts the lifecycle live and prints the row', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes("import { dropCensusRecord, observeItemSpawn, observeItemCollect, observeItemGone, dropCensusRow } from '../src/lib/dropcensus.mjs'"), 'the import line rides')
  assert.equal((src.match(/observeItemSpawn\(dc, e, Date\.now\(\)\)/g) || []).length, 1, 'the spawn seat, exactly once')
  assert.equal((src.match(/observeItemCollect\(dc, e, Date\.now\(\)\)/g) || []).length, 1, 'the collect seat, exactly once')
  assert.equal((src.match(/observeItemGone\(dc, e, Date\.now\(\)\)/g) || []).length, 1, 'the gone seat, exactly once')
  assert.equal((src.match(/dropCensusRow\(dropCensusRecords\)/g) || []).length, 1, 'the deadline row, exactly once')
  assert.ok(src.includes('const dropCensusRecords = []'), 'the fleet-wide book exists')
  assert.ok(/entitySpawn.*try \{ observeItemSpawn/.test(src.replace(/\n/g, ' ')), 'the spawn listener is try-guarded')
})
