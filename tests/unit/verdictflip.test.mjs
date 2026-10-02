import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verdictExecution, VERDICT_FLIP_RE } from '../../src/lib/verdictflip.mjs'

// Face 43's live shapes verbatim (run 36970605824) - the four flips and
// their own boundary lines (hand-traced: the machinery prose between the
// flip and its terminus is included where it rode the episode).
const face43Mini = [
  // F17's flip - the machinery prose follows, the flee closes it
  'F17 [F17] combat: verdict flipped to flee vs spider (hp 8.3)',
  'F17 [F17] combat: shelter try vs spider (dist 1.2, sentry re-verdict)',
  'F17 [F17] combat: shelter wall miss (open field: no diggable wall, ring next, spider@1.2)',
  // F19's flip - closed by the fight lane (the verdict reversed, the bot won)
  'F19 [F19] combat: verdict flipped to flee vs spider (hp 18.7)',
  'F19 [F19] combat: pair preempt (flip) vs spider (hp 18.7, 2 in reach) - the pair trade is never taken',
  'F19 [F19] combat: fight ended vs spider (mob down, hp 18.0 -> 17.0, swings 4, weapon wooden_sword, 4 rounds)',
  // F11's flip - the shelter lane took over (THE SHIELD TAKEOVER)
  'F11 [F11] combat: verdict flipped to flee vs creeper (hp 20.0)',
  'F11 [F11] combat: sheltering from creeper (ring 8/8, proximity re-verdict)',
  // F5's flip - the open-field yield rides the episode (prose, never closes);
  // the flee closes it with a DIFFERENT threat and a drained hp
  'F5 [F5] combat: verdict flipped to flee vs spider (hp 11.0)',
  'F5 [F5] combat: open-field yield vs spider (hp 11.0 < 14 in the dark) - the flee fired before the drain',
  'F17 [F17] combat: fleeing spider (dist 4.0, hp 8.3, 2 nearby, proximity)',
  'F5 [F5] combat: fleeing zombie_villager (dist 4.8, hp 2.0, 1 nearby, proximity)',
  // F5's death AFTER its episode closed - must not steal a join
  'F5 [F5] died - respawning (cause: server: was slain by Zombie Villager [kind=mob by Zombie] | inferred: zombie_villager@0.7 (0s before death at [-152,65,407]) [the inference CONTRADICTS the server verdict])'
]

test('verdictExecution reads face 43 verbatim: 4 flips - fled 2, stood 1, sheltered 1', () => {
  const r = verdictExecution(face43Mini)
  assert.equal(r.flips, 4)
  assert.equal(r.fled, 2)
  assert.equal(r.stood, 1)
  assert.equal(r.sheltered, 1)
  assert.equal(r.died, 0)
  assert.equal(r.open, 0)
  // the book law: every flip closes exactly once
  assert.equal(r.fled + r.stood + r.sheltered + r.died + r.open, r.flips)
})

test('the execution gap: F17 executed at the flip hp, F5 changed threat and lost 9 hp between decision and flight', () => {
  const r = verdictExecution(face43Mini)
  const f17 = r.rows.find(x => x.bot === 'F17')
  assert.equal(f17.verdict, 'fled')
  assert.equal(f17.executedMob, 'spider')
  assert.equal(f17.executedHp, 8.3) // the same hp it flipped at - the instant execution
  const f5 = r.rows.find(x => x.bot === 'F5')
  assert.equal(f5.verdict, 'fled')
  assert.equal(f5.executedMob, 'zombie_villager') // the threat changed
  assert.equal(f5.executedHp, 2.0) // 11.0 -> 2.0: the drain outran the decision
  const f19 = r.rows.find(x => x.bot === 'F19')
  assert.equal(f19.verdict, 'stood')
  const f11 = r.rows.find(x => x.bot === 'F11')
  assert.equal(f11.verdict, 'sheltered')
  // F5's later death stole nothing - the episode was already closed
  assert.equal(r.died, 0)
})

