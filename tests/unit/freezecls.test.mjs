// (v0.340.0) THE FREEZE NAMES ITSELF - the verdict was never a diagnosis.
//
// Face 36679076372's ledger: 57 frozen-physics verdicts in one 600s run,
// ALL 31 rescue stand-downs frozen (100%), 24 forced relogs, and three
// bots (F16 x12, F15 x11, F13 x11) burned their whole run in the
// freeze->relog->resume-wet loop while the doom census blamed 'low-o2'
// for 60% of the climb tax. The mineflayer 4.39.0 source
// (lib/plugins/physics.js, read in this fire) holds the mechanism:
// tickPhysics skips the simulation through four silent gates with the
// socket ALIVE (client state != play; entity missing/non-finite; THE
// CHUNK UNLOADED - blockAt(position) == null; physicsEnabled false), and
// behind them sits `shouldUsePhysics` - a closure var set false on
// mount/death/respawn/login/start_configuration and re-armed ONLY by the
// forced-move handler. A server that never corrects our position leaves
// the lane cold forever: the interval runs, every gate is open, and
// waitForTicks times out (the rescue's own 'dead physics' read). The
// tick age separates the two invisible classes: silent >= 1000ms with
// all gates open = 'lane-cold' (the re-arm never came); ticking
// recently yet flat = 'ticking-flat' (the simulate runs and the world
// owns the bot - a different disease a relog may not cure).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  freezeClass, FREEZE_TICK_SILENT_MS
} from '../../src/lib/drowning.mjs'

const OPEN = { clientState: 'play', hasFiniteEntity: true, chunkLoaded: true, physicsEnabled: true }

test('the boundary pin: the tick age at 1000ms splits lane-cold from ticking-flat', () => {
  assert.equal(FREEZE_TICK_SILENT_MS, 1000, 'a live loop ticks every 50ms - one second of silence is ~20 skipped ticks, not lag')
  const cold = freezeClass({ ...OPEN, tickAgeMs: 1000 })
  assert.equal(cold.cls, 'lane-cold', 'the >= boundary - silence at the threshold condemns the lane')
  assert.ok(cold.why.includes('forced-move lane is cold'), 'the why names the mechanism (shouldUsePhysics never re-armed)')
  const flat = freezeClass({ ...OPEN, tickAgeMs: 999 })
  assert.equal(flat.cls, 'ticking-flat', 'one ms under the boundary reads the ticking class')
  assert.ok(flat.why.includes('the world owns the bot'), 'the why separates the disease (the simulate runs)')
})

test('the gate order pin: each silent gate dominates the later ones (the source skip order)', () => {
  // the mineflayer source reads state -> entity -> chunk -> enabled, and
  // the diagnosis must name the FIRST gate the simulation actually hits
  const config = freezeClass({
    clientState: 'configuration', hasFiniteEntity: false, chunkLoaded: false, physicsEnabled: false, tickAgeMs: 5000
  })
  assert.equal(config.cls, 'config-state', 'a non-play client state outranks everything')
  const entity = freezeClass({ ...OPEN, hasFiniteEntity: false, chunkLoaded: false, physicsEnabled: false, tickAgeMs: 5000 })
  assert.equal(entity.cls, 'entity-lost', 'a lost entity outranks the chunk gate')
  const chunk = freezeClass({ ...OPEN, chunkLoaded: false, physicsEnabled: false, tickAgeMs: 5000 })
  assert.equal(chunk.cls, 'chunk-lost', 'an unloaded chunk outranks the enabled gate')
  const disabled = freezeClass({ ...OPEN, physicsEnabled: false, tickAgeMs: 5000 })
  assert.equal(disabled.cls, 'physics-disabled', 'a shut simulate gate outranks the tick age')
})

