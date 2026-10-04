// THE WRITE-OFF'S WHY MASS - tests. (v0.583.0) The write-off family's second
// seat: the per-bot write-off row names each holder's why; this row sums the
// FLEET's stranded units per class. The live anchor pins fleet 37161734898's
// own shape (F5 303u timeout, F14 92u low-o2, F18 92u unreachable, F1 91u
// timeout - timeout owns the strand 394u of 578u). One grain law with the
// family (WRITE_OFF_MIN_UNITS = 64), the census's half boundary (0.5), the
// census's tie law, the bands' own blind law for the unnamed bucket.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  writeOffWhyRow,
  WRITE_OFF_MIN_UNITS, WRITE_OFF_WHY_SHARE, WRITE_OFF_WHY_LEVERS,
  climbWhyClass, whyBookToken, // (v0.586.0) the chest-scan class rides the feed's own wash
} from '../../src/lib/pocketline.mjs'

// the fleet 37161734898 face's own write-off shape: four holders, two classes
// plus two - timeout 394u of 578u (68.2%)
const faceMiners = [
  { username: 'F5', bot: { inventory: { items: () => [{ count: 299 }, { count: 4 }] } } },
  { username: 'F14', bot: { inventory: { items: () => [{ count: 92 }] } } },
  { username: 'F18', bot: { inventory: { items: () => [{ count: 92 }] } } },
  { username: 'F1', bot: { inventory: { items: () => [{ count: 91 }] } } },
]
const faceWhys = new Map([['F5', 'timeout'], ['F14', 'low-o2'], ['F18', 'unreachable'], ['F1', 'timeout']])

test('the constants: one grain law with the family', () => {
  assert.equal(WRITE_OFF_MIN_UNITS, 64, 'the family\'s own 64u grain')
  assert.equal(WRITE_OFF_WHY_SHARE, 0.5, 'the census\'s half boundary')
  assert.equal(WRITE_OFF_WHY_LEVERS.timeout, 'the deadline\'s own clock is the front', 'the lever table rides')
})

test('the live anchor: the 37161734898 face reads timeout owns the strand', () => {
  assert.equal(
    writeOffWhyRow(faceMiners, { whys: faceWhys }),
    'write-off whys: timeout carries 394u of 578u (68.2%) - the deadline\'s own clock is the front',
  )
})

test('the chest-scan class: the 37163977552 face named - F14 stood with 261u and no chest answered', () => {
  // the face's own shape: F14's strand read 'unnamed carries 261u of 261u
  // (100.0%)' because climbWhyClass dropped 'no chest in range' to 'other'
  // and whyBookToken never let it ride. The taxonomy grew: the same strand
  // now names its lever - the yard's chest reach is the front.
  const miners = [{ username: 'F14', bot: { inventory: { items: () => [...Array(19).fill({ count: 13 }), { count: 14 }] } } }] // 261u over 20 slots - the face's own shape
  const row = writeOffWhyRow(miners, { whys: new Map([['F14', 'no-chest']]) })
  assert.equal(
    row,
    'write-off whys: no-chest carries 261u of 261u (100.0%) - the yard' + String.fromCharCode(39) + 's chest reach is the front',
  )
  // the feed law: the chain feed's token rides whyBookToken's own wash
  assert.equal(whyBookToken(climbWhyClass('no chest in range')), 'no-chest', 'the chain feed now names the strand - the blind form had no class to ride')
})

