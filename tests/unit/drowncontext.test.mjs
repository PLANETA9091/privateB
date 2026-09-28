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

// (v0.268.0) THE TITHE - the last raw o2 print sites join the one renderer.
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
  assert.equal(line, 'F15 death: drown context (o2 0, feet water, head water, rescue never, leg unknown)', 'no leg passed reads unknown honestly (the v0.270.0 stamp is unconditional)')
})

test('drownContextLine: the active-rescue shape (the rescue was running at death)', () => {
  const line = drownContextLine({
    tag: 'F2', oxygen: 3, feet: 'water', head: 'water', rescueActive: true, lastRescueAt: 9999, now: 10000
  })
  assert.equal(line, 'F2 death: drown context (o2 3, feet water, head water, rescue active, leg unknown)')
})

test('drownContextLine: the Ns-ago shape + the waterlogged flags ride the blocks', () => {
  const line = drownContextLine({
    tag: 'F9', oxygen: 12, feet: 'water', head: 'air',
    feetWaterlogged: true, headWaterlogged: false,
    rescueActive: false, lastRescueAt: 3000, now: 10000
  })
  assert.equal(line, 'F9 death: drown context (o2 12, feet water wl, head air, rescue 7s ago, leg unknown)')
})

test('drownContextLine: the stale-bar junk shape renders ? (the 26.2 sensor lesson)', () => {
  const line = drownContextLine({
    tag: 'F18', oxygen: null, feet: null, head: 'water', now: 5000
  })
  assert.equal(line, 'F18 death: drown context (o2 ?, feet unknown, head water, rescue never, leg unknown)')
})

test('drownContextLine: the future lastRescueAt (a junk clock) reads never', () => {
  const line = drownContextLine({
    tag: 'F4', oxygen: 8, feet: 'water', head: 'air', rescueActive: false, lastRescueAt: 99999, now: 10000
  })
  assert.equal(line, 'F4 death: drown context (o2 8, feet water, head air, rescue never, leg unknown)')
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
  assert.equal(line, 'F1 death: drown context (o2 reset(-1), feet water, head water, rescue active, leg unknown)')
})

test('drownContextLine: the legacy o2 shapes stay byte-identical modulo the leg stamp (v0.270.0 identity-extends)', () => {
  const l1 = drownContextLine({ tag: 'F3', oxygen: 0, feet: 'water', head: 'water' })
  assert.equal(l1, 'F3 death: drown context (o2 0, feet water, head water, rescue never, leg unknown)')
  const l2 = drownContextLine({ tag: 'F3', oxygen: 12, feet: 'water', head: 'air' })
  assert.equal(l2, 'F3 death: drown context (o2 12, feet water, head air, rescue never, leg unknown)')
  const l3 = drownContextLine({ tag: 'F3', oxygen: NaN, feet: 'water', head: 'water' })
  assert.equal(l3, 'F3 death: drown context (o2 ?, feet water, head water, rescue never, leg unknown)')
})

test('the three rescue-lane o2 sites ride the one renderer (the v0.268.0 tithe)', () => {
  assert.ok(minerSrc.includes('o2=${o2SensorLabel(read.oxygen)} probes='), 'the pass line renders the sentinel NAMED')
  assert.ok(minerSrc.includes('o2=${o2SensorLabel(read.oxygen)}${headWet'), 'the frozen-physics stand-down renders the sentinel NAMED')
  assert.ok(minerSrc.includes('o2 ${o2SensorLabel(read.oxygen)})'), 'the deep-pocket ascend renders the sentinel NAMED')
})

test('no raw o2 print site survives in miner.mjs (the one-renderer law, v0.268.0)', () => {
  assert.ok(!minerSrc.includes('o2=${read.oxygen}'), 'the raw = form is gone')
  assert.ok(!minerSrc.includes('o2 ${read.oxygen}'), 'the raw space form is gone')
})

// ---- (v0.270.0) THE TRIP LEG STAMP - the death names the leg that owned it ----

const jobqueueSrc = readFileSync(new URL('../../src/lib/jobqueue.mjs', import.meta.url), 'utf8')

test('drownContextLine: the leg stamp renders the owning walk (the F10 wood-trip shape)', () => {
  // face 36378053182: F10 died 'rescue 131s ago' inside the wood trip - the
  // next face must read the leg OFF the line, not from inventory archaeology
  const line = drownContextLine({
    tag: 'F10', oxygen: -1, feet: 'water', head: 'water',
    rescueActive: false, lastRescueAt: 10000, now: 141000,
    leg: 'wood trip'
  })
  assert.equal(line, 'F10 death: drown context (o2 reset(-1), feet water, head water, rescue 131s ago, leg wood trip)')
})

test('drownContextLine: junk legs read unknown (a lost stamp claims no walk)', () => {
  for (const leg of [null, undefined, '', '   ', 42, NaN]) {
    const line = drownContextLine({ tag: 'F6', oxygen: 9, feet: 'water', head: 'water', leg })
    assert.ok(line.endsWith(', leg unknown)'), `junk leg ${String(leg)} reads unknown, got: ${line}`)
  }
})

test('the trip leg stamp is wired: gotoSafe stamps the label, the death context carries it (v0.270.0)', () => {
  assert.ok(jobqueueSrc.includes('bot._gotoSafeLabel = label'), 'gotoSafe stamps its label on the bot')
  assert.ok(jobqueueSrc.indexOf('bot._gotoSafeLabel = label') < jobqueueSrc.indexOf("if (bot._waterRescue) return refuse"), 'the stamp precedes the gates - a refused walk still names its leg')
  assert.ok(minerSrc.includes('leg: bot._gotoSafeLabel ?? null'), 'the drown context passes the stamped leg')
})
