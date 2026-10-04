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
  climbWhyClass, whyBookToken, stallWhyClass, // (v0.589.0) the stall's stage rides the ladder's own leg
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

// ---------------------------------------------------------------------------
// (v0.589.0) THE STALL'S STAGE - the ladder's own leg joins the book. Fleet
// 37169265512's read named the front but not the seat: 'stalled carries 1049u
// of 1291u (81.3%)' while the climb results carried the escalation state
// (cr.stage) and the book dropped it between the result and the set. The legs
// name their labels: s0 the climb's first wall (the ordinary budgets on the
// caller's own bearing), s1 the 90-degree escalated leg, s2 the 180-degree
// leg, ex the ladder's own exhaustion.
// ---------------------------------------------------------------------------

test('stallWhyClass: the ladder legs name themselves', () => {
  assert.equal(stallWhyClass('stalled', 0), 'stalled-s0', 'the ordinary-budget leg - stage 0 is a REAL leg, never the unknown net')
  assert.equal(stallWhyClass('stalled', 1), 'stalled-s1', 'the 90-degree escalated leg')
  assert.equal(stallWhyClass('stalled', 2), 'stalled-s2', 'the 180-degree escalated leg')
})

test('stallWhyClass: the honest net - an unknown stage never invents a leg', () => {
  assert.equal(stallWhyClass('stalled', undefined), 'stalled', 'the legacy token rides when the stage is absent')
  assert.equal(stallWhyClass('stalled', null), 'stalled', 'a null stage never invents')
  assert.equal(stallWhyClass('stalled', NaN), 'stalled', 'a NaN stage never invents')
  assert.equal(stallWhyClass('stalled', -1), 'stalled', 'a negative stage is junk - the legacy token')
  assert.equal(stallWhyClass('stalled', 'abc'), 'stalled', 'a non-numeric stage never invents')
  assert.equal(stallWhyClass('stalled', 1.7), 'stalled-s1', 'a fractional stage floors - junk to floor, not junk to drop')
})

test('stallWhyClass: the exhaustion form names the ladder own top', () => {
  assert.equal(stallWhyClass('stalled', 3), 'stalled-ex', 'the exhausted ladder (climbEntry refuses at 3 today - the honest net)')
  assert.equal(stallWhyClass('stalled', 9), 'stalled-ex', 'any stage at or past the ladder top reads the exhaustion form')
})

test('stallWhyClass: only the stall family reshapes - the class grain keeps its comparability', () => {
  assert.equal(stallWhyClass('timeout', 2), 'timeout', 'the second class keeps its grain')
  assert.equal(stallWhyClass('wet wall', 0), 'wet wall', 'the wet family keeps its grain')
  assert.equal(stallWhyClass('no-chest', 1), 'no-chest', 'the scan refusal keeps its grain')
  assert.equal(stallWhyClass(null, 1), null, 'a junk class rides through untouched - the reshaper never invents classes')
  assert.equal(climbWhyClass('stalled'), 'stalled', 'the census vocabulary rides climbWhyClass unchanged - the comparability law')
})

test('the stage tokens ride the why book law untouched', () => {
  assert.equal(whyBookToken('stalled-s0'), 'stalled-s0', 'the book law (/^[a-z0-9-]+$/) passes the leg tokens')
  assert.equal(whyBookToken(stallWhyClass(climbWhyClass('stalled'), 1)), 'stalled-s1', 'the full feed wash rides: reason -> class -> stage -> token')
})

test('the stage levers: the table names each leg own front', () => {
  assert.equal(WRITE_OFF_WHY_LEVERS['stalled-s0'], 'the climb' + String.fromCharCode(39) + 's first wall is the front')
  assert.equal(WRITE_OFF_WHY_LEVERS['stalled-s1'], 'the escalated ladder is the front')
  assert.equal(WRITE_OFF_WHY_LEVERS['stalled-s2'], 'the rotated bearing is the front')
  assert.equal(WRITE_OFF_WHY_LEVERS['stalled-ex'], 'the ladder' + String.fromCharCode(39) + 's own exhaustion is the front')
  assert.equal(WRITE_OFF_WHY_LEVERS.stalled, 'the climb' + String.fromCharCode(39) + 's own stall is the front', 'the legacy lever stays - the honest net reads it')
})

test('the live anchor staged: the 37169265512 face mass rides the legs now', () => {
  // the face's own mass (stalled 1049u of 1291u) split by the ladder's legs:
  // s0 = F8 359u + F5 178u + F3 141u = 678u, s1 = F7 193u + F4 178u = 371u,
  // plus F6 242u unnamed - s0 owns 678/1291 (52.5%) and names its lever
  const miners = [
    { username: 'F8', bot: { inventory: { items: () => [{ count: 359 }] } } },
    { username: 'F6', bot: { inventory: { items: () => [{ count: 242 }] } } },
    { username: 'F7', bot: { inventory: { items: () => [{ count: 193 }] } } },
    { username: 'F4', bot: { inventory: { items: () => [{ count: 178 }] } } },
    { username: 'F5', bot: { inventory: { items: () => [{ count: 178 }] } } },
    { username: 'F3', bot: { inventory: { items: () => [{ count: 141 }] } } },
  ]
  const whys = new Map([['F8', 'stalled-s0'], ['F7', 'stalled-s1'], ['F4', 'stalled-s1'], ['F5', 'stalled-s0'], ['F3', 'stalled-s0']])
  assert.equal(
    writeOffWhyRow(miners, { whys }),
    'write-off whys: stalled-s0 carries 678u of 1291u (52.5%) - the climb' + String.fromCharCode(39) + 's first wall is the front',
    'the ladder seat owns the read - the cure aims the leg, not the family',
  )
  // the split names no front: a three-way leg spread reads quiet (the family's
  // own leanness law - the per-bot row one rung up is the face's read then)
  const spread = new Map([['F8', 'stalled-s0'], ['F7', 'stalled-s1'], ['F4', 'stalled-s2'], ['F5', 'stalled-s0'], ['F3', 'stalled-s1']])
  assert.equal(writeOffWhyRow(miners, { whys: spread }), null, 'a leg spread names no front - the honest silence')
})

test('the wiring pin: the feed, the leanness and the print ride fleet19', () => {
  const src = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /const writeOffWhy = writeOffWhyRow\(list, \{ whys: finalBankWhys \}\)/, 'the row rides the write-off row\'s own feed (ONE book)')
  assert.match(src, /if \(writeOffWhy\) console\.log\(writeOffWhy\)/, 'the print follows the leanness law')
  assert.match(src, /whyBookToken\(stallWhyClass\(whyCls, cr\.stage\)\)/, 'the climb-doom feed rides the stage reshape - the legs name their labels (v0.589.0)')
  assert.match(src, /doomCensusRow, climbWhyClass, doomWhyRow, doomOwnerRow, whyBookToken, stallWhyClass, reconnectCensusRow/, 'the import carries the reshaper')
})
