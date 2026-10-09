// THE FINAL BANK'S OWN DRAIN - the bankdrain tests (v0.882.0).
//
// The late-third drain's own book: the end-phase's pieces have ridden
// their own books for a hundred fires (endphase's stagger maths,
// bankfail's zero-why ledger, nightsafety's hold gate, bankcensus's
// report block) - the DRAIN as one fold never priced. The synthetic
// lines below ride the emitter's own grammar byte for byte (the
// v0.875.0 precedent: pre-field tests pin the shape); face 145's own
// log carries the real battery (the banked 4 / underground 9 /
// night-held 2 / latched 1 / nothing 1 / cut 8 shape read from the
// artifact this fire).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BANK_ZERO_RE, classifyBankReason } from '../../src/lib/bankfail.mjs'
import { NIGHT_WALK_START } from '../../src/lib/nightsafety.mjs'
import { finalBankDrainBook, finalBankDrainConsistent, finalBankDrainRow } from '../../src/lib/bankdrain.mjs'
import { finalBankHoldBook, finalBankHoldConsistent, finalBankHoldRow } from '../../src/lib/bankdrain.mjs'

// the emitters' own grammar, byte for byte (testbed/fleet19.mjs lines
// 3346, 3233, 3753, 3766, 3710, 3209, 3755)
const stagger = (bot, s) => `${bot} final bank: staggered +${s}s`
const night = (bot, tod) => `${bot} final bank deferred: night (tod=${tod}) - the pocket rides out the dark alive (the v0.140.1 night hold)`
const banked = (bot, n) => `${bot} final bank: +${n}`
const zeroUnderground = (bot, n) => `${bot} final bank: 0 (still underground after ${n} climb attempt${n > 1 ? 's' : ''} - the chain from the shaft bottom is doomed walks)`
const zeroLatched = (bot, n) => `${bot} final bank: 0 (dooms-latched after ${n} failed shaft-bottom climb cycles - the chain is refused, the clock mines on)`
const zeroNothing = (bot) => `${bot} final bank: 0 (nothing to deposit)`
const zeroBudget = (bot) => `${bot} final bank: 0 (chest unreachable (budget exhausted (walk floor)))`
const chainError = (bot, msg) => `${bot} final bank chain error: ${msg}`

test('the grammar pin - the emitters\' own lines, the reuse law rides classifyBankReason', () => {
  // the zero lines' shape is bankfail's own RE (the one-parser law by
  // reuse - the lib never re-spells the zero grammar)
  assert.ok(BANK_ZERO_RE.test(zeroUnderground('F9', 2)))
  // the reason classifier is bankfail's own word (imported, never
  // re-spelled): the underground class carries its own climbAttempts
  assert.deepEqual(classifyBankReason('still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks'), { why: 'underground', climbAttempts: 2 })
  // the fold rides the classifier's own class: the book's underground
  // seat prices the face's attempts
  const b = finalBankDrainBook([zeroUnderground('F9', 2)])
  assert.equal(b.underground.count, 1)
  assert.equal(b.underground.climbs, 2)
})

test('the fold law - the last verdict wins per bot, the hold releases, the re-arm banks', () => {
  const lines = [
    stagger('F2', 56),
    night('F2', 12959),
    banked('F2', 13)
  ]
  const b = finalBankDrainBook(lines)
  assert.equal(b.perBot.F2.verdict, 'banked')
  assert.equal(b.banked.count, 1)
  assert.equal(b.banked.units, 13)
  assert.equal(b.nightHeld, 0, 'the hold is the gate\'s word, never the terminal - a later verdict releases it')
  // a latched bot that re-arms and banks rides banked (the last-wins
  // law - the counts are the verdicts' census, never the lines')
  const lines2 = [zeroLatched('F9', 2), banked('F9', 7)]
  const b2 = finalBankDrainBook(lines2)
  assert.equal(b2.latched, 0)
  assert.equal(b2.banked.count, 1)
  assert.equal(b2.banked.units, 7)
})

test('the cut class - armed, no verdict line, the clock ended the chain', () => {
  const b = finalBankDrainBook([stagger('F6', 104), stagger('F5', 40), banked('F5', 3)])
  assert.equal(b.armed, 2)
  assert.equal(b.cut, 1, 'F6 armed and never reported - the honest cut')
  assert.equal(b.banked.count, 1)
})

