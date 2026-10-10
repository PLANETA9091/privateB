// The doom-aware re-selection (v0.902.0) - the second leg's own veto.
//
// Measured background (face 183, THE SECOND LEG's debut face): the census
// read delivered 3 / refused 0 / failed 6 of 9 - the delivery share 33.3% -
// and every failed leg died the SAME death: 'doomed goal (ledgered 0..87s
// ago at ...)' at the consult, three bots on the same [-122,44,426] cell,
// while the map held 656 sand records. The re-selection read failedTrips
// (the first leg's own grave) but not the fleet's doomed-goal ledger. The
// law: a live-doomed candidate is a dead candidate at SELECTION time (the
// v0.62.0 wetTrip precedent), the veto radius sums the consult's own (2)
// and the stand goal's spread (4), and the all-doomed read lands the honest
// refused form - never a failed leg. Junk-safe by the nopath law: a
// garbage consult never vetoes - the walk tries honestly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  doomVetoRadius, doomVetoVerdict,
  MAP_TRIP_RE, MAP_TRIP_SKIP_RE, secondLegCensus
} from '../../src/lib/maptrip.mjs'

test('a live-doomed consult vetoes the candidate', () => {
  const d = doomVetoVerdict({ hit: true, ageMs: 0 })
  assert.deepEqual(d, { veto: true, why: 'doomed' })
})

test('a clear consult walks the candidate', () => {
  const d = doomVetoVerdict({ hit: false, ageMs: 0 })
  assert.deepEqual(d, { veto: false, why: 'clear' })
})

test('a null consult never vetoes (the junk law)', () => {
  assert.deepEqual(doomVetoVerdict(null), { veto: false, why: 'no-consult' })
  assert.deepEqual(doomVetoVerdict(undefined), { veto: false, why: 'no-consult' })
})

test('garbage consults never veto (number, string, array, naked hit)', () => {
  assert.deepEqual(doomVetoVerdict(7), { veto: false, why: 'no-consult' })
  assert.deepEqual(doomVetoVerdict('hit: true'), { veto: false, why: 'no-consult' })
  assert.deepEqual(doomVetoVerdict([{ hit: true }]), { veto: false, why: 'no-consult' })
  assert.deepEqual(doomVetoVerdict({ ageMs: 5 }), { veto: false, why: 'no-consult' })
})

test('a non-boolean hit never vetoes (the ledger cannot own the read)', () => {
  assert.deepEqual(doomVetoVerdict({ hit: 'yes' }), { veto: false, why: 'no-consult' })
  assert.deepEqual(doomVetoVerdict({ hit: 1 }), { veto: false, why: 'no-consult' })
})

test('the veto radius sums the consult radius and the stand spread', () => {
  assert.equal(doomVetoRadius(2, 4), 6)
  assert.equal(doomVetoRadius(0, 0), 0)
  assert.equal(doomVetoRadius(5, 1), 6)
})

test('junk radii ride the field defaults (2 + 4), never a blinding zero', () => {
  assert.equal(doomVetoRadius(undefined, undefined), 6)
  assert.equal(doomVetoRadius(NaN, 'x'), 6)
  assert.equal(doomVetoRadius(-1, -4), 6)
})

test('CENSUS GUARD: the veto adds no log line - the four anchored forms stand byte-exact', () => {
  const lines = [
    'F9 map trip: sand',
    'F9 map trip second leg: sand',
    'F4 map trip second leg failed: doomed goal (ledgered 0s ago at [-127,60,388]) - map trip second leg sand refused',
    'F3 map trip second leg skipped: no candidate left',
    'F2 map trip second leg deferred: deadline'
  ]
  const c = secondLegCensus(lines)
  assert.equal(c.n, 4)
  assert.equal(c.delivered, 1)
  assert.equal(c.failed, 1)
  assert.equal(c.refused, 1)
  assert.equal(c.deferred, 1)
  assert.equal(c.unparsed, 0)
  assert.equal(MAP_TRIP_RE.test('F9 map trip second leg: sand'), false)
  assert.equal(MAP_TRIP_SKIP_RE.test('F4 map trip second leg failed: doomed goal (ledgered 0s ago at [-127,60,388]) - map trip second leg sand refused'), false)
})

test('the all-doomed face lands the honest refused shape the census already counts', () => {
  // the wiring contract: extraSkip rejects every candidate -> mapTargetFor
  // returns null -> hasCandidate false -> secondLegDecision's own refusal
  // (tested there) -> fleet19 prints 'skipped: no candidate left' - the
  // refused bucket, not failed. This pin keeps the shape the row composer
  // reads (the share's denominator moves failed -> refused, not silent).
  const c = secondLegCensus(['F13 map trip second leg skipped: no candidate left'])
  assert.equal(c.refused, 1)
  assert.equal(c.failed, 0)
})
