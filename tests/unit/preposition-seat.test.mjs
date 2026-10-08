// The pre-position seat law pins (v0.809.0).
//
// THE PRE-POSITION'S OWN WHY - the walk-home book's own seat. The census
// row (v0.645.0) printed armed/landed/failed raw and the emitter named the
// argmax top why (v0.648.0), but no row ever said WHETHER that top class
// owns the failed walk-homes. The strict-majority law (the v0.807.0
// zero-why seat's own shape, the v0.784.0 tie law): the top why owns only
// when it holds MORE than the rest together; the line's grain carries the
// argmax only, so the no-owner face reads the riders as the argmax's
// honest measure. The climb-out split (v0.648.0) rides its own
// seat/riders pair (the cells' own tally, the byte order breaks the ranked
// ties - the space 0x20 sorts before the hyphen 0x2d).
//
// THE SEVENTEEN-FACE CONSTANT (every held face with the census line,
// faces 80-90 era): the why seat fired on ALL 17 - surface refused owns 16
// of 17 books and the fuel drought's own face (37685069081) is the lone
// exception (budget exhausted 3 of 5, 60.0%). The climb-out anatomy is the
// spread: 4 seats (low-o2 x3 incl. the singular 1/1, stalled 22/27 the
// face-90 debut) and 13 rider crowds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { parsePrePositionCensus, prePositionWhySeat, prePositionWhySeatRow, prePositionWhyRiders, prePositionWhyRidersRow, prePositionClimbSeat, prePositionClimbSeatRow, prePositionClimbRiders, prePositionClimbRidersRow } from '../../src/lib/bankcensus.mjs'

const FACE90 = 'pre-position census: armed 18, landed 2 (+118u), failed 35 (top why: surface refused x27; climb-outs: stalled x22, low-o2 x3, stopped x1, timeout x1) - the seat\'s own delivery, first priced'
const FACE89 = 'pre-position census: armed 9, landed 1 (+27u), failed 11 (top why: surface refused x8; climb-outs: low-o2 x5, timeout x3) - the seat\'s own delivery, first priced'
const FACE82 = 'pre-position census: armed 6, landed 1 (+210u), failed 5 (top why: budget exhausted x3; climb-outs: low-o2 x1) - the seat\'s own delivery, first priced'
const FACE86 = 'pre-position census: armed 17, landed 1 (+43u), failed 35 (top why: surface refused x27; climb-outs: low-o2 x6, wet-sentinel x6, timeout x5, rescue owns the bot x4, stalled x3, stopped x2, wet wall x1) - the seat\'s own delivery, first priced'
const FACE80 = 'pre-position census: armed 13, landed 8 (+843u), failed 6 (top why: surface refused x5; climb-outs: stopped x2, timeout x2, stalled x1) - the seat\'s own delivery, first priced'

test('pre-position why: the face-90 verbatim seats the surface gate with the byte-exact rows + the branch law keeps the riders silent on the seat\'s own face', () => {
  const e = parsePrePositionCensus(FACE90)
  assert.deepEqual(e, { armed: 18, landed: 2, landedUnits: 118, failed: 35, topWhy: 'surface refused', topWhyCount: 27, climbOuts: [{ kind: 'stalled', count: 22 }, { kind: 'low-o2', count: 3 }, { kind: 'stopped', count: 1 }, { kind: 'timeout', count: 1 }] })
  const seat = prePositionWhySeat(e)
  assert.deepEqual(seat, { why: 'surface refused', owns: 27, ofFailed: 35, shareOfFailed: 27 / 35 * 100 })
  assert.equal(prePositionWhySeatRow(seat), "the pre-position's own why (v0.809.0): surface refused owns 27 of 35 failed walk-homes (77.1%) - THE WALK-HOME'S OWN SEAT: one why's own failures own the pre-position book - the why's own front prices the walk home the raw split rode unnamed")
  // The branch law: the why riders read null on the seat's own face (one
  // row never both - the decompose's else is what stays unprinted).
  assert.equal(prePositionWhyRiders(e), null)
  // The climb's own seat rides the same face: stalled owns the anatomy
  // 22 of 27 (81.5%), the riders silent.
  const cl = prePositionClimbSeat(e)
  assert.deepEqual(cl, { kind: 'stalled', owns: 22, ofClimbs: 27, shareOfClimbs: 22 / 27 * 100 })
  assert.equal(prePositionClimbSeatRow(cl), "the pre-position climb's own seat (v0.809.0): stalled owns 22 of 27 climb-outs (81.5%) - THE CLIMB'S OWN SEAT: one kind's own climb-outs own the surface anatomy - the kind's own front prices the walk the raw split rode unnamed")
  // The branch law's companion (the v0.807.0 law): the lib still measures
  // the top two when a seat exists - the decompose's else is what leaves
  // it unprinted.
  assert.deepEqual(prePositionClimbRiders(e), { leader: 'stalled', leaderOwns: 22, runner: 'low-o2', runnerOwns: 3, ofClimbs: 27, pairOwns: 25, shareOfClimbs: 22 / 27 * 100 + 3 / 27 * 100, duet: 'stalled x22 + low-o2 x3' })
})