test('the drain seats - the reason vocabulary rides the classifier + the latch\'s own fate', () => {
  const lines = [
    zeroNothing('F13'),
    zeroUnderground('F9', 2),
    zeroLatched('F9', 2),
    zeroBudget('F14'),
    night('F12', 12959),
    chainError('F3', 'Cannot read properties of undefined'),
    banked('F7', 13),
    banked('F17', 188)
  ]
  const b = finalBankDrainBook(lines)
  assert.equal(b.nothing, 1)
  assert.equal(b.underground.count, 0, "the latch overrode F9's own underground seat - the last verdict wins whole, no underground bot remains")
  assert.equal(b.latched, 1)
  assert.equal(b.unreachable, 1, 'the wrapper wins - the classifier\'s own chest-unreachable seat rides (the reuse law)')
  assert.equal(b.budget, 0)
  assert.equal(b.nightHeld, 1)
  assert.equal(b.chainError, 1)
  assert.equal(b.banked.count, 2)
  assert.equal(b.banked.units, 201)
})

test('the face-145 battery - the artifact\'s own lines, byte for byte', () => {
  const lines = [
    stagger('F9', 12),
    'F9 final bank: 0 (still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks)',
    'F13 final bank: 0 (still underground after 1 climb attempt - the chain from the shaft bottom is doomed walks)',
    'F9 final bank: 0 (still underground after 1 climb attempt - the chain from the shaft bottom is doomed walks)',
    'F9 final bank: 0 (dooms-latched after 2 failed shaft-bottom climb cycles - the chain is refused, the clock mines on)',
    stagger('F2', 56),
    stagger('F1', 96),
    stagger('F14', 80),
    night('F12', 12959),
    stagger('F6', 104),
    stagger('F10', 80),
    stagger('F13', 72),
    stagger('F8', 40),
    stagger('F11', 96),
    stagger('F19', 80),
    night('F16', 12422),
    'F19 final bank: 0 (still underground after 1 climb attempt - the chain from the shaft bottom is doomed walks)',
    banked('F7', 13),
    'F13 final bank: 0 (nothing to deposit)',
    'F13 final bank: 0 (still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks)',
    'F18 final bank: 0 (nothing to deposit)',
    banked('F17', 188),
    'F11 final bank: 0 (still underground after 2 climb attempts - the chain from the shaft bottom is doomed walks)',
    'F14 final bank: 0 (still underground after 1 climb attempt - the chain from the shaft bottom is doomed walks)',
    banked('F4', 56),
    'F10 final bank: 0 (still underground after 1 climb attempt - the chain from the shaft bottom is doomed walks)'
  ]
  const b = finalBankDrainBook(lines)
  assert.ok(finalBankDrainConsistent(b))
  // the fold's own verdicts (the face's honest shape: the last verdict
  // wins per bot - F9 rides latched, F13 rides underground, F19 rides
  // underground despite the early zero)
  assert.equal(b.banked.count, 3)
  assert.equal(b.banked.units, 257)
  assert.equal(b.latched, 1)
  assert.equal(b.underground.count, 5, 'F9 rides latched - the underground bots are F13/F19/F11/F14/F10 (the last verdict wins whole)')
  assert.equal(b.underground.climbs, 7)
  assert.equal(b.nothing, 1, 'F18\'s honest empty pocket - the last zero wins')
  assert.equal(b.nightHeld, 2)
  assert.equal(b.armed, 10)
  assert.equal(b.cut, 4, "the excerpt's own truth: F2/F1/F6/F8 armed and their verdicts ride beyond the excerpt - the cut prices the un-ended chains")
  const row = finalBankDrainRow(b)
  assert.ok(row.includes("the final bank's own drain (v0.882.0)"))
  assert.ok(row.includes('armed 10'))
  assert.ok(row.includes('banked 3 +257u (30%)'))
  assert.ok(row.includes('underground 5 (climbs 7)'))
  assert.ok(row.includes('night-held 2'))
  assert.ok(row.includes('cut 4'))
})

