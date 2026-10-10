// The second leg's own census (v0.901.0) - the debut family's own read.
//
// Background: the v0.900.0 law put four new line forms on the wire; the
// mapTripCensus counts them as unparsed (the launch/skip shapes stay
// byte-exact), so the field evidence rode invisible. The lens parses the
// family's own four anchored shapes - the delivery share is the v0.900.0
// law's own field verdict (did the map's depth feed the pocket lane the
// three faces starved?). The decompose's honest null: a pre-v0.900.0 face
// stays silent - nothing composed from nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  secondLegCensus, secondLegRow,
  SECOND_LEG_DELIVERED_RE, SECOND_LEG_DEFERRED_RE, SECOND_LEG_REFUSED_RE, SECOND_LEG_FAILED_RE
} from '../../src/lib/maptrip.mjs'

test('the four canonical forms each land their own count', () => {
  const c = secondLegCensus([
    'F3 map trip second leg: sand',
    'F3 map trip second leg deferred: deadline',
    'F5 map trip second leg skipped: no candidate left',
    'F5 map trip second leg failed: walk'
  ])
  assert.equal(c.n, 4)
  assert.equal(c.delivered, 1)
  assert.equal(c.deferred, 1)
  assert.equal(c.refused, 1)
  assert.equal(c.failed, 1)
  assert.equal(c.unparsed, 0)
})

test('the delivery target lands in byTarget, every form in byBot', () => {
  const c = secondLegCensus([
    'F3 map trip second leg: sand',
    'F3 map trip second leg: gravel',
    'F9 map trip second leg deferred: deadline'
  ])
  assert.deepEqual(c.byTarget, { sand: 1, gravel: 1 })
  assert.deepEqual(c.byBot, { F3: 2, F9: 1 })
})

test('non-family lines ride invisible (no census pollution)', () => {
  const c = secondLegCensus([
    'F3 map trip: sand',
    'F3 map trip skipped: sand unreachable',
    'F3 walked the shore',
    '',
    null
  ])
  assert.equal(c.n, 0)
  assert.deepEqual(c.byBot, {})
  assert.deepEqual(c.byTarget, {})
})

test('a family line in an unknown shape names itself unparsed', () => {
  const c = secondLegCensus(['F3 map trip second leg: some future shape'])
  assert.equal(c.n, 0)
  assert.equal(c.unparsed, 1)
  assert.deepEqual(c.byBot, { F3: 1 })
})

test('junk input degrades to the empty census, never a throw', () => {
  assert.deepEqual(secondLegCensus(), { n: 0, delivered: 0, deferred: 0, refused: 0, failed: 0, byBot: {}, byTarget: {}, unparsed: 0 })
  assert.deepEqual(secondLegCensus([]), { n: 0, delivered: 0, deferred: 0, refused: 0, failed: 0, byBot: {}, byTarget: {}, unparsed: 0 })
})

test('the row composes the delivery share on the family numbers', () => {
  const c = secondLegCensus(['F3 map trip second leg: sand', 'F5 map trip second leg failed: walk'])
  const row = secondLegRow(c)
  assert.ok(row.includes('delivered 1 / deferred 0 / refused 0 / failed 1 of 2'))
  assert.ok(row.includes('the delivery share 50.0%'))
})

test('THE ZERO DELIVERY names the depth-answer honestly', () => {
  const c = secondLegCensus(['F3 map trip second leg deferred: deadline', 'F5 map trip second leg skipped: no candidate left'])
  assert.ok(secondLegRow(c).includes('THE ZERO DELIVERY'))
})

test('the honest null: an empty census composes nothing', () => {
  assert.equal(secondLegRow(secondLegCensus([])), null)
  assert.equal(secondLegRow(null), null)
})

test('the anchored shapes reject look-alikes (never a half-count)', () => {
  assert.ok(!SECOND_LEG_DELIVERED_RE.test('F3 map trip second leg: sand extra'))
  assert.ok(!SECOND_LEG_DEFERRED_RE.test('F3 map trip second leg deferred: night'))
  assert.ok(!SECOND_LEG_REFUSED_RE.test('F3 map trip second leg skipped: something else'))
  assert.ok(!SECOND_LEG_FAILED_RE.test('F12 map trip second leg failed:'))
  assert.ok(SECOND_LEG_FAILED_RE.test('F12 map trip second leg failed: goal tuning timeout'))
})
