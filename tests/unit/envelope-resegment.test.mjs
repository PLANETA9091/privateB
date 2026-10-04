// (v0.355.0) THE FALSIFIED ENVELOPE RE-SEGMENT - the nudge ladder's second
// start-change.
//
// MEASURED (fleet 36726048100, face 11, the calm): 40 'Took to long to decide
// path to goal!' deaths in ONE 600s face, and the dominant shape is the
// nudge's OWN verdict falsified - 'path nudge approach: 1 segment(s) walked
// in 0.3s, goal now d=16.2 (inside the direct envelope)' followed by 'chest
// walk failed after the nudge (Took to long to decide path to goal!)'. The
// envelope's verdict is a DISTANCE read (the 24b threshold), the death is a
// DECISION read - the A* could not decide from the nudge's new start either.
// The cure: one more start-change (the second approachWalk shot) when the
// envelope is FALSIFIED, bounded by the shot ledger and the caller's floor.
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { nudgeReSegmentPlan, NUDGE_SHOT_MAX, NUDGE_RESEGMENT_FLOOR_MS, PATH_GEOMETRY_RE } from '../../src/lib/approach.mjs'

const GEOMETRY_DEATH = 'Took to long to decide path to goal!'
const NO_PATH_DEATH = 'No path to the goal!'
const WALK_CLOCK_DEATH = 'walk to chest (retry): timeout after 15000ms'
const NON_GEOMETRY_DEATH = 'open chest: timeout after 10000ms' // the SHAPE doctrine: no walk label, not the class

test('the happy re-segment: a declared envelope + a geometry death + clock => one more start-change', () => {
  const plan = nudgeReSegmentPlan({ shotsUsed: 1, envelopeInside: true, failMsg: GEOMETRY_DEATH, remainingMs: 9000 })
  assert.equal(plan.retry, true)
  assert.match(plan.why, /the envelope lied/)
  assert.match(plan.why, /start-change/)
})

test('the geometry class is the pathfinder trio: decide, no-path, walk-clock', () => {
  for (const msg of [GEOMETRY_DEATH, NO_PATH_DEATH, WALK_CLOCK_DEATH]) {
    const plan = nudgeReSegmentPlan({ shotsUsed: 1, envelopeInside: true, failMsg: msg, remainingMs: 9000 })
    assert.equal(plan.retry, true, `expected retry for: ${msg}`)
  }
  assert.equal(PATH_GEOMETRY_RE.test(WALK_CLOCK_DEATH), true) // the v0.164.0 twin rides the same class
})

test('the shot ledger is the bound: the ladder is spent at NUDGE_SHOT_MAX', () => {
  const plan = nudgeReSegmentPlan({ shotsUsed: NUDGE_SHOT_MAX, envelopeInside: true, failMsg: GEOMETRY_DEATH, remainingMs: 9000 })
  assert.equal(plan.retry, false)
  assert.match(plan.why, /the nudge ladder is spent \(2 shots\)/)
})

test('the strict envelope read: only a DECLARED envelope can be falsified', () => {
  for (const inside of [false, 0, 1, 'yes', null, undefined]) {
    const plan = nudgeReSegmentPlan({ shotsUsed: 1, envelopeInside: inside, failMsg: GEOMETRY_DEATH, remainingMs: 9000 })
    assert.equal(plan.retry, false, `envelopeInside=${String(inside)} must not cross`)
    assert.match(plan.why, /the first verdict was not the envelope/)
  }
})

test('the non-geometry death keeps the legacy shape: no re-segment, the exclude owns it', () => {
  const plan = nudgeReSegmentPlan({ shotsUsed: 1, envelopeInside: true, failMsg: NON_GEOMETRY_DEATH, remainingMs: 9000 })
  assert.equal(plan.retry, false)
  assert.match(plan.why, /not the geometry class/)
})

test('the floor: the v0.156.0 negative-clock lesson - no clock, no fake death', () => {
  const broke = nudgeReSegmentPlan({ shotsUsed: 1, envelopeInside: true, failMsg: GEOMETRY_DEATH, remainingMs: NUDGE_RESEGMENT_FLOOR_MS })
  assert.equal(broke.retry, false)
  assert.match(broke.why, /no re-segment clock \(the 2000ms floor\)/)
  const ok = nudgeReSegmentPlan({ shotsUsed: 1, envelopeInside: true, failMsg: GEOMETRY_DEATH, remainingMs: NUDGE_RESEGMENT_FLOOR_MS + 1 })
  assert.equal(ok.retry, true) // the exact boundary: one ms over the floor crosses
})

