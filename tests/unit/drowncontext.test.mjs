// (v0.249.0) THE DROWN-DEATH CONTEXT pins - the drowning-class telemetry gap.
// Run36325553310 measured the Drowned-class as the RETURNED death leader
// (4/6) with the shore law at ZERO firings - the drown deaths fell outside
// every water instrument's context. drownContextLine gives every env-drown
// death ONE snapshot line (o2, feet/head blocks + waterlogged flags, rescue
// relation) so the next decode splits the class by context BEFORE any cure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { drownContextLine } from '../../src/lib/statcarry.mjs'
import { o2SensorLabel } from '../../src/lib/drowning.mjs'

// (v0.267.0) THE TITHE - the last raw o2 print sites join the one renderer.
// The 1030 census (face 36369215771) caught the pass lines printing the raw
// -1 sentinel while both death-side sites rendered NAMED - the decoder had
// to re-derive the law from the v0.64.0 comment every read. The pass line,
// the frozen-physics stand-down and the deep-pocket ascend now ride
// o2SensorLabel; the negative pins own the law: NO raw site returns.
const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('drownContextLine: the submerged-never-rescued shape (the F15/F18 class)', () => {
  const line = drownContextLine({
    tag: 'F15', oxygen: 0, feet: 'water', head: 'water',
    feetWaterlogged: false, headWaterlogged: false,
    rescueActive: false, lastRescueAt: null, now: 5000
  })
  assert.equal(line, 'F15 death: drown context (o2 0, feet water, head water, rescue never)')
})

test('drownContextLine: the active-rescue shape (the rescue was running at death)', () => {
  const line = drownContextLine({
    tag: 'F2', oxygen: 3, feet: 'water', head: 'water', rescueActive: true, lastRescueAt: 9999, now: 10000
  })
  assert.equal(line, 'F2 death: drown context (o2 3, feet water, head water, rescue active)')
})

test('drownContextLine: the Ns-ago shape + the waterlogged flags ride the blocks', () => {
  const line = drownContextLine({
    tag: 'F9', oxygen: 12, feet: 'water', head: 'air',
    feetWaterlogged: true, headWaterlogged: false,
    rescueActive: false, lastRescueAt: 3000, now: 10000
  })
  assert.equal(line, 'F9 death: drown context (o2 12, feet water wl, head air, rescue 7s ago)')
})

test('drownContextLine: the stale-bar junk shape renders ? (the 26.2 sensor lesson)', () => {
  const line = drownContextLine({
    tag: 'F18', oxygen: null, feet: null, head: 'water', now: 5000
  })
  assert.equal(line, 'F18 death: drown context (o2 ?, feet unknown, head water, rescue never)')
})

test('drownContextLine: the future lastRescueAt (a junk clock) reads never', () => {
  const line = drownContextLine({
    tag: 'F4', oxygen: 8, feet: 'water', head: 'air', rescueActive: false, lastRescueAt: 99999, now: 10000
  })
  assert.equal(line, 'F4 death: drown context (o2 8, feet water, head air, rescue never)')
})

test('drownContextLine: a fully junk world read refuses (null - nothing to say)', () => {
  assert.equal(drownContextLine({ tag: 'F1', oxygen: null, feet: null, head: null }), null)
  assert.equal(drownContextLine(null), null)
  assert.equal(drownContextLine({ oxygen: undefined, feet: undefined, head: undefined }), null)
})
// ---- (v0.264.0) THE O2 SENSOR LABEL - the -1 reset sentinel gets its name ----

test('o2SensorLabel: the -1 reset sentinel renders NAMED (the v0.64.0 law)', () => {
  assert.equal(o2SensorLabel(-1), 'reset(-1)')
})

test('o2SensorLabel: honest values and junk keep their shapes', () => {
  assert.equal(o2SensorLabel(0), '0')
  assert.equal(o2SensorLabel(20), '20')
  assert.equal(o2SensorLabel(4), '4')
  assert.equal(o2SensorLabel(-5), '-5', 'a non-sentinel negative prints its truth - only -1 is the named sentinel')
  assert.equal(o2SensorLabel(null), '?')
  assert.equal(o2SensorLabel(undefined), '?')
  assert.equal(o2SensorLabel(NaN), '?')
  assert.equal(o2SensorLabel('junk'), '?')
})

test('drownContextLine: the F1 chain shape - the sentinel burst after an active rescue reads off the line', () => {
  // face 36365938885: F1 died 'server: drowned' with the line printing a raw
  // 'o2 -1' - the v0.64.0 reset burst after its rescue, not a bar state. The
  // named render arms the decode without re-deriving the law every read.
  const line = drownContextLine({
    tag: 'F1', oxygen: -1, feet: 'water', head: 'water', rescueActive: true
  })
  assert.equal(line, 'F1 death: drown context (o2 reset(-1), feet water, head water, rescue active)')
})

test('drownContextLine: the legacy o2 shapes stay byte-identical', () => {
  const l1 = drownContextLine({ tag: 'F3', oxygen: 0, feet: 'water', head: 'water' })
  assert.equal(l1, 'F3 death: drown context (o2 0, feet water, head water, rescue never)')
  const l2 = drownContextLine({ tag: 'F3', oxygen: 12, feet: 'water', head: 'air' })
  assert.equal(l2, 'F3 death: drown context (o2 12, feet water, head air, rescue never)')
  const l3 = drownContextLine({ tag: 'F3', oxygen: NaN, feet: 'water', head: 'water' })
  assert.equal(l3, 'F3 death: drown context (o2 ?, feet water, head water, rescue never)')
})

test('the three rescue-lane o2 sites ride the one renderer (the v0.267.0 tithe)', () => {
  assert.ok(minerSrc.includes('o2=${o2SensorLabel(read.oxygen)} probes='), 'the pass line renders the sentinel NAMED')
  assert.ok(minerSrc.includes('o2=${o2SensorLabel(read.oxygen)}${headWet'), 'the frozen-physics stand-down renders the sentinel NAMED')
  assert.ok(minerSrc.includes('o2 ${o2SensorLabel(read.oxygen)})'), 'the deep-pocket ascend renders the sentinel NAMED')
})

test('no raw o2 print site survives in miner.mjs (the one-renderer law, v0.267.0)', () => {
  assert.ok(!minerSrc.includes('o2=${read.oxygen}'), 'the raw = form is gone')
  assert.ok(!minerSrc.includes('o2 ${read.oxygen}'), 'the raw space form is gone')
})
