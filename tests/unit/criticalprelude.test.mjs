import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criticalPrelude, CRITICAL_BAR_RE, CRITICAL_HP } from '../../src/lib/criticalprelude.mjs'

// Face 43's live shapes verbatim (run 36970605824) - the three critical
// bars and the flee starts around them (hand-traced: the inter-episode
// prose and the deaths of other lenses are omitted - they never join a
// prelude).
const face43Mini = [
  // F17's verdict line - not a bar, not a flee start (must not join)
  'F17 [F17] combat: verdict flipped to flee vs spider (hp 8.3)',
  // F15's first prelude - the bar IMMEDIATELY before its flight (hp 2.5)
  'F15 [F15] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it',
  'F15 [F15] combat: fleeing zombie_villager (dist 6.0, hp 2.5, 2 nearby, proximity)',
  // F2's flight - no bar ever spoke for this bot (the without lane)
  'F2 [F2] combat: fleeing creeper (dist 6.2, hp 16.8, 3 nearby, proximity)',
  // F5's prelude is the OTHER sensor: the shelter skip, not the bar -
  // fleeing at hp 2.0 with the bar silent = THE SENSOR GAP
  'F5 [F5] combat: shelter skip (open field: ring incomplete 7/8)',
  'F5 [F5] combat: fleeing zombie_villager (dist 4.8, hp 2.0, 1 nearby, proximity)',
  // F15's second prelude - the bar again, the second flight (hp 2.5)
  'F15 [F15] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it',
  'F15 [F15] combat: fleeing zombie_villager (dist 6.1, hp 2.5, 1 nearby, proximity)',
  // F19's prelude - the sentry flight (hp 5.0)
  'F19 [F19] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it',
  'F19 [F19] combat: fleeing skeleton (dist 11.5, hp 5.0, 1 nearby, sentry)',
  // F16's flight - hp 19.0, no bar (the healthy lane)
  'F16 [F16] combat: fleeing creeper (dist 6.7, hp 19.0, 2 nearby, proximity)',
  // a death of another lens - never joins a prelude
  'F5 [F5] died - respawning (cause: server: was slain by Zombie Villager [kind=mob by Zombie] | inferred: zombie_villager@0.7 (0s before death at [-152,65,407]) [the inference CONTRADICTS the server verdict])'
]

test('criticalPrelude reads face 43 verbatim: 3 bars join 3 flights, the F5 gap rides the shelter-skip prelude', () => {
  const r = criticalPrelude(face43Mini)
  assert.equal(r.bars, 3)
  assert.equal(r.joinedBars, 3)
  assert.equal(r.unjoinedBars, 0)
  assert.equal(r.fleeStarts, 6)
  assert.deepEqual(r.prelude, { with: 3, without: 3 })
  // the critical-zone read: hp < 8 flees = F15 2.5 x2, F5 2.0, F19 5.0;
  // covered = the three bar-preludes, the gap = F5 (hp 2.0, bar silent -
  // its prelude is the shelter skip's own lane)
  assert.equal(r.criticalFlees, 4)
  assert.equal(r.covered, 3)
  assert.equal(r.gap, 1)
})

test('the join rows carry the flight the bar announced (bot, hp, the gap in lines)', () => {
  const r = criticalPrelude(face43Mini)
  assert.deepEqual(r.rows.map(x => x.bot), ['F15', 'F15', 'F19'])
  assert.deepEqual(r.rows.map(x => x.hp), [2.5, 2.5, 5.0])
  // face 43's preludes are immediate - the bar speaks and the flight answers
  assert.ok(r.rows.every(x => x.gapLines === 1))
})

// Face 42's live shapes (run 36967273918) - the tail bar's own leg: F17's
// bar never found its flight (the face's tail took it - the honest
// unjoined)
const face42Mini = [
  'F4 [F4] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it',
  'F4 [F4] combat: fleeing creeper (dist 6.7, hp 5.8, 1 nearby, proximity)',
  'F10 [F10] combat: fleeing creeper (dist 5.7, hp 20.0, 1 nearby, proximity)',
  'F13 [F13] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it',
  'F13 [F13] combat: fleeing zombie (dist 6.8, hp 6.7, 1 nearby, proximity)',
  'F17 [F17] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it'
]

test("criticalPrelude reads face 42 verbatim: F17's tail bar unjoined, the critical zone fully covered", () => {
  const r = criticalPrelude(face42Mini)
  assert.equal(r.bars, 3)
  assert.equal(r.joinedBars, 2)
  assert.equal(r.unjoinedBars, 1)
  assert.equal(r.fleeStarts, 3)
  assert.deepEqual(r.prelude, { with: 2, without: 1 })
  // F10's flight rode no bar (hp 20.0 - the healthy lane); the two
  // critical-zone flights (5.8, 6.7) BOTH rode the prelude - gap 0
  assert.equal(r.criticalFlees, 2)
  assert.equal(r.covered, 2)
  assert.equal(r.gap, 0)
})

test('the bar does not leak across flights: the second flight after one bar rides no prelude', () => {
  const r = criticalPrelude([
    'F7 [F7] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it',
    'F7 [F7] combat: fleeing zombie (dist 6.0, hp 7.0, 1 nearby, proximity)',
    'F7 [F7] combat: fleeing zombie (dist 6.5, hp 7.5, 1 nearby, proximity)'
  ])
  // the first flight joins; the second has no NEW bar in its window
  // (the bar belongs to the flight it announced, not the story after it)
  assert.equal(r.joinedBars, 1)
  assert.equal(r.fleeStarts, 2)
  assert.deepEqual(r.prelude, { with: 1, without: 1 })
})

test('the RE anchors the emitter (the sibling-shape law)', () => {
  const m = 'F15 [F15] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it'.match(CRITICAL_BAR_RE)
  assert.equal(m[1], 'F15')
  // a different bot token in the bracket does not mirror - refused
  assert.equal('F15 [F16] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it'.match(CRITICAL_BAR_RE), null)
  // a different seen value is not this emitter's skin - refused
  assert.equal('F15 [F15] combat: critical bar (seen < 9) - the shelter scan is refused, the drain outruns it'.match(CRITICAL_BAR_RE), null)
  assert.equal(CRITICAL_HP, 8)
})

test('junk reads null (the smeltledger convention), the raw blob reads the array, the zero law holds', () => {
  assert.equal(criticalPrelude(null), null)
  assert.equal(criticalPrelude(undefined), null)
  assert.equal(criticalPrelude(42), null)
  assert.equal(criticalPrelude({ lines: [] }), null)
  const fromBlob = criticalPrelude(face42Mini.join('\n'))
  const fromArray = criticalPrelude(face42Mini)
  assert.equal(fromBlob.bars, fromArray.bars)
  assert.equal(fromBlob.joinedBars, fromArray.joinedBars)
  // the zero shape: no bars, no flights - every counter honest
  const z = criticalPrelude(['F1 [F1] mem: rss=251M'])
  assert.deepEqual(
    { bars: z.bars, fleeStarts: z.fleeStarts, prelude: z.prelude, criticalFlees: z.criticalFlees, gap: z.gap, rows: z.rows },
    { bars: 0, fleeStarts: 0, prelude: { with: 0, without: 0 }, criticalFlees: 0, gap: 0, rows: [] }
  )
})
