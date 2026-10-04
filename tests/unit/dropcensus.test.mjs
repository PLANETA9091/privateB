// (v0.576.0) THE DROP CENSUS - the leak's first measured sink (the live
// counter seat). All pure lifecycle arithmetic on ids, counts and clocks -
// every assertion is exact, no mocks, no timers (the `now` is a parameter).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DESPAWN_FLOOR_SHARE, DROP_MERGE_WINDOW_MS, DROP_RESOLVE_MIN_UNITS,
  OPEN_FRESH_MS, OPEN_OVERDUE_MS, OPEN_OVERDUE_SHARE,
  itemCountOf, dropCensusRecord, observeItemSpawn, observeItemCollect,
  observeItemGone, openDropUnits, dropCensusRow, dropOpenAnatomyRow,
  overdueOwnerRow
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

test("THE MASS LENS: the live slot shape reads - prismarine-item's own field (fleet 37154867210's none verdict honored)", () => {
  // the LIVE shape: metadata is a raw values array, the item-stack entry is
  // the parsed slot { present, itemId, itemCount } - the 1.20.5+ field name
  // prismarine-item's fromNotch itself reads (itemsWithComponents)
  assert.equal(itemCountOf({ metadata: [{ present: true, itemId: 42, itemCount: 7 }] }), 7)
  assert.equal(itemCountOf({ metadata: [{ present: true, itemId: 42, itemCount: 12.9 }] }), 12) // floored
  // the live entry FIRST in the array, junk entries around it (the real
  // metadata carries bytes/varints beside the slot)
  assert.equal(itemCountOf({ metadata: [0, 300, 'torn', { present: true, itemId: 9, itemCount: 4 }, null] }), 4)
  // the legacy shape stays readable (one chain, both shapes)
  assert.equal(itemCountOf({ metadata: [{ count: 5 }] }), 5)
  // both fields on one entry: the live field wins the chain
  assert.equal(itemCountOf({ metadata: [{ itemCount: 3, count: 9 }] }), 3)
  // the junk law unchanged for the live field too
  assert.equal(itemCountOf({ metadata: [{ itemCount: 0 }] }), null)
  assert.equal(itemCountOf({ metadata: [{ itemCount: -2 }] }), null)
  assert.equal(itemCountOf({ metadata: [{ present: true, itemId: 42 }] }), null) // the slot without a stack
  assert.equal(itemCountOf({ metadata: [{ itemCount: NaN }] }), null)
})