test('pre-position why: the seventeen-face constant - face 89, face 87 the bare majority, face 84 the clean sweep, face 82 the lone non-surface seat + the singular climb arm', () => {
  // Face 89 (37715421436): surface refused 8 of 11 (72.7%) + low-o2's own
  // climb seat 5 of 8 (62.5%).
  const e89 = parsePrePositionCensus(FACE89)
  const s89 = prePositionWhySeat(e89)
  assert.deepEqual(s89, { why: 'surface refused', owns: 8, ofFailed: 11, shareOfFailed: 8 / 11 * 100 })
  assert.equal(prePositionWhySeatRow(s89), "the pre-position's own why (v0.809.0): surface refused owns 8 of 11 failed walk-homes (72.7%) - THE WALK-HOME'S OWN SEAT: one why's own failures own the pre-position book - the why's own front prices the walk home the raw split rode unnamed")
  assert.deepEqual(prePositionClimbSeat(e89), { kind: 'low-o2', owns: 5, ofClimbs: 8, shareOfClimbs: 5 / 8 * 100 })
  // Face 87's shape (37709639941): 6 of 11 - the BARE majority (6 > 5),
  // the constant's closest call on the held faces.
  const e87 = parsePrePositionCensus('pre-position census: armed 16, landed 6 (+644u), failed 11 (top why: surface refused x6; climb-outs: rescue owns the bot x2, stalled x2, timeout x1, wet-sentinel x1) - the seat\'s own delivery, first priced')
  assert.deepEqual(prePositionWhySeat(e87), { why: 'surface refused', owns: 6, ofFailed: 11, shareOfFailed: 6 / 11 * 100 })
  // Face 84's shape (37694318753): the clean sweep - 10 of 10 (100.0%).
  const e84 = parsePrePositionCensus('pre-position census: armed 9, landed 4 (+267u), failed 10 (top why: surface refused x10; climb-outs: rescue owns the bot x3, wet-sentinel x3, stalled x2, low-o2 x1, stopped x1) - the seat\'s own delivery, first priced')
  assert.deepEqual(prePositionWhySeat(e84), { why: 'surface refused', owns: 10, ofFailed: 10, shareOfFailed: 10 / 10 * 100 })
  // Face 82 (37685069081): the fuel drought's own face - the LONE
  // non-surface seat on the held faces (budget exhausted 3 of 5, 60.0%),
  // and the singular climb arm reads 'climb-out' byte-exact (1 of 1).
  const e82 = parsePrePositionCensus(FACE82)
  const s82 = prePositionWhySeat(e82)
  assert.deepEqual(s82, { why: 'budget exhausted', owns: 3, ofFailed: 5, shareOfFailed: 3 / 5 * 100 })
  assert.equal(prePositionWhySeatRow(s82), "the pre-position's own why (v0.809.0): budget exhausted owns 3 of 5 failed walk-homes (60.0%) - THE WALK-HOME'S OWN SEAT: one why's own failures own the pre-position book - the why's own front prices the walk home the raw split rode unnamed")
  const c82 = prePositionClimbSeat(e82)
  assert.deepEqual(c82, { kind: 'low-o2', owns: 1, ofClimbs: 1, shareOfClimbs: 1 / 1 * 100 })
  assert.equal(prePositionClimbSeatRow(c82), "the pre-position climb's own seat (v0.809.0): low-o2 owns 1 of 1 climb-out (100.0%) - THE CLIMB'S OWN SEAT: one kind's own climb-outs own the surface anatomy - the kind's own front prices the walk the raw split rode unnamed")
  // The singular why arm: a one-failure book reads 'failed walk-home'.
  const solo = prePositionWhySeatRow(prePositionWhySeat(parsePrePositionCensus('pre-position census: armed 2, landed 1 (+114u), failed 1 (top why: surface refused x1) - the seat\'s own delivery, first priced')))
  assert.equal(solo, "the pre-position's own why (v0.809.0): surface refused owns 1 of 1 failed walk-home (100.0%) - THE WALK-HOME'S OWN SEAT: one why's own failures own the pre-position book - the why's own front prices the walk home the raw split rode unnamed")
})