test('the row\'s honest silence - the zero classes stay off, the junk prices nothing', () => {
  // a book with no lines: the empty read renders nothing
  assert.equal(finalBankDrainRow(finalBankDrainBook([])), null)
  // a lone verdict rides its own class only
  const row = finalBankDrainRow(finalBankDrainBook([banked('F7', 13)]))
  assert.equal(row, "the final bank's own drain (v0.882.0): banked 1 +13u - the cut prices the chains the clock ended first")
  // the junk battery: non-strings, non-arrays, dirty shapes judge nothing
  const junk = finalBankDrainBook([null, 42, {}, 'final bank: +5', 'X1 final bank: +3', undefined, [1, 2]])
  assert.equal(junk.bots, 0)
  assert.equal(junk.banked.count, 0)
  assert.equal(finalBankDrainBook('not an array').bots, 0)
  assert.equal(finalBankDrainBook(null).bots, 0)
  assert.equal(finalBankDrainRow(null), null)
  assert.equal(finalBankDrainRow(undefined), null)
  assert.equal(finalBankDrainRow({}), null)
})

test('the fence law - an inconsistent book prices nothing', () => {
  const b = finalBankDrainBook([stagger('F2', 56), banked('F2', 13)])
  assert.equal(finalBankDrainConsistent(b), true)
  // the tampered sums read inconsistent (the fence law's own byte)
  const bad = { ...b, banked: { count: 2, units: 13 } }
  assert.equal(finalBankDrainConsistent(bad), false)
  const bad2 = { ...b, armed: 5 }
  assert.equal(finalBankDrainConsistent(bad2), false)
  const bad3 = { ...b, cut: 1 }
  assert.equal(finalBankDrainConsistent(bad3), false)
  assert.equal(finalBankDrainRow(bad), null)
})

test('the decompose WIRING pins - the import band + the print site ride the bytes', () => {
  const src = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  // the import band grew with the list (the v0.881.0 precedent)
  assert.ok(src.includes("import { finalBankDrainBook, finalBankDrainRow } from '../../src/lib/bankdrain.mjs'"), 'the import rides the band')
  // the print site rides beside the bank-fail census's own block
  assert.ok(src.includes("const dbk = finalBankDrainBook(lines)"), 'the book call rides the print site')
  assert.ok(src.includes("finalBankDrainRow(dbk)"), 'the row renders at the site')
  // (v0.886.0) the hold clock rides its own band line + its own site
  assert.ok(src.includes("import { finalBankHoldBook, finalBankHoldRow } from '../../src/lib/bankdrain.mjs'"), 'the hold clock rides its own band line')
  assert.ok(src.includes('const hbk = finalBankHoldBook(lines)'), 'the hold book call rides the print site')
  assert.ok(src.includes('finalBankHoldRow(hbk)'), 'the hold row renders at the site')
})

// (v0.886.0) THE HOLD CLOCK - the night-held seats' own tod join. The
// synthetic lines ride the emitter's own grammar byte for byte; the
// face-146 battery rides the artifact's own hold lines verbatim.

test('the hold clock grammar pin - the gate\'s own edge by import, the reuse law', () => {
  // the gate's own edge is nightsafety's own constant (never forked)
  assert.equal(NIGHT_WALK_START, 12400)
  // the hold line rides the family's own emitter shape
  const b = finalBankHoldBook([night('F1', 12500)])
  assert.equal(b.held, 1)
  assert.deepEqual(b.perHold[0], { bot: 'F1', tod: 12500, gap: 100 })
})

test('the gap law - the ticks past the walk gate, the spread\'s own image', () => {
  const b = finalBankHoldBook([
    night('F1', 12420), // gap 20
    night('F2', 12410), // gap 10 - the min
    night('F3', 12700) // gap 300 - the max
  ])
  assert.equal(b.held, 3)
  assert.equal(b.gap.min, 10)
  assert.equal(b.gap.max, 300)
  assert.equal(b.gap.sum, 330)
  assert.equal(b.gap.count, 3)
  assert.ok(finalBankHoldConsistent(b))
  const row = finalBankHoldRow(b)
  assert.ok(row.includes('the final bank\'s own hold clock (v0.886.0)'))
  assert.ok(row.includes('held 3, gate gap 10..300 ticks (avg 110)'))
  assert.ok(row.includes("the walk gate's own edge (12400)"))
})