test('THE DEAF-ARM INSURANCE: the arms count their own liveness, the none-form names them', () => {
  const rec = dropCensusRecord()
  observeItemSpawn(rec, item(51, 4), T0)
  observeItemCollect(rec, item(51, 4), T0 + 100) // a real pickup
  observeItemCollect(rec, item(52, 4), T0 + 200) // an unmatched id - the event fired, the pool never knew it
  observeItemCollect(rec, null, T0 + 300) // a torn payload - the event STILL fired
  assert.equal(rec.collectEvents, 3) // the EVENT count, not the booking count
  assert.equal(rec.collectedUnits, 4)
  observeItemGone(rec, null, T0 + 400)
  assert.equal(rec.goneEvents, 1)
  // the merge class is sized, not just silent
  const rec2 = dropCensusRecord()
  observeItemSpawn(rec2, item(53, 6), T0)
  assert.equal(observeItemGone(rec2, item(53, 6), T0 + DROP_MERGE_WINDOW_MS), false) // the merge class
  assert.equal(rec2.mergeVanishes, 1)
  // the unreadable resolves are counted on both arms
  const rec3 = dropCensusRecord()
  observeItemSpawn(rec3, item(54, null), T0)
  observeItemCollect(rec3, item(54, null), T0 + 100)
  assert.equal(rec3.nullMassResolves, 1)
  observeItemSpawn(rec3, item(55, null), T0 + 200)
  assert.equal(observeItemGone(rec3, item(55, null), T0 + 300_000), true)
  assert.equal(rec3.nullMassResolves, 2)
  // the row's none-form names every arm - a still blind face reads its deaf arm in one line
  const blind = dropCensusRecord()
  blind.spawned = 27872
  blind.collectEvents = 5104
  blind.goneEvents = 24018
  blind.mergeVanishes = 23971
  blind.nullMassResolves = 5104
  assert.equal(dropCensusRow([blind]),
    'drop census: none (27872 drops seen, no mass resolved; collect events 5104, gone events 24018, merge-window vanishes 23971, unreadable mass 5104)')
  // the counters sum across records (reconnects append)
  assert.equal(dropCensusRow([blind, blind]).includes('collect events 10208'), true)
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
  assert.equal(rec.nullMassResolves, 1) // (v0.578.0) the blind read is NAMED
  const rec2 = dropCensusRecord()
  observeItemSpawn(rec2, item(22, 8), T0)
  assert.equal(observeItemGone(rec2, item(22, null), T0 + 300_000), true)
  assert.equal(rec2.lostUnits, 0) // the loss happened, the mass is unreadable - no invention
  assert.equal(rec2.lostDrops, 0)
  assert.equal(rec2.nullMassResolves, 1)
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
  assert.equal(dropCensusRow([seen]), 'drop census: none (12 drops seen, no mass resolved; collect events 0, gone events 0, merge-window vanishes 0, unreadable mass 0)')
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
  assert.ok(src.includes("import { dropCensusRecord, observeItemSpawn, observeItemCollect, observeItemGone, dropCensusRow, dropOpenAnatomyRow, overdueOwnerRow } from '../src/lib/dropcensus.mjs'"), 'the import line rides (v0.592.0: the owners\' grain joins)')
  assert.equal((src.match(/observeItemSpawn\(dc, e, Date\.now\(\)\)/g) || []).length, 1, 'the spawn seat, exactly once')
  assert.equal((src.match(/observeItemCollect\(dc, e, Date\.now\(\)\)/g) || []).length, 1, 'the collect seat, exactly once')
  assert.equal((src.match(/observeItemGone\(dc, e, Date\.now\(\)\)/g) || []).length, 1, 'the gone seat, exactly once')
  assert.equal((src.match(/dropCensusRow\(dropCensusRecords\)/g) || []).length, 1, 'the deadline row, exactly once')
  assert.equal((src.match(/dropOpenAnatomyRow\(dropCensusRecords\)/g) || []).length, 1, 'the anatomy row, exactly once (v0.581.0)')
  assert.equal((src.match(/overdueOwnerRow\(dropCensusRecords\)/g) || []).length, 1, 'the owners\' row, exactly once (v0.592.0)')
  assert.ok(src.includes('const dropCensusRecords = []'), 'the fleet-wide book exists')
  assert.ok(src.includes('dc.name = miner.username'), 'the record rides its bot name (the top holder reads by name)')
  assert.ok(/entitySpawn.*try \{ observeItemSpawn/.test(src.replace(/\n/g, ' ')), 'the spawn listener is try-guarded')
})

test('THE OPEN POOL ANATOMY: the buckets, the boundaries and the verdicts (the live tail read one rung deeper)', () => {
  const TD = 1_000_000 + 500_000 // the deadline clock
  const rec = (name) => { const r = dropCensusRecord(); if (name !== undefined) r.name = name; return r }
  const a = rec('F7')
  observeItemSpawn(a, item(61, 300), 1_000_000 + 10) // age 499_990 -> overdue
  observeItemSpawn(a, item(62, 200), 1_000_000 + 450_000) // age 50_000 -> fresh (the boundary: < 60s is fresh)
  observeItemSpawn(a, item(63, 100), 1_000_000 + 100_000) // age 400_000 -> overdue
  const row = dropOpenAnatomyRow([a], TD)
  assert.equal(row,
    'drop open pool: 600u live at the deadline (200u fresh, 0u aging, 400u overdue, top F7=600u) - the old ground mass rode the deadline - the sweep\'s reach is the front')
  // the bucket boundaries: inside 60s reads fresh, exactly 60s reads aging,
  // exactly 300s reads overdue (>= the despawn clock is the class)
  const b = rec()
  observeItemSpawn(b, item(64, 40), TD - OPEN_FRESH_MS + 1) // inside the fresh edge -> fresh
  observeItemSpawn(b, item(65, 40), TD - OPEN_FRESH_MS) // exactly the fresh edge -> aging
  observeItemSpawn(b, item(85, 40), TD - OPEN_OVERDUE_MS) // exactly the overdue edge -> overdue
  assert.ok(dropOpenAnatomyRow([b], TD).includes('120u live'))
  assert.ok(dropOpenAnatomyRow([b], TD).includes('40u fresh, 40u aging, 40u overdue'))
  // the half boundary: exactly 0.5 trips (the family law)
  const c = rec('F2')
  observeItemSpawn(c, item(66, 50), TD - OPEN_OVERDUE_MS)
  observeItemSpawn(c, item(67, 50), TD - 10)
  const mixedRow = dropOpenAnatomyRow([c], TD)
  assert.ok(mixedRow.includes('the sweep\'s reach is the front')) // 50/100 = the boundary trips
  // under the boundary: mixed
  const d = rec('F2')
  observeItemSpawn(d, item(68, 30), TD - OPEN_OVERDUE_MS)
  observeItemSpawn(d, item(69, 70), TD - 10)
  assert.ok(dropOpenAnatomyRow([d], TD).includes('the pool reads mixed, the tail and the residue both ride'))
  // no overdue: the deadline's own tail, no cure named
  const e = rec('F9')
  observeItemSpawn(e, item(70, 80), TD - 30_000)
  assert.ok(dropOpenAnatomyRow([e], TD).includes("the deadline's own tail, no cure named"))
  // the top holder: units desc, name asc on the tie (the census family's law)
  const f1 = rec('F9')
  observeItemSpawn(f1, item(71, 30), TD - 30_000)
  const f2 = rec('F4')
  observeItemSpawn(f2, item(72, 50), TD - 30_000)
  const f3 = rec('F4') // the tie at 30u: F4 sorts before F9
  observeItemSpawn(f3, item(73, 30), TD - 30_000)
  const tieRow = dropOpenAnatomyRow([f1, f2, f3], TD)
  assert.ok(tieRow.includes('top F4=50u'))
  // the sum law: the buckets can never split from openDropUnits
  const open = [a, b, c, d, e].reduce((x, r) => x + openDropUnits(r).units, 0)
  const summed = dropOpenAnatomyRow([a, b, c, d, e], TD)
  assert.ok(summed.includes(`${open}u live at the deadline`))
})

test('the open pool: the none forms are verdicts too (the always-print law)', () => {
  assert.equal(dropOpenAnatomyRow([]), 'drop open pool: none (the pool ended clean)')
  assert.equal(dropOpenAnatomyRow(null), 'drop open pool: none (the pool ended clean)')
  const rec = dropCensusRecord()
  assert.equal(dropOpenAnatomyRow([rec]), 'drop open pool: none (the pool ended clean)') // nothing spawned
  // a resolved pool ends clean
  const r2 = dropCensusRecord()
  observeItemSpawn(r2, item(81, 5), 1_000_000)
  observeItemCollect(r2, item(81, 5), 1_000_000 + 100)
  assert.equal(dropOpenAnatomyRow([r2], 1_000_000 + 500), 'drop open pool: none (the pool ended clean)')
  // unreadable mass: the entry is a live drop, the units stay honest
  const r3 = dropCensusRecord()
  observeItemSpawn(r3, item(82, null), 1_000_000)
  observeItemSpawn(r3, item(83, null), 1_000_000 + 1)
  assert.equal(dropOpenAnatomyRow([r3], 1_000_000 + 500), 'drop open pool: none (2 drops live, no readable mass)')
  // the grain form (under 64u, the write-off family's own number)
  const r4 = dropCensusRecord()
  observeItemSpawn(r4, item(84, 21), 1_000_000)
  assert.equal(dropOpenAnatomyRow([r4], 1_000_000 + 500), 'drop open pool: 21u of live mass under the 64u grain, the sample stays too small to judge')
  // junk records never throw, never speak a bucket
  const torn = dropCensusRecord()
  torn.live = 'torn'
  assert.ok(dropOpenAnatomyRow([torn, null, 'junk'], 1_000_000 + 500).includes('the pool ended clean'))
})

test('THE OVERDUE OWNER GRAIN: one seat names the owner\'s own walk, a spread names the fleet\'s reach (v0.592.0)', () => {
  const TD = 1_000_000 + 500_000 // the deadline clock
  const rec = (name) => { const r = dropCensusRecord(); if (name !== undefined) r.name = name; return r }
  // ONE SEAT: one bot holds the overdue class over the half boundary - the
  // owner's own walk is the cure (the rescue's class, not the fleet's reach)
  const a = rec('F16')
  observeItemSpawn(a, item(91, 2942), TD - OPEN_OVERDUE_MS) // the seat's own overdue mass
  observeItemSpawn(a, item(92, 100), TD - 30_000) // the fresh tail never enters the old class
  assert.equal(overdueOwnerRow([a], TD),
    'overdue owners: 1 bot(s) hold 2942u overdue - F16 holds 100.0% (2942u) - one seat owns the old ground (that seat\'s own walk is the cure)')
  // exactly the half boundary trips (the family law - OPEN_OVERDUE_SHARE's own number)
  const half = rec('F5')
  observeItemSpawn(half, item(93, 400), TD - OPEN_OVERDUE_MS)
  const other = rec('F7')
  observeItemSpawn(other, item(94, 400), TD - OPEN_OVERDUE_MS - 1) // 400/800 = the boundary
  const halfRow = overdueOwnerRow([half, other], TD)
  assert.ok(halfRow.includes('one seat owns the old ground'), 'the boundary trips')
  assert.ok(halfRow.includes('F5 holds 50.0% (400u)'))
  // SPREAD: no owner reaches the half - the reach is the fleet's front
  const b = rec('F9')
  observeItemSpawn(b, item(95, 520), TD - OPEN_OVERDUE_MS)
  const c = rec('F12')
  observeItemSpawn(c, item(96, 410), TD - OPEN_OVERDUE_MS)
  const d = rec('F4')
  observeItemSpawn(d, item(97, 380), TD - OPEN_OVERDUE_MS)
  const spreadRow = overdueOwnerRow([b, c, d], TD)
  assert.equal(spreadRow,
    'overdue owners: 3 bot(s) hold 1310u overdue - top F9=520u (39.7%) - the old ground is spread (the reach is the fleet\'s front)')
  // the sum law: the owners' overdue total can never split from the anatomy's
  const tallied = [a, half, other, b, c, d]
  const anatomyOverdue = dropOpenAnatomyRow(tallied, TD).match(/(\d+)u overdue/)
  const ownersTotal = Number(overdueOwnerRow(tallied, TD).match(/hold (\d+)u overdue/)[1])
  assert.equal(ownersTotal, Number(anatomyOverdue[1]), 'one age ladder, one arithmetic')
  // the top-holder law: units desc, name asc on the tie
  const t1 = rec('F9')
  observeItemSpawn(t1, item(98, 70), TD - OPEN_OVERDUE_MS)
  const t2 = rec('F4')
  observeItemSpawn(t2, item(99, 70), TD - OPEN_OVERDUE_MS)
  const t3 = rec('F6')
  observeItemSpawn(t3, item(104, 40), TD - OPEN_OVERDUE_MS)
  assert.ok(overdueOwnerRow([t1, t2, t3], TD).includes('top F4=70u'), 'the tie reads name-asc')
  // the junk battery: torn records, junk names, impossible clocks, null mass
  const torn = rec()
  torn.live = 'torn'
  const junkName = rec('   ')
  observeItemSpawn(junkName, item(100, 80), TD - OPEN_OVERDUE_MS)
  assert.ok(overdueOwnerRow([torn, junkName, null, 5], TD).includes('- holds 100.0% (80u)'), 'the blank name rides the dash')
  const backClock = rec('F2')
  observeItemSpawn(backClock, item(101, 90), TD + 10) // the age reads negative - the middle, never the old class
  assert.ok(overdueOwnerRow([backClock], TD).includes('no overdue mass'), 'the impossible clock is nobody\'s old ground')
  const blind = rec('F3')
  observeItemSpawn(blind, item(102, null), TD - OPEN_OVERDUE_MS)
  assert.ok(overdueOwnerRow([blind], TD).includes('no overdue mass'), 'the unreadable mass never enters the units')
  const collected = rec('F8')
  observeItemSpawn(collected, item(103, 90), TD - OPEN_OVERDUE_MS)
  observeItemCollect(collected, item(103, 90), TD - 10)
  assert.equal(overdueOwnerRow([collected], TD), 'overdue owners: none (the pool ended clean)', 'the collected exit is gone from the pool')
})

test('the overdue owners: the none forms are verdicts too (the always-print law)', () => {
  assert.equal(overdueOwnerRow([]), 'overdue owners: none (the pool ended clean)')
  assert.equal(overdueOwnerRow(null), 'overdue owners: none (the pool ended clean)')
  const rec = () => dropCensusRecord()
  assert.equal(overdueOwnerRow([rec()]), 'overdue owners: none (the pool ended clean)')
  // a live pool with no old class: the none-form names the live drops
  const r2 = dropCensusRecord()
  observeItemSpawn(r2, item(111, 30), 1_000_000)
  assert.equal(overdueOwnerRow([r2], 1_000_000 + 500), 'overdue owners: none (1 drops live, no overdue mass)')
  // the grain form (under 64u, the write-off family's own number)
  const r3 = dropCensusRecord()
  observeItemSpawn(r3, item(112, 21), 1_000_000)
  assert.equal(overdueOwnerRow([r3], 1_000_000 + 301_000), 'overdue owners: 21u of overdue mass under the 64u grain, the sample stays too small to judge')
  // the boundary: exactly 300s reads the old class (>= the despawn clock)
  const r4 = dropCensusRecord()
  observeItemSpawn(r4, item(113, 40), 1_000_000 + 200_000)
  assert.equal(overdueOwnerRow([r4], 1_000_000 + 500_000), 'overdue owners: 40u of overdue mass under the 64u grain, the sample stays too small to judge')
})
