// The second leg (v0.900.0) - the delivery leg's own same-trip retry.
//
// Measured background (faces 179/180/181, the sand lane's third consecutive
// naming): sand demanded 20x, the map held 262..377 sand positions, the
// pocket still read 0 -> 0 - because ONE unreachable walk spent the whole
// trip (lastTrip set before the walk, the next attempt waits the 75s
// cadence plus a shaft's work). The law: the deadline owns the second leg,
// the map's depth (the re-selection that already refuses the failed cell)
// second, and a first leg that never reached 'unreachable' has no second
// leg at all. The census guard prices the log contract: the second leg's
// own lines must NEVER parse as launches or skips (the launch shape
// ^F<N> map trip: <blocks>$ stays byte-exact).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  secondLegDecision, parseMapTrip, MAP_TRIP_RE, MAP_TRIP_SKIP_RE
} from '../../src/lib/maptrip.mjs'

test('the deadline owns the second leg (v0.17.1 same-trip twin)', () => {
  const d = secondLegDecision({ firstLegError: 'unreachable', shouldStopNow: true, hasCandidate: true })
  assert.deepEqual(d, { leg: 'none', why: 'deadline' })
})

test('no candidate left -> the honest refusal, never a re-walk', () => {
  const d = secondLegDecision({ firstLegError: 'unreachable', shouldStopNow: false, hasCandidate: false })
  assert.deepEqual(d, { leg: 'none', why: 'no-candidate' })
})

test('a reachable candidate arms the second leg', () => {
  const d = secondLegDecision({ firstLegError: 'unreachable', shouldStopNow: false, hasCandidate: true })
  assert.deepEqual(d, { leg: 'second', why: 'candidate-ready' })
})

test('a first leg that never went unreachable has no second leg', () => {
  assert.deepEqual(secondLegDecision({ firstLegError: null, hasCandidate: true }), { leg: 'none', why: 'not-unreachable' })
  assert.deepEqual(secondLegDecision({ firstLegError: 'no-target', hasCandidate: true }), { leg: 'none', why: 'not-unreachable' })
})

test('junk input degrades to the honest none, never a throw', () => {
  assert.deepEqual(secondLegDecision(), { leg: 'none', why: 'not-unreachable' })
  assert.deepEqual(secondLegDecision({}), { leg: 'none', why: 'not-unreachable' })
})

test('CENSUS GUARD: the second leg lines never parse as launches', () => {
  // the launch shape stays byte-exact: ^F<N> map trip: <blocks>$
  assert.equal(parseMapTrip('F3 map trip second leg: sand'), null)
  assert.equal(parseMapTrip('F3 map trip second leg deferred: deadline'), null)
  assert.equal(parseMapTrip('F3 map trip second leg failed: walk'), null)
  assert.ok(!MAP_TRIP_RE.test('F3 map trip second leg: sand'))
})

test('CENSUS GUARD: the second leg refusal never parses as a skip', () => {
  // the skip shape needs "map trip skipped: " directly after the bot name;
  // "second leg" between the two must keep the family out of the census
  assert.equal(parseMapTrip('F3 map trip second leg skipped: no candidate left'), null)
  assert.ok(!MAP_TRIP_SKIP_RE.test('F3 map trip second leg skipped: no candidate left'))
})

test('the standing launch and skip shapes still parse (no regression)', () => {
  assert.deepEqual(parseMapTrip('F3 map trip: sand'), { bot: 'F3', kind: 'launch', targets: ['sand'] })
  assert.deepEqual(parseMapTrip('F3 map trip: sand,gravel'), { bot: 'F3', kind: 'launch', targets: ['sand', 'gravel'] })
  const s = parseMapTrip('F3 map trip skipped: sand,gravel unreachable')
  assert.equal(s.kind, 'skip')
  assert.equal(s.why, 'unreachable')
})