// Face 42's live shapes (run 36967273918) - the died leg: F17 flipped at
// hp 7.2, ran the flee ladder (machinery prose, never closes), died anyway;
// F6's flip rides the face's tail (the honest open)
const face42Mini = [
  'F17 [F17] combat: verdict flipped to flee vs zombie (hp 7.2)',
  'F17 [F17] combat: critical bar (seen < 8) - the shelter scan is refused, the drain outruns it',
  'F17 [F17] combat: flee ladder 0deg -> 270deg (the threat reads the away rotation) vs zombie (proximity re-verdict)',
  'F17 [F17] died - respawning (cause: server: was slain by Zombie [kind=mob by Zombie] | inferred: zombie@0.5 (0s before death at [-140,64,406]) [the server kind stays the authority])',
  'F11 [F11] combat: verdict flipped to flee vs drowned (hp 11.0)',
  'F11 [F11] combat: sheltering from drowned (arrow wall, cells 2/8, proximity)',
  'F5 [F5] combat: verdict flipped to flee vs zombie (hp 20.0)',
  'F5 [F5] combat: sheltering from zombie (ring 8/8, proximity re-verdict)',
  'F6 [F6] combat: verdict flipped to flee vs zombie (hp 12.3)'
]

test("verdictExecution reads face 42 verbatim: the ladder ran and died anyway, F6's tail open", () => {
  const r = verdictExecution(face42Mini)
  assert.equal(r.flips, 4)
  assert.equal(r.fled, 0)
  assert.equal(r.stood, 0)
  assert.equal(r.sheltered, 2)
  assert.equal(r.died, 1)
  assert.equal(r.open, 1)
  // the ladder is prose - the death closes the episode honestly
  const f17 = r.rows.find(x => x.bot === 'F17')
  assert.equal(f17.verdict, 'died')
  assert.equal(f17.flipHp, 7.2)
  const f6 = r.rows.find(x => x.bot === 'F6')
  assert.equal(f6.verdict, 'open')
  assert.equal(f6.closerIdx, null)
})

test('a second flip overwrites the first (the fresh verdict wins, the stale one opens honestly)', () => {
  const r = verdictExecution([
    'F7 [F7] combat: verdict flipped to flee vs zombie (hp 15.0)',
    'F7 [F7] combat: verdict flipped to flee vs spider (hp 9.0)',
    'F7 [F7] combat: fleeing spider (dist 5.0, hp 9.0, 1 nearby, proximity)'
  ])
  assert.equal(r.flips, 2)
  assert.equal(r.fled, 1)
  assert.equal(r.open, 1)
  assert.deepEqual(r.rows.map(x => x.verdict).sort(), ['fled', 'open'])
})

test('the RE anchors the emitter (the sibling-shape law)', () => {
  const m = 'F17 [F17] combat: verdict flipped to flee vs spider (hp 8.3)'.match(VERDICT_FLIP_RE)
  assert.equal(m[1], 'F17')
  assert.equal(m[2], 'spider')
  assert.equal(m[3], '8.3')
  // a non-mirroring bot token is refused
  assert.equal('F17 [F16] combat: verdict flipped to flee vs spider (hp 8.3)'.match(VERDICT_FLIP_RE), null)
  // a flip to a different side is not this emitter's skin
  assert.equal('F17 [F17] combat: verdict flipped to fight vs spider (hp 8.3)'.match(VERDICT_FLIP_RE), null)
})

test('junk reads null (the smeltledger convention), the blob reads the array, the zero law holds', () => {
  assert.equal(verdictExecution(null), null)
  assert.equal(verdictExecution(undefined), null)
  assert.equal(verdictExecution(42), null)
  assert.equal(verdictExecution({ lines: [] }), null)
  const fromBlob = verdictExecution(face42Mini.join('\n'))
  const fromArray = verdictExecution(face42Mini)
  assert.equal(fromBlob.flips, fromArray.flips)
  assert.equal(fromBlob.died, fromArray.died)
  const z = verdictExecution(['F1 [F1] mem: rss=251M'])
  assert.deepEqual(
    { flips: z.flips, fled: z.fled, stood: z.stood, sheltered: z.sheltered, died: z.died, open: z.open, hp: z.hp, rows: z.rows },
    { flips: 0, fled: 0, stood: 0, sheltered: 0, died: 0, open: 0, hp: null, rows: [] }
  )
})
