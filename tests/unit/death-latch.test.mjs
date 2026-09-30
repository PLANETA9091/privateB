// v0.374.0 THE DEATH LATCH - the posthumous completion is impossible.
// MEASURED (face 36760275928, mined 2026-10-01): F11's rescue swam 42+ passes
// bobbing at a shore that read 'hit' but never 'land' (r oscillated 1-2, o2
// healthy - the stationary target the hound needed), a Drowned killed the bot
// mid-rescue ('died - respawning (was slain by Drowned)', line 3633), and the
// finally ran 13 seconds later - by which time the RESPAWN had reset health
// to 20 and the spawn cell read dry, so the verdict closed
// 'rescue complete in 25.1s' (line 3646) AFTER the bot was dead. The ledger's
// dead class (/water: rescue aborted \(dead/) never saw the episode; the
// complete class inflated and the hound's kill window rode invisible. The
// v0.62.0 lesson fixed the HAZARD CELL for this exact respawn race but left
// the VERDICT racing. The cure: the death EVENT latches (it fires at the
// death moment, before any respawn), the latch breaks the loop, and the
// pure verdict gate reads the latch FIRST.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rescueEndVerdict } from '../../src/lib/drowning.mjs'
import { rescueEndClass } from '../../src/lib/rescue-ledger.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const minerSrc = readFileSync(join(here, '../../src/bots/miner.mjs'), 'utf8')

const LATCH_DONE = 'aborted (dead mid-rescue - the hazard stays at the death spot)'

test('deathLatch: the latch outranks every legacy branch - including the respawned health read', () => {
  // THE F11 SHAPE: death fired mid-rescue, the respawn reset health to 20,
  // the spawn cell reads dry - the legacy ladder called this 'complete'.
  assert.equal(rescueEndVerdict({ diedMidRescue: true, hasEntity: true, health: 20, feetWet: false, headWet: false }),
    LATCH_DONE, 'the posthumous completion is impossible: respawned health 20 + dry spawn still ends dead')
  assert.equal(rescueEndVerdict({ diedMidRescue: true, standingWet: true }), LATCH_DONE,
    'the latch outranks the standing-wet policy')
  assert.equal(rescueEndVerdict({ diedMidRescue: true, releasedSafe: true }), LATCH_DONE,
    'the latch outranks the release')
  assert.equal(rescueEndVerdict({ diedMidRescue: true, frozenDown: true }), LATCH_DONE,
    'the latch outranks the frozen stand-down')
  assert.equal(rescueEndVerdict({ diedMidRescue: true, feetWet: true, headWet: true, passNo: 42, standingProbes: 0, tail: 'wet/wet/wet' }),
    LATCH_DONE, 'the latch outranks the timeout (a dead bot burns no budget)')
  assert.equal(rescueEndVerdict({ diedMidRescue: true, hasEntity: false }), LATCH_DONE,
    'the latch outranks bot-gone (the death event is the stronger truth - the vanished entity is its consequence)')
})

test('deathLatch: the legacy ladder rides byte-identical below the latch', () => {
  // Every shape the inline ladder ever printed, verbatim (the field's
  // history lives in these strings - the mining surface and the ledger
  // regexes read them).
  assert.equal(rescueEndVerdict({ hasEntity: false }), 'aborted (bot gone)')
  assert.equal(rescueEndVerdict({ health: 0 }), 'aborted (dead - the hazard stays at the death spot)')
  assert.equal(rescueEndVerdict({ health: -1 }), 'aborted (dead - the hazard stays at the death spot)')
  assert.equal(rescueEndVerdict({ standingWet: true }), 'complete (standing wet - shallow water is not drowning)')
  assert.equal(rescueEndVerdict({ releasedSafe: true }), 'released (surface-safe, open water - no land known; the walk gate reopens)')
  assert.equal(rescueEndVerdict({ frozenDown: true }), 'standing down (frozen physics - the walk gate reopens, the reconnect lane owns a dead client)')
  assert.equal(rescueEndVerdict({}), 'complete')
  assert.equal(rescueEndVerdict({ feetWet: true, headWet: false }), 'timeout (still wet, 0 passes, 0 probes, tail dry/dry/dry)')
  assert.equal(rescueEndVerdict({ feetWet: true, headWet: true, passNo: 14, standingProbes: 0, tail: 'dry/dry/dry' }),
    'timeout (still wet, 14 passes, 0 probes, tail dry/dry/dry)', 'the F10 timeout shape rides verbatim')
})

test('deathLatch: junk never invents a death and junk never hides one', () => {
  for (const junk of [undefined, null, NaN, 0, 'yes']) {
    assert.equal(rescueEndVerdict({ diedMidRescue: junk }).includes('aborted (dead mid-rescue'), false,
      `junk latch ${String(junk)} reads false - the legacy ladder owns the verdict (the gates-decide convention)`)
  }
  assert.equal(rescueEndVerdict({ diedMidRescue: 'true' }), 'complete',
    'ONLY the boolean true latches - a truthy string is a wiring sickness, not a death (the strict-equality latch)')
  for (const junk of [undefined, null, NaN]) {
    assert.equal(rescueEndVerdict({ health: junk, feetWet: false }), 'complete',
      `junk health ${String(junk)} reads alive (the legacy ?? 20 shape)`)
  }
})

test('deathLatch: the ledger absorbs the latched end verbatim (no ledger change)', () => {
  const before = 'F11 [F11] water: rescue complete in 25.1s'
  assert.equal(rescueEndClass(before), 'complete', 'the before-picture: F11\'s posthumous line classified complete')
  const after = 'F11 [F11] water: rescue aborted (dead mid-rescue - the hazard stays at the death spot) in 25.1s'
  assert.equal(rescueEndClass(after), 'dead', 'the after-picture: the latched line lands in the ledger\'s dead class')
})

test('deathLatch: the wiring pins - the event latches, the loop breaks, the gate reads first', () => {
  assert.ok(minerSrc.includes('let diedMidRescue = false'), 'the latch is declared per-rescue (a fresh death per episode)')
  assert.ok(minerSrc.includes("const onRescueDeath = () => { diedMidRescue = true }"), 'the death EVENT sets the latch (the respawn cannot undo it)')
  assert.ok(minerSrc.includes("bot.on('death', onRescueDeath)"), 'the listener arms at rescue start')
  assert.ok(minerSrc.includes("bot.off('death', onRescueDeath)"), 'the listener disarms in the finally (no per-rescue listener leak)')
  assert.ok(minerSrc.includes('if (diedMidRescue || (bot.health ?? 20) <= 0) break'),
    'the loop-top breaks on the latch (a respawned client never swims posthumously)')
  const call = minerSrc.indexOf('rescueEndVerdict({')
  assert.ok(call >= 0, 'the verdict call site exists')
  const slice = minerSrc.slice(call, call + 500)
  assert.ok(slice.includes('diedMidRescue,'), 'the latch rides the verdict call')
  assert.ok(slice.includes('hasEntity: !!bot.entity'), 'the entity read rides the call')
  assert.ok(slice.includes("tail: rescueReads.slice(-3).map(r => r.wet ? 'wet' : 'dry').join('/')"),
    'the tail triple rides the call (the timeout line\'s shape)')
  assert.ok(minerSrc.includes('? { feetWet: false, headWet: false }'),
    'the world reads stay lazy - the latch/dead/frozen/standdown exits never sample water')
})