test('pre-position why: the riders forms byte-exact + the tie law with the byte pins + the argmax-under-half why riders', () => {
  // Face 86 (37703890774): the 6-6 tie broke on the byte - 'low-o2' <
  // 'wet-sentinel'; the crowd reads 12 of 27 (44.4%).
  const e86 = parsePrePositionCensus(FACE86)
  assert.equal(prePositionClimbSeat(e86), null)
  const r86 = prePositionClimbRiders(e86)
  assert.deepEqual(r86, { leader: 'low-o2', leaderOwns: 6, runner: 'wet-sentinel', runnerOwns: 6, ofClimbs: 27, pairOwns: 12, shareOfClimbs: 12 / 27 * 100, duet: 'low-o2 x6 + wet-sentinel x6' })
  assert.equal(prePositionClimbRidersRow(r86), "the pre-position climb's own riders (v0.809.0): no solo kind owns the majority - low-o2 x6 + wet-sentinel x6 own 12 of 27 climb-outs (44.4%) - THE CLIMB'S OWN MIX: the seat's tie law held, the spread is the shape - the climb's own crowd prices the anatomy the solo law refused to name")
  // Face 80 (37610367304): the 2-2 tie broke on 'stopped' < 'timeout'.
  const e80 = parsePrePositionCensus(FACE80)
  assert.equal(prePositionClimbSeat(e80), null)
  assert.equal(prePositionClimbRiders(e80).duet, 'stopped x2 + timeout x2')
  // The byte trap pinned: the space 0x20 sorts before the hyphen 0x2d -
  // 'wet wall' ranks before 'wet-sentinel' at equal counts.
  const wall = prePositionClimbRiders(parsePrePositionCensus('pre-position census: armed 11, landed 2 (+242u), failed 14 (top why: surface refused x8; climb-outs: wet wall x3, low-o2 x2, stalled x2, timeout x1) - the seat\'s own delivery, first priced'))
  assert.equal(wall.duet, 'wet wall x3 + low-o2 x2')
  // The WHY riders arm (no held face fires it - the constant's own
  // witness): the argmax under the half reads the honest measure.
  const under = parsePrePositionCensus('pre-position census: armed 9, landed 1 (+27u), failed 10 (top why: surface refused x4) - the seat\'s own delivery, first priced')
  assert.equal(prePositionWhySeat(under), null)
  const ur = prePositionWhyRiders(under)
  assert.deepEqual(ur, { why: 'surface refused', owns: 4, ofFailed: 10, shareOfFailed: 4 / 10 * 100 })
  assert.equal(prePositionWhyRidersRow(ur), "the pre-position's own riders (v0.809.0): no solo why owns the majority - the top surface refused x4 holds 4 of 10 failed walk-homes (40.0%) - THE WALK-HOME'S OWN SPREAD: the line's grain carries the argmax only - the seat's law refused the under-half claim")
  // The exact-half fence: 1 of 2 is not MORE than the rest together.
  const half = parsePrePositionCensus('pre-position census: armed 3, landed 0 (+0u), failed 2 (top why: surface refused x1) - the seat\'s own delivery, first priced')
  assert.equal(prePositionWhySeat(half), null)
  assert.ok(prePositionWhyRiders(half))
})

