import { test } from 'node:test'
import assert from 'node:assert/strict'
import { famineCensus, famineLaneSeat, famineLaneSeatRow, famineLaneRiders, famineLaneRidersRow } from '../../src/lib/famineledger.mjs'

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
  // leg starved while the conversion stock (planks) held. The head-
  // unanimous face reads down: [] - the honest silence (v0.699.0).
  assert.deepEqual(r.wood.slots, { logsZero: 3, planksZero: 0, sticksZero: 1, down: [] })
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
  assert.deepEqual(r.wood.slots, {
    logsZero: 0, planksZero: 2, sticksZero: 1,
    down: [ // v0.699.0: BOTH famines held logs - the starve sat below the head
      { bot: 'F3', sticks: 0, planks: 0, logs: 4 },
      { bot: 'F5', sticks: 2, planks: 0, logs: 1 }
    ]
  })
  // the honest zero family: no food famine this face
  assert.equal(r.food.n, 0)
  assert.equal(r.food.hunger, null)
})

test('famineCensus honest zeros and the junk battery', () => {
  // a face with no famine lines reads the honest zero shape
  const r = famineCensus(['F1 [F1] combat: fighting zombie (dist 2.0, hp 20.0, 0 nearby, proximity)'])
  assert.deepEqual(r, {
    wood: { n: 0, byBot: {}, slots: { logsZero: 0, planksZero: 0, sticksZero: 0, down: [] }, repeats: { n: 0, byBot: {}, span: null } },
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

test('famineCensus downstream seat names the unanimity break (v0.699.0): the face-31 shape - 4 of 5 sat at the head, ONE held logs', () => {
  // the face-31 read's own shape (logs 4/5, NOT unanimous - which famine
  // sat downstream?): four famines starved at the head, F14's held logs 2
  // - the walk brought wood home, the conversion leg starved. A repeat
  // famine (F6 again) files BOTH books: the seat map and the repeats.
  const lines = new Array(40).fill('F1 [F1] mem: ok')
  lines[2] = 'F5 wood trip: famine (sticks 0 planks 0 logs 0) - gathering'
  lines[7] = 'F4 wood trip: famine (sticks 1 planks 2 logs 0) - gathering'
  lines[11] = 'F3 wood trip: famine (sticks 0 planks 0 logs 0) - gathering'
  lines[19] = 'F14 wood trip: famine (sticks 1 planks 3 logs 2) - gathering'
  lines[27] = 'F6 wood trip: famine (sticks 0 planks 1 logs 0) - gathering'
  lines[33] = 'F6 wood trip: famine (sticks 0 planks 0 logs 0) - gathering'
  const r = famineCensus(lines)
  assert.equal(r.wood.n, 6)
  assert.deepEqual(r.wood.slots, {
    logsZero: 5, planksZero: 3, sticksZero: 4,
    down: [{ bot: 'F14', sticks: 1, planks: 3, logs: 2 }] // the seat, named in face order
  })
  assert.deepEqual(r.wood.repeats, { n: 1, byBot: { F6: 1 }, span: { min: 6, median: 6, max: 6 } })
})

// (v0.813.0) THE FAMINE'S OWN LANE - the face-92 verbatim through the real
// census: wood 3 + food 8, the food lane's own carry drought owns the book
// (the plate read 8/8 rode the same face).
test('famineLaneSeat reads face 92 byte-exact: food owns 8 of 11 famines, the carry drought\'s own seat', () => {
  const lines = [
    'F12 wood trip: famine (sticks 0 planks 2 logs 0) - gathering',
    'F5 wood trip: famine (sticks 1 planks 0 logs 0) - gathering',
    'F18 wood trip: famine (sticks 0 planks 1 logs 0) - gathering',
    'F9 food trip: famine (hunger 17, plate 0) - the commons walk',
    'F16 food trip: famine (hunger 15, plate 0) - the commons walk',
    'F12 food trip: famine (hunger 17, plate 0) - the commons walk',
    'F2 food trip: famine (hunger 17, plate 0) - the commons walk',
    'F5 food trip: famine (hunger 17, plate 0) - the commons walk',
    'F17 food trip: famine (hunger 17, plate 0) - the commons walk',
    'F9 food trip: famine (hunger 16, plate 0) - the commons walk',
    'F16 food trip: famine (hunger 17, plate 0) - the commons walk'
  ]
  const fc = famineCensus(lines)
  assert.equal(fc.wood.n, 3)
  assert.equal(fc.food.n, 8)
  const seat = famineLaneSeat(fc)
  assert.deepEqual(seat, { lane: 'food', owns: 8, ofFamines: 11, shareOfFamines: 8 / 11 * 100 })
  assert.equal(
    famineLaneSeatRow(seat),
    "the famine's own lane (v0.813.0): food owns 8 of 11 famines (72.7%) - THE FAMINE'S OWN SEAT: one lane's own starves own the book - the lane's own front prices the trip the raw split rode unnamed"
  )
  // the riders are measure-not-owner (the climb shape): the pair reads
  // even on the seat's face - the BRANCH law (one row never both) lives
  // at the print site (decompose prints the seat XOR the riders,
  // byte-verified live on the nine held faces)
  const riders = famineLaneRiders(fc)
  assert.equal(riders.duet, 'food x8 + wood x3')
  assert.equal(riders.pairOwns, 11)
})

test('famineLaneRiders reads the even split byte-exact: the face-87 shape - food x5 + wood x5 own the whole book, the tie owns nothing', () => {
  const fc = famineCensus([
    'F12 wood trip: famine (sticks 0 planks 1 logs 0) - gathering',
    'F16 wood trip: famine (sticks 0 planks 1 logs 0) - gathering',
    'F2 wood trip: famine (sticks 0 planks 1 logs 0) - gathering',
    'F1 wood trip: famine (sticks 0 planks 1 logs 0) - gathering',
    'F7 wood trip: famine (sticks 0 planks 1 logs 0) - gathering',
    'F1 food trip: famine (hunger 17, plate 0) - the commons walk',
    'F1 food trip: famine (hunger 17, plate 0) - the commons walk',
    'F11 food trip: famine (hunger 17, plate 0) - the commons walk',
    'F12 food trip: famine (hunger 17, plate 0) - the commons walk',
    'F18 food trip: famine (hunger 17, plate 0) - the commons walk'
  ])
  assert.equal(famineLaneSeat(fc), null) // the tie law: a tie owns nothing
  const r = famineLaneRiders(fc)
  assert.deepEqual(r, { leader: 'food', leaderOwns: 5, runner: 'wood', runnerOwns: 5, ofFamines: 10, pairOwns: 10, shareOfFamines: 100, duet: 'food x5 + wood x5' })
  assert.equal(
    famineLaneRidersRow(r),
    "the famine's own riders (v0.813.0): no solo lane owns the majority - food x5 + wood x5 own 10 of 10 famines (100.0%) - THE FAMINE'S OWN TIE: the seat's tie law held, the lanes' own crowd prices the starvation the solo law refused to name"
  )
})

test('famineLaneSeat lone-lane arms: the face-84 food sweep and the singular famine - the lane alone IS the owner', () => {
  // the face-84 shape: the wood lane silent, the food lane owns its own book
  const f84 = famineCensus([
    'F3 food trip: famine (hunger 17, plate 0) - the commons walk',
    'F12 food trip: famine (hunger 17, plate 0) - the commons walk'
  ])
  const s84 = famineLaneSeat(f84)
  assert.equal(
    famineLaneSeatRow(s84),
    "the famine's own lane (v0.813.0): food owns 2 of 2 famines (100.0%) - THE FAMINE'S OWN SEAT: one lane's own starves own the book - the lane's own front prices the trip the raw split rode unnamed"
  )
  assert.equal(famineLaneRiders(f84), null) // a lone lane is no crowd
  // the singular arm: 1 of 1 reads the singular noun
  const one = famineLaneSeat({ wood: { n: 0 }, food: { n: 1 } })
  assert.equal(
    famineLaneSeatRow(one),
    "the famine's own lane (v0.813.0): food owns 1 of 1 famine (100.0%) - THE FAMINE'S OWN SEAT: one lane's own starves own the book - the lane's own front prices the trip the raw split rode unnamed"
  )
  // the wood-led majority: the gather drought's own seat (the face-82 shape)
  const f82 = famineLaneSeat({ wood: { n: 3 }, food: { n: 2 } })
  assert.equal(f82.lane, 'wood')
  assert.equal(f82.owns, 3)
  assert.equal(f82.shareOfFamines, 60)
})

test('famineLane junk battery and the row guards: the honest silence end to end', () => {
  // the zero book reads the honest silence
  const zero = { wood: { n: 0 }, food: { n: 0 } }
  assert.equal(famineLaneSeat(zero), null)
  assert.equal(famineLaneRiders(zero), null)
  // the junk census never invents a lane
  assert.equal(famineLaneSeat(null), null)
  assert.equal(famineLaneSeat(42), null)
  assert.equal(famineLaneRiders('x'), null)
  assert.equal(famineLaneSeat({ wood: { n: 'x' }, food: { n: -2 } }), null)
  assert.equal(famineLaneSeat({}), null)
  // the row guards: junk in, null out
  assert.equal(famineLaneSeatRow(null), null)
  assert.equal(famineLaneSeatRow('x'), null)
  assert.equal(famineLaneSeatRow({ lane: 'stone', owns: 1, ofFamines: 1, shareOfFamines: 100 }), null)
  assert.equal(famineLaneSeatRow({ lane: 'food', owns: 0, ofFamines: 1, shareOfFamines: 0 }), null)
  assert.equal(famineLaneSeatRow({ lane: 'food', owns: 2, ofFamines: 1, shareOfFamines: 200 }), null)
  assert.equal(famineLaneRidersRow(null), null)
  assert.equal(famineLaneRidersRow({ leader: 'food', leaderOwns: 1, runner: 'food', runnerOwns: 1, ofFamines: 2, pairOwns: 2, shareOfFamines: 100, duet: 'food x1 + food x1' }), null)
  assert.equal(famineLaneRidersRow({ leader: 'food', leaderOwns: 1, runner: 'wood', runnerOwns: 1, ofFamines: 2, pairOwns: 3, shareOfFamines: 150, duet: 'food x1 + wood x2' }), null)
  // the byte order: the ranked tie rides 'food' < 'wood'
  const tie = famineLaneRiders({ wood: { n: 4 }, food: { n: 4 } })
  assert.equal(tie.leader, 'food')
  assert.equal(tie.runner, 'wood')
})
