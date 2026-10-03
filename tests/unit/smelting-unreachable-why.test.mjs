// (v0.577.0) THE UNREACHABLE WHY SPLIT - the owner family's third seat. The
// owner map named WHICH machine the walk tax sits on; this row reads WHAT
// KIND of failure the walk died of, through the walk-fail lens's OWN
// classifier (ONE vocabulary by construction). All pure map arithmetic -
// every assertion is exact, no mocks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { smeltUnreachableWhyRow, SMELT_NO_FUEL_OWNER_MIN, SMELT_NO_FUEL_OWNER_LOCAL_SHARE } from '../../src/lib/smelting.mjs'
import { classifySweepReason } from '../../src/lib/walkfail.mjs'

const e = (why, count) => ({ why, count })

test('the lens vocabulary feeds the row unchanged (ONE vocabulary by construction)', () => {
  // the field's own shapes from the face-25 log, through the lens's classifier
  const wrapped = classifySweepReason('machine unreachable (Took to long to decide path to goal!)')
  assert.equal(wrapped.why, 'machine-unreachable-decide-timeout')
  const timeout = classifySweepReason('machine unreachable (walk to a machine (sweep): timeout after 17ms)')
  assert.equal(timeout.why, 'machine-unreachable-walk-timeout')
  const bare = classifySweepReason('machine unreachable') // the legacy bare reason - the honest bucket, never dropped
  assert.equal(bare.why, 'other')
})

test('the live anchor: the diag-log shape (decide-timeout 6 of 7) trips with its own lever', () => {
  const row = smeltUnreachableWhyRow([e('machine-unreachable-decide-timeout', 6), e('machine-unreachable-walk-timeout', 1)])
  assert.equal(row, 'smelt unreachable why: machine-unreachable-decide-timeout carries 6 of 7 refusals (85.7%) - one lever owns the walks: the pathfinder\'s decision ceiling is the lever')
})

test('each named class reads its own lever', () => {
  assert.ok(smeltUnreachableWhyRow([e('machine-unreachable-walk-timeout', 4)]).includes('the walk budget against the approach\'s cost is the lever'))
  assert.ok(smeltUnreachableWhyRow([e('machine-unreachable-no-path', 4)]).includes('the lattice\'s reach is the lever'))
  assert.ok(smeltUnreachableWhyRow([e('machine-unreachable-governor-refusal', 4)]).includes('the governor\'s own gates are the lever'))
  // an unnamed class reads the honest generic lever, never a guessed mechanism
  assert.ok(smeltUnreachableWhyRow([e('other', 4)]).includes('the class\'s own detail is the lever'))
  assert.ok(smeltUnreachableWhyRow([e('machine-unreachable-goal-churn', 9)]).includes('the class\'s own detail is the lever'))
})

test('the spread form: no lever when the leader sits under the half boundary', () => {
  const row = smeltUnreachableWhyRow([e('machine-unreachable-no-path', 2), e('machine-unreachable-walk-timeout', 2), e('other', 1)])
  assert.equal(row, 'smelt unreachable why: no lever (top machine-unreachable-no-path 2 of 5, 40.0%) - the walk failures read mixed, the cures point different ways')
})

test('the 0.5 boundary trips (>= is the family law) and the tie reads key-asc', () => {
  const at = smeltUnreachableWhyRow([e('machine-unreachable-decide-timeout', 4), e('machine-unreachable-no-path', 4)])
  assert.ok(at.startsWith('smelt unreachable why: machine-unreachable-decide-timeout carries 4 of 8 refusals (50.0%)'), 'exactly 0.5 trips, the tie-break is key asc')
})

test('the grain floor: a run under the floor prints nothing, exactly at it speaks', () => {
  assert.equal(smeltUnreachableWhyRow([e('machine-unreachable-no-path', 2)]), null)
  const at = smeltUnreachableWhyRow([e('machine-unreachable-no-path', SMELT_NO_FUEL_OWNER_MIN)])
  assert.ok(at.includes(`carries ${SMELT_NO_FUEL_OWNER_MIN} of ${SMELT_NO_FUEL_OWNER_MIN} refusals (100.0%)`))
})

test('the merge law: the same class aggregates across bots', () => {
  const row = smeltUnreachableWhyRow([e('machine-unreachable-walk-timeout', 2), e('machine-unreachable-walk-timeout', 2)])
  assert.ok(row.includes('machine-unreachable-walk-timeout carries 4 of 4 refusals (100.0%)'))
})

test('the junk battery: torn entries never enter, junk keys read the honest bucket', () => {
  assert.equal(smeltUnreachableWhyRow(null), null)
  assert.equal(smeltUnreachableWhyRow('junk'), null)
  assert.equal(smeltUnreachableWhyRow([]), null)
  assert.equal(smeltUnreachableWhyRow([null, 42, 'junk', e('machine-unreachable-no-path', 0), e('machine-unreachable-no-path', -3), e('machine-unreachable-no-path', NaN)]), null)
  const junky = smeltUnreachableWhyRow([e(null, 3), e('', 3), e('   ', 3), e('machine-unreachable-no-path', 3)])
  assert.ok(junky.startsWith('smelt unreachable why: other carries 9 of 12 refusals (75.0%)'), 'junk keys all fall into the other bucket, which leads at 75%')
  assert.ok(junky.includes('the class\'s own detail is the lever'), 'the unnamed leader reads the honest generic lever')
})

test('the constants route the row (one grain law for the whole owner family)', () => {
  assert.equal(SMELT_NO_FUEL_OWNER_MIN, 3)
  assert.equal(SMELT_NO_FUEL_OWNER_LOCAL_SHARE, 0.5)
  const just = smeltUnreachableWhyRow([e('machine-unreachable-walk-timeout', SMELT_NO_FUEL_OWNER_MIN - 1)])
  assert.equal(just, null, 'the family floor holds')
})

test('the wiring pin: the feed rides the machine-unreachable seat, the print follows the owner row', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes("import { classifySweepReason } from '../src/lib/walkfail.mjs'"), 'the lens import rides')
  assert.ok(src.includes('smeltUnreachableWhyRow'), 'the row import rides')
  assert.equal((src.match(/const finalSmeltUnreachableWhy = new Map\(\)/g) || []).length, 1, 'the why ledger, exactly once')
  assert.equal((src.match(/classifySweepReason\(typeof sa\?\.reason === 'string' \? sa\.reason : null\)\.why/g) || []).length, 1, 'the feed unwraps the FULL reason, exactly once')
  assert.equal((src.match(/smeltUnreachableWhyRow\(\[\.\.\.finalSmeltUnreachableWhy\]/g) || []).length, 1, 'the deadline print, exactly once')
  const feedAt = src.indexOf('classifySweepReason(typeof sa?.reason')
  const ownerAt = src.indexOf("if (sr === 'machine unreachable') {")
  const printAt = src.indexOf('smeltUnreachableWhyRow([...finalSmeltUnreachableWhy]')
  assert.ok(ownerAt > -1 && feedAt > ownerAt && printAt > feedAt, 'the feed sits inside the census seat, the print after')
})