test('the junk battery: the body-guard law - null, junk shapes and lies never cross', () => {
  for (const junk of [null, undefined, 'x', 7, [], { shotsUsed: '1' }, { shotsUsed: -3, envelopeInside: true, failMsg: GEOMETRY_DEATH, remainingMs: 9000 }, { shotsUsed: 1, envelopeInside: true, failMsg: 42, remainingMs: 9000 }, { shotsUsed: 1, envelopeInside: true, failMsg: GEOMETRY_DEATH, remainingMs: 'soon' }, { shotsUsed: 1, envelopeInside: true, failMsg: GEOMETRY_DEATH, remainingMs: Infinity }]) {
    const plan = nudgeReSegmentPlan(junk)
    assert.equal(plan.retry, false, `junk must not cross: ${JSON.stringify(junk)}`)
    assert.equal(typeof plan.why, 'string')
  }
  assert.equal(nudgeReSegmentPlan().retry, false) // the bare call degrades to the honest defer
})

test('the constants pin', () => {
  assert.equal(NUDGE_SHOT_MAX, 2)
  assert.equal(NUDGE_RESEGMENT_FLOOR_MS, 2000)
})

// ---- the wiring pins (the source reads - the fuel commons owns the ladder) ----

const fuelSrc = readFileSync(new URL('../../src/lib/fuelbank.mjs', import.meta.url), 'utf8')

test('the wiring pins: the plan rides the post-nudge catch, the shot ledger feeds it', () => {
  assert.match(fuelSrc, /import \{ approachWalk, PATH_GEOMETRY_RE, nudgeReSegmentPlan, NUDGE_RESEGMENT_FLOOR_MS \} from '\.\/approach\.mjs'/)
  assert.match(fuelSrc, /nudgeShots = 1 \/\/ the first shot is spent/)
  assert.match(fuelSrc, /nudgedInside = n\.walked === true/) // the strict read
  assert.match(fuelSrc, /nudgeReSegmentPlan\(\{ shotsUsed: nudgeShots, envelopeInside: nudgedInside, failMsg: e2\?\.message \|\| String\(e2 \?\? ''\), remainingMs: remainingMs\(\) \}\)/)
  assert.match(fuelSrc, /nudgeShots\+\+/) // the second shot increments BEFORE the walk
})

test('the wiring pins: the four canonical lines ride the fuel filter key', () => {
  assert.match(fuelSrc, /fuel commons: envelope re-segment deferred: \$\{plan\.why\}/) // the defer form
  assert.match(fuelSrc, /fuel commons: the envelope re-segment LANDED - the walk owns the chest now/) // the result form
  assert.match(fuelSrc, /fuel commons: envelope re-segment stalled: \$\{e3\?\.message \|\| e3\} - the exclude owns the chest/) // the refusal form
  assert.match(fuelSrc, /fuel commons: envelope re-segment swallowed: \$\{eRe\?\.message \|\| eRe\} - the exclude owns the chest/) // the swallow form
})

test('the wiring pins: the re-segment walk is bounded and its own label', () => {
  assert.match(fuelSrc, /label: `fuel commons walk @\$\{Math\.round\(chest\.position\.x\)\},\$\{Math\.round\(chest\.position\.z\)\} \(envelope re-segment\)`/) // the distinct label
  assert.match(fuelSrc, /budgetMs: Math\.min\(remainingMs\(\), 15000\), closeShot: true, rawWalk: walkRawToward, log: m => log\(`fuel commons: envelope re-segment nudge \$\{m\}`\)/) // (v0.356.0) the raw walker rides the re-segment too
  assert.match(fuelSrc, /remainingMs\(\) > NUDGE_RESEGMENT_FLOOR_MS/) // the floor gate on the third walk
  assert.match(fuelSrc, /doomedRearm: true, doomTtl: CHEST_DOOM_TTL_MS \}\)\n                        log\('fuel commons: the envelope re-segment LANDED/s) // the doom ledger stays intact on the third walk
})

test('the wiring pins: every fall-through keeps the exclude (the account of record law)', () => {
  // the arrived flag is the ONLY door past the exclude; the re-segment sets it
  // only on a LANDED walk - the defer/stall/swallow paths must not touch it
  const block = fuelSrc.slice(fuelSrc.indexOf('catch (e2) {'), fuelSrc.indexOf("log(`fuel commons: the nudge spent the walk slice"))
  assert.match(block, /if \(!plan\.retry\) \{\n\s*log\(`fuel commons: envelope re-segment deferred/)
  assert.match(block, /arrived = true/)
  const landedCount = (block.match(/arrived = true/g) || []).length
  // (v0.597.0) the two new doors are the last-mile hop's own landings (the
  // decide-fail seat + the re-segment's floor) - the helper returns true ONLY
  // on a real raw landing (walkRawToward within reach), the same contract the
  // legacy two doors kept: a landing, never a claim. 2 legacy + 2 hop doors.
  assert.equal(landedCount, 4)
})
