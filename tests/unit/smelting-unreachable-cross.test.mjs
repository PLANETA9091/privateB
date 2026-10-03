// THE UNREACHABLE CROSS - tests. (v0.580.0) The owner family's fourth seat:
// the PAIR (machine x why) per attempt, the family's own grain laws, the
// why split's own lever table. The live anchor pins the fleet 37156942229
// face's own shape (furnace 8 of 12, no-path 5 of 12 - the cross reads the
// pair the two marginal rows could not).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  smeltUnreachableCrossRow,
  SMELT_NO_FUEL_OWNER_MIN, SMELT_NO_FUEL_OWNER_LOCAL_SHARE,
} from '../../src/lib/smelting.mjs'

// the fleet 37156942229 face's own pair shape: furnace 8 of 12 (66.7%),
// no-path 5 of 12 (41.7%) - both marginal rows spoke, neither aimed the cure
const face = [
  { machine: 'furnace', why: 'machine-unreachable-no-path', count: 5 },
  { machine: 'furnace', why: 'machine-unreachable-walk-timeout', count: 2 },
  { machine: 'furnace', why: 'machine-unreachable-decide-timeout', count: 1 },
  { machine: 'blast_furnace', why: 'machine-unreachable-no-path', count: 2 },
  { machine: 'blast_furnace', why: 'machine-unreachable-walk-timeout', count: 2 },
]

test('the live anchor: the 37156942229 face reads no pair (41.7% under the half)', () => {
  assert.equal(
    smeltUnreachableCrossRow(face),
    'smelt unreachable cross: no pair (top furnace x machine-unreachable-no-path 5 of 12, 41.7%) - the cell-mechanism cells read mixed, the cures point different ways',
  )
})

test('the trip form names the cell AND the mechanism lever in one read', () => {
  const pairs = [
    { machine: 'furnace', why: 'machine-unreachable-no-path', count: 7 },
    { machine: 'blast_furnace', why: 'machine-unreachable-walk-timeout', count: 5 },
  ]
  assert.equal(
    smeltUnreachableCrossRow(pairs),
    'smelt unreachable cross: furnace x machine-unreachable-no-path carries 7 of 12 unreachable refusals (58.3%) - one cell-mechanism owns the walks: the lattice\'s reach is the lever',
  )
})