test('the blind skin - the emitter\'s tod=-1 judges nothing, the seat counts', () => {
  const b = finalBankHoldBook([
    night('F1', -1), // the bot's own clock missing at the hold
    night('F2', 12434)
  ])
  assert.equal(b.held, 2)
  assert.equal(b.blind, 1, 'the blind seat counts, the gap judges nothing')
  assert.equal(b.gap.count, 1)
  assert.deepEqual(b.perHold[0], { bot: 'F1', tod: -1, gap: null })
  assert.ok(finalBankHoldConsistent(b))
  const row = finalBankHoldRow(b)
  assert.ok(row.includes('blind 1'))
  assert.ok(row.includes('gate gap 34..34 ticks (avg 34)'))
})

test('the face-146 battery - the artifact\'s own hold lines, byte for byte', () => {
  const lines = [
    'F12 final bank deferred: night (tod=12434) - the pocket rides out the dark alive (the v0.140.1 night hold)',
    'F14 final bank deferred: night (tod=12452) - the pocket rides out the dark alive (the v0.140.1 night hold)',
    'F1 final bank deferred: night (tod=12451) - the pocket rides out the dark alive (the v0.140.1 night hold)',
    'F18 final bank deferred: night (tod=12448) - the pocket rides out the dark alive (the v0.140.1 night hold)',
    'F7 final bank deferred: night (tod=12534) - the pocket rides out the dark alive (the v0.140.1 night hold)',
    'F5 final bank deferred: night (tod=12538) - the pocket rides out the dark alive (the v0.140.1 night hold)',
    'F6 final bank deferred: night (tod=12676) - the pocket rides out the dark alive (the v0.140.1 night hold)'
  ]
  const b = finalBankHoldBook(lines)
  assert.ok(finalBankHoldConsistent(b))
  assert.equal(b.held, 7)
  assert.equal(b.blind, 0)
  assert.equal(b.gap.min, 34, 'F12\'s chain turned 34 ticks past the gate')
  assert.equal(b.gap.max, 276, 'F6\'s chain rode 276 ticks (13.8s) into the dark')
  assert.equal(b.gap.sum, 733)
  const row = finalBankHoldRow(b)
  assert.ok(row.includes('held 7, gate gap 34..276 ticks (avg 105)'))
  assert.ok(row.includes("the bank-before-night lever prices the walk gate's own edge (12400)"))
})

test('the hold clock fence battery - the tampered books price nothing', () => {
  const b = finalBankHoldBook([night('F1', 12500), night('F2', -1)])
  assert.equal(finalBankHoldConsistent(b), true)
  assert.equal(finalBankHoldConsistent({ ...b, held: 5 }), false)
  assert.equal(finalBankHoldConsistent({ ...b, blind: 2 }), false)
  assert.equal(finalBankHoldConsistent({ ...b, gap: { ...b.gap, sum: 99 } }), false)
  assert.equal(finalBankHoldConsistent({ ...b, gap: { ...b.gap, count: 2 } }), false)
  assert.equal(finalBankHoldConsistent({ ...b, perHold: [...b.perHold, { bot: 'F9', tod: 12500, gap: 100 }] }), false)
  assert.equal(finalBankHoldConsistent({ ...b, perHold: [{ ...b.perHold[0], gap: 999 }, b.perHold[1]] }), false, 'a gap that lies against the gate\'s own constant breaks the fence')
  assert.equal(finalBankHoldConsistent({ ...b, perHold: [{ ...b.perHold[0], tod: -1 }, b.perHold[1]] }), false, 'a blind tod carrying a gap breaks the fence')
  assert.equal(finalBankHoldConsistent(null), false)
  assert.equal(finalBankHoldConsistent({}), false)
  assert.equal(finalBankHoldRow({ ...b, held: 5 }), null)
})

test('the hold row\'s honest silence - no holds, the junk, the empty book', () => {
  assert.equal(finalBankHoldRow(finalBankHoldBook([])), null)
  assert.equal(finalBankHoldBook('not an array').held, 0)
  assert.equal(finalBankHoldBook(null).held, 0)
  assert.equal(finalBankHoldRow(null), null)
  assert.equal(finalBankHoldRow(undefined), null)
  assert.equal(finalBankHoldRow({}), null)
  const junk = finalBankHoldBook([null, 42, 'final bank deferred: night', 'F1 died - respawning', undefined, {}])
  assert.equal(junk.held, 0)
  // junk between the holds rides nothing
  const b = finalBankHoldBook([null, night('F1', 12434), 42, 'junk line', night('F2', 12676)])
  assert.equal(b.held, 2)
  assert.ok(finalBankHoldConsistent(b))
})