test('pre-position why: the junk battery + the row guards + the WIRING assert - the prose lives only in the lib', () => {
  // The parser's own junk law first: a non-string reads null, a malformed
  // climb-out entry poisons the line (never invented).
  assert.equal(parsePrePositionCensus(null), null)
  assert.equal(parsePrePositionCensus(42), null)
  assert.equal(parsePrePositionCensus('pre-position census: armed 1, landed 0 (+0u), failed 1 (top why: surface refused x1; climb-outs: junk) - the seat\'s own delivery, first priced'), null)
  // The seat laws' junk battery: non-objects, zero books, junk cells.
  assert.equal(prePositionWhySeat(null), null)
  assert.equal(prePositionWhySeat({ failed: 0, topWhy: 'surface refused', topWhyCount: 0 }), null)
  assert.equal(prePositionWhySeat({ failed: 5, topWhy: 'surface refused', topWhyCount: 6 }), null) // owns > failed
  assert.equal(prePositionWhySeat({ failed: 5 }), null) // the grain never invents a why
  assert.equal(prePositionWhySeat({ failed: 5, topWhy: '', topWhyCount: 2 }), null)
  assert.equal(prePositionWhyRiders({ failed: 0, topWhy: 'x', topWhyCount: 0 }), null)
  assert.equal(prePositionClimbSeat(null), null)
  assert.equal(prePositionClimbSeat({}), null)
  assert.equal(prePositionClimbSeat({ climbOuts: [] }), null)
  assert.equal(prePositionClimbSeat({ climbOuts: [{ kind: 'stalled', count: 0 }] }), null) // a zero cell never counts
  assert.equal(prePositionClimbRiders({ climbOuts: [{ kind: 'stalled', count: 2 }] }), null) // a single kind is no crowd
  // The honest-skip law: a junk cell never counts, the real cells tally.
  const skip = prePositionClimbSeat({ climbOuts: [{ kind: '', count: 2 }, { kind: 'stalled', count: 1 }] })
  assert.deepEqual(skip, { kind: 'stalled', owns: 1, ofClimbs: 1, shareOfClimbs: 1 / 1 * 100 })
  // The row guards: junk shapes read null end to end.
  assert.equal(prePositionWhySeatRow(null), null)
  assert.equal(prePositionWhySeatRow({ why: 42, owns: 1, ofFailed: 2, shareOfFailed: 50 }), null)
  assert.equal(prePositionWhySeatRow({ why: 'x', owns: 3, ofFailed: 2, shareOfFailed: 150 }), null) // owns > ofFailed
  assert.equal(prePositionWhySeatRow({ why: 'x', owns: 1, ofFailed: 2, shareOfFailed: 'bad' }), null)
  assert.equal(prePositionWhyRidersRow(null), null)
  assert.equal(prePositionWhyRidersRow({ why: 'x', owns: 0, ofFailed: 2, shareOfFailed: 0 }), null)
  assert.equal(prePositionClimbSeatRow(null), null)
  assert.equal(prePositionClimbSeatRow({ kind: 'x', owns: 2, ofClimbs: 1, shareOfClimbs: 200 }), null)
  assert.equal(prePositionClimbRidersRow(null), null)
  assert.equal(prePositionClimbRidersRow({ leader: 'a', leaderOwns: 1, runner: '', runnerOwns: 1, ofClimbs: 2, pairOwns: 2, shareOfClimbs: 100, duet: 'a x1 +  x1' }), null)
  // THE WIRING ASSERT: the decompose imports the lib's rows (the prose
  // lives only in the lib) and the branch order rides seat-before-riders.
  const decSrc = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(decSrc.includes('parsePrePositionCensus, prePositionWhySeat, prePositionWhySeatRow, prePositionWhyRiders, prePositionWhyRidersRow, prePositionClimbSeat, prePositionClimbSeatRow, prePositionClimbRiders, prePositionClimbRidersRow'), 'the decompose imports the whole seat family from the lib')
  const whyBlockAt = decSrc.indexOf("if (ppSeat) console.log(`  ${prePositionWhySeatRow(ppSeat)}`)")
  const whyRidersAt = decSrc.indexOf("if (ppRiders) console.log(`  ${prePositionWhyRidersRow(ppRiders)}`)")
  assert.ok(whyBlockAt > -1 && whyRidersAt > whyBlockAt, 'the branch law rides in order: the seat fires first, the riders are the else')
  const clBlockAt = decSrc.indexOf("if (clSeat) console.log(`  ${prePositionClimbSeatRow(clSeat)}`)")
  const clRidersAt = decSrc.indexOf("if (clRiders) console.log(`  ${prePositionClimbRidersRow(clRiders)}`)")
  assert.ok(clBlockAt > -1 && clRidersAt > clBlockAt, 'the climb pair rides the same branch law')
  assert.ok(decSrc.includes("(v0.809.0) THE PRE-POSITION'S OWN WHY"), 'the block comment names the lens')
})
