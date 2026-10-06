import { test } from 'node:test'
import assert from 'node:assert/strict'
import { woodClimbCost } from '../../src/lib/climbcost.mjs'

// Face 29's live shapes verbatim (run 37441962855) - the climb-out OK
// line rides INSIDE each famine→gathered window (the walk's real rent in
// the world's own units: +levels, steps, dug, SECONDS - not the log's
// line proxy). 3 trips: F3's walk cured (+25), F19's and F2's came home
// flat (+0) - the walk's cost lens' own face, now priced in seconds.
const face29 = () => {
  const lines = new Array(2387).fill('F1 [F1] mem: ok')
  lines[658] = 'F19 wood trip: famine (sticks 2 planks 2 logs 0) - gathering'
  lines[784] = 'F19 climb out (wood trip): OK +11 levels (11 steps, 32 dug, 25s)'
  lines[845] = 'F3 wood trip: famine (sticks 0 planks 3 logs 0) - gathering'
  lines[983] = 'F3 climb out (wood trip): OK +16 levels (16 steps, 33 dug, 39s)'
  lines[1143] = 'F19 wood trip: gathered (sticks 2 planks 2 logs 0)'
  lines[1542] = 'F3 wood trip: gathered (sticks 1 planks 21 logs 6)'
  lines[1868] = 'F2 wood trip: famine (sticks 2 planks 3 logs 0) - gathering'
  lines[1984] = 'F2 climb out (wood trip): OK +12 levels (12 steps, 35 dug, 27s)'
  lines[2386] = 'F2 wood trip: gathered (sticks 2 planks 3 logs 0)'
  return lines
}

test('woodClimbCost reads face 29 byte-exact: the flats climbed 25..27s, the cure paid 39s - the climb doesn\'t split the classes', () => {
  const r = woodClimbCost(face29())
  assert.equal(r.trips, 3)
  assert.equal(r.climbed, 3)
  assert.deepEqual(r.byClass.cured, {
    n: 1,
    levels: { min: 16, median: 16, max: 16 },
    steps: { min: 16, median: 16, max: 16 },
    dug: { min: 33, median: 33, max: 33 },
    seconds: { min: 39, median: 39, max: 39 },
    rate: { min: 2.4375, median: 2.4375, max: 2.4375 } // the stairs' tax: 39s / 16 lv
  })
  assert.deepEqual(r.byClass.flat, {
    n: 2,
    levels: { min: 11, median: 11.5, max: 12 },
    steps: { min: 11, median: 11.5, max: 12 },
    dug: { min: 32, median: 33.5, max: 35 },
    seconds: { min: 25, median: 26, max: 27 },
    rate: { min: 2.25, median: 2.2613636363636367, max: 2.272727272727273 } // 27s/12lv, 25s/11lv
  })
  assert.equal(r.byClass.negative, null)
  assert.equal(r.unread, 0)
  assert.equal(r.noClimb, 0)
  assert.equal(r.stray, 0)
  assert.equal(r.orphans, 0)
})

test('woodClimbCost anatomy split: the unread sentinel, the noClimb walk, the stray climb, the negative trip, the orphan', () => {
  const r = woodClimbCost([
    'F5 wood trip: famine (sticks 1 planks 1 logs 1) - gathering',
    'F5 climb out (wood trip): OK +9 levels (9 steps, 20 dug, 18s)',
    'F5 wood trip: gathered (sticks -1 planks -1 logs -1)', // the sentinel: the pair exists, the class doesn't
    'F7 wood trip: famine (sticks 0 planks 2 logs 0) - gathering',
    'F7 wood trip: gathered (sticks 4 planks 8 logs 6)', // cured, but no climb OK line inside: honest noClimb
    'F9 climb out (wood trip): OK +5 levels (5 steps, 12 dug, 11s)', // no pending famine: stray
    'F3 wood trip: famine (sticks 2 planks 3 logs 2) - gathering',
    'F3 climb out (wood trip): OK +7 levels (7 steps, 15 dug, 14s)',
    'F3 wood trip: gathered (sticks 1 planks 1 logs 1)', // before 7 -> after 3: negative, its climb files under negative
    'F12 wood trip: famine (sticks 0 planks 0 logs 0) - gathering' // never answered: the orphan
  ])
  assert.equal(r.trips, 3)
  assert.equal(r.climbed, 2)
  assert.equal(r.unread, 1)
  assert.equal(r.noClimb, 1)
  assert.equal(r.stray, 1)
  assert.equal(r.orphans, 1)
  assert.equal(r.byClass.cured, null)
  assert.deepEqual(r.byClass.negative, {
    n: 1,
    levels: { min: 7, median: 7, max: 7 },
    steps: { min: 7, median: 7, max: 7 },
    dug: { min: 15, median: 15, max: 15 },
    seconds: { min: 14, median: 14, max: 14 },
    rate: { min: 2, median: 2, max: 2 }
  })
})

test('woodClimbCost honest zeros, the second climb in one window, and the junk battery', () => {
  // the calm face: no trip bytes, the honest zero shape
  assert.deepEqual(woodClimbCost([]), {
    trips: 0, climbed: 0,
    byClass: { cured: null, flat: null, negative: null },
    unread: 0, noClimb: 0, stray: 0, orphans: 0
  })
  // a climb line with no pending famine is stray, never a cost; the trip's
  // window keeps its FIRST climb only (the 1:1 shape law) - a second one
  // inside the same window rides as data too (stray, honest)
  const two = woodClimbCost([
    'F2 wood trip: famine (sticks 2 planks 3 logs 0) - gathering',
    'F2 climb out (wood trip): OK +12 levels (12 steps, 35 dug, 27s)',
    'F2 climb out (wood trip): OK +13 levels (13 steps, 36 dug, 28s)',
    'F2 wood trip: gathered (sticks 2 planks 3 logs 0)'
  ])
  assert.equal(two.trips, 1)
  assert.equal(two.climbed, 1)
  assert.equal(two.stray, 1)
  assert.equal(two.noClimb, 0)
  assert.deepEqual(two.byClass.flat.seconds, { min: 27, median: 27, max: 27 })
  assert.deepEqual(two.byClass.flat.rate, { min: 2.25, median: 2.25, max: 2.25 }) // 27s / 12 lv
  // junk-safe: non-input reads null (the smeltledger convention)
  assert.equal(woodClimbCost(42), null)
  assert.equal(woodClimbCost(null), null)
  assert.equal(woodClimbCost(undefined), null)
  // junk lines inside a live face are skipped, never invented
  const j = woodClimbCost(['climb out (wood trip): OK +1 levels', 123, 'F1 climb out (wood trip): failed - timeout'])
  assert.equal(j.trips, 0)
  assert.equal(j.climbed, 0)
  assert.equal(j.stray, 0) // the fail skin is the refusal's why lens' territory, not a climb OK
})