test('the junk law: a lost reading never condemns a class the code cannot prove', () => {
  // the Number(null) lesson: null is NOT false - an unreadable gate passes
  assert.equal(freezeClass({}).cls, 'unproven', 'all-null reads refuse to name anything')
  assert.equal(freezeClass({ ...OPEN, tickAgeMs: null }).cls, 'unproven', 'an unarmed tracker cannot split lane-cold from ticking-flat')
  assert.equal(freezeClass({ ...OPEN, tickAgeMs: NaN }).cls, 'unproven', 'a NaN age is a lost reading')
  assert.equal(freezeClass({ ...OPEN, tickAgeMs: -5 }).cls, 'unproven', 'a negative age is a lost reading (clock skew, not silence)')
  // the entity gate is strict === false (a null read passes; a false read condemns)
  assert.equal(freezeClass({ ...OPEN, hasFiniteEntity: null, tickAgeMs: 2000 }).cls, 'lane-cold', 'a null entity read passes the gate')
  assert.equal(freezeClass({ ...OPEN, chunkLoaded: null, tickAgeMs: 2000 }).cls, 'lane-cold', 'a null chunk read passes the gate')
  assert.equal(freezeClass({ ...OPEN, physicsEnabled: null, tickAgeMs: 2000 }).cls, 'lane-cold', 'a null enabled read passes the gate')
  // the client state gate: a genuine 'play' passes, junk strings condemn
  assert.equal(freezeClass({ ...OPEN, clientState: null, tickAgeMs: 2000 }).cls, 'lane-cold', 'a null state read passes the gate')
  assert.equal(freezeClass({ ...OPEN, clientState: 'play', tickAgeMs: 2000 }).cls, 'lane-cold', 'the healthy play state passes the gate')
})

test('the zero-age pin: a just-ticked bot reads ticking-flat, never lane-cold', () => {
  const z = freezeClass({ ...OPEN, tickAgeMs: 0 })
  assert.equal(z.cls, 'ticking-flat', 'age 0 is the freshest possible tick - the loop is alive')
})

test('the wiring pins: the tracker is armed, the verdict consults the gates, the relog keeps its shape', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // the import rides the drowning block
  assert.ok(src.includes('frozenRelogDecision, freezeClass'), 'the classifier rides the drowning import')
  // the tracker: a dedicated physicsTick listener writes the heartbeat field
  assert.ok(src.includes("bot._lastPhysicsTickAt = Date.now()"), 'the heartbeat field is written')
  assert.ok((src.match(/bot\.on\('physicsTick'/g) || []).length >= 2, 'the tracker owns its own physicsTick listener')
  // the consult lives INSIDE the rate-limited stand-down block, after the
  // frozen-physics line (one diagnosis per logged verdict - the 19-bot law)
  const verdictIdx = src.indexOf('frozen physics (${frozenWindow} flat passes')
  assert.ok(verdictIdx > 0, 'the frozen verdict line found')
  const consultIdx = src.indexOf('const frz = freezeClass({')
  assert.ok(consultIdx > verdictIdx, 'the diagnosis consults after the verdict line')
  const bookIdx = src.indexOf('frozenDown = true', consultIdx)
  assert.ok(bookIdx > consultIdx, 'the bookkeeping follows the consult (byte-for-byte shape kept)')
  // the five gates ride the read (the source skip order, in the call)
  for (const gate of ['clientState', 'hasFiniteEntity', 'chunkLoaded', 'physicsEnabled', 'tickAgeMs']) {
    assert.ok(src.includes(`${gate}: (() => {`), `the ${gate} gate is read defensively`)
  }
  // the line names itself so the next mine can count the classes
  assert.ok(src.includes('freeze named ${frz.cls} - ${frz.why}'), 'the diagnosis line rides the verdict template')
  assert.ok(src.includes("tag} water: freeze named"), 'the line rides the water filter key')
  // the relog decision is untouched - the safe lane is the safe lane
  const decisionIdx = src.indexOf('frozenRelogDecision({')
  assert.ok(decisionIdx > bookIdx, 'the relog decision still follows the bookkeeping')
})