test('each class names its own lever', () => {
  // both holders over the family's 64u floor so the merge is real
  const mk = holders => writeOffWhyRow(
    holders.map(([name, count]) => ({ username: name, bot: { inventory: { items: () => [{ count }] } } })),
    { whys: new Map(holders.map(([name, , w]) => [name, w])) },
  )
  const night = mk([['F1', 100, 'night'], ['F2', 70, 'night']])
  assert.equal(night, 'write-off whys: night carries 170u of 170u (100.0%) - the dark holds the walks - the dusk bank is the front')
  const lowo2 = mk([['F1', 100, 'low-o2'], ['F2', 70, 'low-o2']])
  assert.match(lowo2, /the water's own clock is the front$/)
  const doom = mk([['F1', 100, 'doom-latched'], ['F2', 70, 'doom-latched']])
  assert.match(doom, /the doom latch is the front$/)
  const sentinel = mk([['F1', 100, 'wet-sentinel'], ['F2', 70, 'wet-sentinel']])
  assert.match(sentinel, /the o2 sentinel is the front$/)
  const alien = mk([['F1', 100, 'moonslide'], ['F2', 70, 'moonslide']])
  assert.match(alien, /the class's own detail is the front$/, 'an unknown clean token reads the why split\'s own fallback')
})

test('the 0.5 boundary trips at >= (the census\'s own shape)', () => {
  // a 64-by-64 tie reads night first (the tie law: units desc, why asc - the
  // fire-0430 lesson's third ride: the alphabetical tie owns the lead)
  const at = writeOffWhyRow(
    [{ username: 'F1', bot: { inventory: { items: () => [{ count: 64 }] } } }, { username: 'F2', bot: { inventory: { items: () => [{ count: 64 }] } } }],
    { whys: new Map([['F1', 'timeout'], ['F2', 'night']]) },
  )
  assert.match(at, /^write-off whys: night carries 64u of 128u \(50\.0%\)/, 'exactly the half boundary trips')
  const under = writeOffWhyRow(
    [
      { username: 'F1', bot: { inventory: { items: () => [{ count: 70 }] } } },
      { username: 'F2', bot: { inventory: { items: () => [{ count: 66 }] } } },
      { username: 'F3', bot: { inventory: { items: () => [{ count: 64 }] } } },
    ],
    { whys: new Map([['F1', 'timeout'], ['F2', 'night'], ['F3', 'low-o2']]) },
  )
  assert.equal(under, null, '70 of 200 (35.0%) reads quiet - a spread names no front')
})

test('the floor: the family\'s own 64u grain binds both the total and the leader', () => {
  assert.equal(writeOffWhyRow(
    [{ username: 'F1', bot: { inventory: { items: () => [{ count: 60 }] } } }],
    { whys: new Map([['F1', 'timeout']]) },
  ), null, 'a total under the grain is quiet')
  assert.equal(writeOffWhyRow(
    [{ username: 'F1', bot: { inventory: { items: () => [{ count: 40 }] } } }, { username: 'F2', bot: { inventory: { items: () => [{ count: 30 }] } } }],
    { whys: new Map([['F1', 'timeout'], ['F2', 'timeout']]) },
  ), null, 'a leader under the grain is quiet even at 100%')
  assert.match(writeOffWhyRow(
    [{ username: 'F1', bot: { inventory: { items: () => [{ count: 64 }] } } }],
    { whys: new Map([['F1', 'night']]) },
  ), /night carries 64u of 64u \(100\.0%\)/, 'exactly the grain speaks')
})

test('the blind form: the unnamed bucket can lead and the row names the blindness', () => {
  const row = writeOffWhyRow(
    [{ username: 'F1', bot: { inventory: { items: () => [{ count: 100 }] } } }, { username: 'F2', bot: { inventory: { items: () => [{ count: 70 }] } } }, { username: 'F3', bot: { inventory: { items: () => [{ count: 64 }] } } }],
    { whys: new Map([['F3', 'night']]) },
  )
  assert.equal(
    row,
    'write-off whys: unnamed carries 170u of 234u (72.6%) - the whys stayed blind: the ledger names no class',
    'holders without a why read their honest unnamed bucket, never dropped',
  )
})

test('the merge law: multiple holders of one class merge into one read', () => {
  const row = writeOffWhyRow(
    [{ username: 'F1', bot: { inventory: { items: () => [{ count: 100 }] } } }, { username: 'F2', bot: { inventory: { items: () => [{ count: 70 }] } } }, { username: 'F3', bot: { inventory: { items: () => [{ count: 64 }] } } }],
    { whys: new Map([['F1', 'timeout'], ['F2', 'timeout'], ['F3', 'night']]) },
  )
  assert.equal(
    row,
    'write-off whys: timeout carries 170u of 234u (72.6%) - the deadline\'s own clock is the front',
  )
})

test('the tie law: units desc, why asc', () => {
  const row = writeOffWhyRow(
    [{ username: 'F1', bot: { inventory: { items: () => [{ count: 80 }] } } }, { username: 'F2', bot: { inventory: { items: () => [{ count: 80 }] } } }],
    { whys: new Map([['F1', 'timeout'], ['F2', 'night']]) },
  )
  assert.match(row, /^write-off whys: night carries 80u of 160u/, 'the alphabetical tie reads night first')
})

test('the junk battery: torn views, impossible counts and under-floor pockets never enter', () => {
  assert.equal(writeOffWhyRow(null, { whys: faceWhys }), null, 'null feed is quiet')
  assert.equal(writeOffWhyRow('not an array', { whys: faceWhys }), null, 'a lookalike feed is quiet')
  const junk = writeOffWhyRow(
    [
      { username: 'F1', bot: { inventory: { items: () => [{ count: NaN }, { count: -5 }, { count: 100 }] } } },
      { username: 'F2', bot: { inventory: { items: () => 'torn' } } },
      { username: 'F3' },
      { username: 'F4', bot: { inventory: { items: () => [{ count: 10 }] } } },
      { username: 'F5', bot: { inventory: { items: () => [{ count: 70 }] } } },
    ],
    { whys: new Map([['F1', 'timeout'], ['F5', 'DOOM LATCHED !!']]) },
  )
  assert.match(junk, /^write-off whys: timeout carries 100u of 170u \(58\.8%\)/, 'junk counts zeroed, torn views skipped, dirty tokens read unnamed, real holders still count')
  assert.equal(writeOffWhyRow(faceMiners, { whys: null }), 'write-off whys: unnamed carries 578u of 578u (100.0%) - the whys stayed blind: the ledger names no class', 'a missing why book reads the blind form, the mass still counted')
})

test('the wiring pin: the feed, the leanness and the print ride fleet19', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /const writeOffWhy = writeOffWhyRow\(list, \{ whys: finalBankWhys \}\)/, 'the row rides the write-off row\'s own feed (ONE book)')
  assert.match(src, /if \(writeOffWhy\) console\.log\(writeOffWhy\)/, 'the print follows the leanness law')
})
