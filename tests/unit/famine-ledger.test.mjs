import { test } from 'node:test'
import assert from 'node:assert/strict'
import { famineCensus } from '../../src/lib/famineledger.mjs'

// Face 26's live shapes verbatim (run 37430980018, the v0.685.0 tree's
// first face) - the trip's own starvation anatomy, the bot id rides the
// line head (the trip voice's own skin, no [F#] tag on this family).
const face26Mini = [
  'F10 wood trip: famine (sticks 5 planks 2 logs 0) - gathering',
  'F8 wood trip: famine (sticks 0 planks 1 logs 0) - gathering',
  'F11 food trip: famine (hunger 17, plate 0) - the commons walk',
  'F16 food trip: famine (hunger 17, plate 0) - the commons walk',
  'F9 food trip: famine (hunger 17, plate 0) - the commons walk',
  'F8 wood trip: famine (sticks 3 planks 1 logs 0) - gathering',
  // non-famine trip prose must never join
  'F4 map trip skipped: sand,coal_ore unreachable',
  'F4 bank trip: planned budget 229s',
  'F8 climb out (wood trip): OK +8 levels (8 steps, 23 dug, 20s)'
]

test('famineCensus reads face 26 byte-exact: the log slot owns the wood drought, the plate owns the food famine', () => {
  const r = famineCensus(face26Mini)
  assert.equal(r.wood.n, 3)
  assert.deepEqual(r.wood.byBot, { F10: 1, F8: 2 })
  // the face-26 verdict: every wood famine sat on logs 0 - the gather
  // leg starved while the conversion stock (planks) held
  assert.deepEqual(r.wood.slots, { logsZero: 3, planksZero: 0, sticksZero: 1 })
  assert.equal(r.food.n, 3)
  assert.deepEqual(r.food.byBot, { F11: 1, F16: 1, F9: 1 })
  assert.equal(r.food.plateZero, 3)
  assert.deepEqual(r.food.hunger, { min: 17, median: 17, max: 17 })
})

test('famineCensus slot anatomy separates the legs: the conversion famine (logs alive) vs the gather famine', () => {
  // sticks 0 + planks 0 with logs 4: the conversion leg starved while
  // the gather leg held - the inverse of the face-26 shape
  const r = famineCensus([
    'F3 wood trip: famine (sticks 0 planks 0 logs 4) - gathering',
    'F5 wood trip: famine (sticks 2 planks 0 logs 1) - gathering'
  ])
  assert.deepEqual(r.wood.slots, { logsZero: 0, planksZero: 2, sticksZero: 1 })
  // the honest zero family: no food famine this face
  assert.equal(r.food.n, 0)
  assert.equal(r.food.hunger, null)
})

test('famineCensus honest zeros and the junk battery', () => {
  // a face with no famine lines reads the honest zero shape
  const r = famineCensus(['F1 [F1] combat: fighting zombie (dist 2.0, hp 20.0, 0 nearby, proximity)'])
  assert.deepEqual(r, {
    wood: { n: 0, byBot: {}, slots: { logsZero: 0, planksZero: 0, sticksZero: 0 }, repeats: { n: 0, byBot: {}, span: null } },
    food: { n: 0, byBot: {}, plateZero: 0, hunger: null, repeats: { n: 0, byBot: {}, span: null } }
  })
  // junk-safe: non-string-blob reads null (the smeltledger convention)
  assert.equal(famineCensus(42), null)
  assert.equal(famineCensus(null), null)
  // junk lines inside a live face are skipped, never invented
  const j = famineCensus(['wood trip: famine', 'F1 food trip: famine (hunger x, plate 0) - walk', 123])
  assert.equal(j.wood.n, 0)
  assert.equal(j.food.n, 0)
})

test('famineCensus repeats reads the 26th byte-exact: F8 famine-d twice, the walk between delivered nothing', () => {
  // face 26 verbatim: F8's two wood famines sat 1739 lines apart
  // (fleet19.log lines 294 -> 2033) - the gather walk's cure failed
  const lines = new Array(294).fill('F1 [F1] mem: ok')
  lines[293] = 'F8 wood trip: famine (sticks 0 planks 1 logs 0) - gathering'
  lines[2032] = 'F8 wood trip: famine (sticks 3 planks 1 logs 0) - gathering'
  const r = famineCensus(lines)
  assert.equal(r.wood.n, 2)
  assert.deepEqual(r.wood.repeats, { n: 1, byBot: { F8: 1 }, span: { min: 1739, median: 1739, max: 1739 } })
  // the food lane never repeated this face - the honest silence
  assert.deepEqual(r.food.repeats, { n: 0, byBot: {}, span: null })
})

test('famineCensus repeats family separation: food repeats price the commons walk, wood stays silent', () => {
  const r = famineCensus([
    'F9 food trip: famine (hunger 17, plate 0) - the commons walk',
    'F11 food trip: famine (hunger 14, plate 2) - the commons walk',
    'F9 food trip: famine (hunger 12, plate 0) - the commons walk',
    'F9 wood trip: famine (sticks 0 planks 0 logs 4) - gathering'
  ])
  assert.deepEqual(r.food.repeats, { n: 1, byBot: { F9: 1 }, span: { min: 2, median: 2, max: 2 } })
  assert.equal(r.wood.repeats.n, 0)
  assert.equal(r.wood.repeats.span, null)
})