test('the 0.5 boundary trips at >= (the family\'s own shape)', () => {
  const at = [
    { machine: 'furnace', why: 'machine-unreachable-decide-timeout', count: 3 },
    { machine: 'blast_furnace', why: 'machine-unreachable-no-path', count: 2 },
    { machine: 'furnace', why: 'machine-unreachable-walk-timeout', count: 1 },
  ]
  const row = smeltUnreachableCrossRow(at)
  assert.match(row, /one cell-mechanism owns the walks: the pathfinder's decision ceiling is the lever/, 'exactly the half boundary trips')
  const under = [
    { machine: 'furnace', why: 'machine-unreachable-decide-timeout', count: 3 },
    { machine: 'blast_furnace', why: 'machine-unreachable-no-path', count: 4 },
    { machine: 'furnace', why: 'machine-unreachable-walk-timeout', count: 2 },
  ]
  assert.match(smeltUnreachableCrossRow(under), /^smelt unreachable cross: no pair /, '4 of 9 (44.4%) reads no pair')
})

test('the floor: exactly the family minimum speaks, under it stays quiet', () => {
  assert.match(smeltUnreachableCrossRow([{ machine: 'furnace', why: 'machine-unreachable-no-path', count: SMELT_NO_FUEL_OWNER_MIN }]), /carries 3 of 3/)
  assert.equal(smeltUnreachableCrossRow([{ machine: 'furnace', why: 'machine-unreachable-no-path', count: SMELT_NO_FUEL_OWNER_MIN - 1 }]), null)
})

test('the tie law: count desc, then machine asc (blast_furnace sorts before furnace), then why asc', () => {
  const pairs = [
    { machine: 'furnace', why: 'machine-unreachable-no-path', count: 3 },
    { machine: 'blast_furnace', why: 'machine-unreachable-no-path', count: 3 },
  ]
  assert.match(smeltUnreachableCrossRow(pairs), /^smelt unreachable cross: blast_furnace x /, 'the machine-asc tie holds')
  const whys = [
    { machine: 'furnace', why: 'machine-unreachable-no-path', count: 3 },
    { machine: 'furnace', why: 'machine-unreachable-decide-timeout', count: 3 },
  ]
  assert.match(smeltUnreachableCrossRow(whys), /^smelt unreachable cross: furnace x machine-unreachable-decide-timeout /, 'the why-asc tie holds')
})

test('the lever vocabulary routes through the why split\'s own table', () => {
  const walk = [{ machine: 'furnace', why: 'machine-unreachable-walk-timeout', count: 4 }]
  assert.match(smeltUnreachableCrossRow(walk), /the walk budget against the approach's cost is the lever/)
  const unnamed = [{ machine: 'furnace', why: 'other', count: 4 }]
  assert.match(smeltUnreachableCrossRow(unnamed), /the class's own detail is the lever/)
})

test('the junk battery: the family\'s own laws (machine -, why other, junk counts never enter)', () => {
  const junk = [
    { machine: null, why: null, count: 2 },
    { machine: '', why: 42, count: 2 },
    { machine: 'furnace', why: 'machine-unreachable-no-path', count: 0 },
    { machine: 'furnace', why: 'machine-unreachable-no-path', count: -5 },
    { machine: 'furnace', why: 'machine-unreachable-no-path', count: Number.NaN },
    { machine: 'furnace', why: 'machine-unreachable-no-path', count: Number.POSITIVE_INFINITY },
    'torn',
    null,
  ]
  assert.equal(
    smeltUnreachableCrossRow(junk),
    'smelt unreachable cross: - x other carries 4 of 4 unreachable refusals (100.0%) - one cell-mechanism owns the walks: the class\'s own detail is the lever',
    'the honest buckets speak - the two junk pairs merge under - x other (never dropped)',
  )
  const withReal = [
    ...junk,
    { machine: 'furnace', why: 'machine-unreachable-no-path', count: 3 },
  ]
  assert.equal(
    smeltUnreachableCrossRow(withReal),
    'smelt unreachable cross: - x other carries 4 of 7 unreachable refusals (57.1%) - one cell-mechanism owns the walks: the class\'s own detail is the lever',
    'junk never enters the real pair, but the honest buckets still count (never dropped)',
  )
  assert.equal(smeltUnreachableCrossRow('not an array'), null)
  assert.equal(smeltUnreachableCrossRow(undefined), null)
})

test('the merge law: the same pair fed twice sums (reconnects append, never double-lead)', () => {
  const merged = [
    { machine: 'furnace', why: 'machine-unreachable-no-path', count: 2 },
    { machine: 'furnace', why: 'machine-unreachable-no-path', count: 1 },
  ]
  assert.match(smeltUnreachableCrossRow(merged), /carries 3 of 3/)
})

test('the sum law: the cross\'s total can never split from the owner map\'s (same attempts)', () => {
  const pairs = face.map(e => ({ machine: e.machine, count: e.count }))
  const ownerTotal = new Map()
  for (const e of pairs) ownerTotal.set(e.machine, (ownerTotal.get(e.machine) || 0) + e.count)
  const ownerSum = [...ownerTotal.values()].reduce((a, b) => a + b, 0)
  const crossRow = smeltUnreachableCrossRow(face)
  const crossTotal = Number(crossRow.match(/of (\d+)/)[1])
  assert.equal(crossTotal, ownerSum, 'one feed, one total')
})

test('the constants route: the family\'s own grain laws, imported not copied', () => {
  assert.equal(SMELT_NO_FUEL_OWNER_MIN, 3)
  assert.equal(SMELT_NO_FUEL_OWNER_LOCAL_SHARE, 0.5)
})

test('the wiring pin: the cross rides the same feed seat, the print follows the why row', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /smeltUnreachableCrossRow/, 'the row is imported')
  assert.match(src, /const finalSmeltUnreachableCross = new Map\(\)/, 'the cross ledger exists')
  assert.match(src, /const crossKey = `\$\{reachKey\}\|\$\{whyKey\}`/, 'the pair is keyed at the census feed seat')
  const whyPrint = src.indexOf('if (smeltUnreachableWhy) console.log(smeltUnreachableWhy)')
  const crossPrint = src.indexOf('if (smeltUnreachableCross) console.log(smeltUnreachableCross)')
  assert.ok(whyPrint !== -1, 'the why row prints')
  assert.ok(crossPrint > whyPrint, 'the cross print follows the why row sibling')
})
