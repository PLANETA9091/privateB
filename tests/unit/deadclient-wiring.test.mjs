// The dead-client probe's wiring pins (v0.541.0).
//
// The 0.539.0 discovery (the scout's THE DEAD-CLIENT VERDICT) found the class:
// a kicked / ECONNRESET client never throws anywhere the runner can hear - the
// physics ticker is cleaned up on 'end', the protocol client's write()
// silently returns on a dead socket, the pathfinder's goal never advances, and
// every timeout lands in a QUIET per-leg catch. The scout got its loop-top
// probe in 0.539.0; the miner's shift loop burned its cooldowns to the
// deadline with zero 'attempt failed' and zero rebuilds - the v0.16.3
// reconnect catch never fired. This fire wires the SAME probe into the
// miner's own loop top. These pins read the WIRING side - the probe's dead-wire
// class is only catchable at the call site (the dusk wire's own precedent);
// the law itself is byte-shared with the scout's pins in scout.test.mjs.
//
// The 0.542.0 fire extends the class to the CRAFT chain: the pricing pass
// found the silent-craft seam (the 2x2 dance's window_click writes silently
// resolve on a dead socket - craft() returned a FALSE SUCCESS the storm brake
// never saw) and wired the gate at craft()'s entry - the same verdict byte,
// a refusal shape instead of a throw (the craft's callers already speak
// false). Pins below: the ONE gate site, the side-effect-free position
// (before the storm's lazy state write), the refusal voice, and the
// behavior test (a dead client refuses instantly, no state written).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { craft } from '../../src/bots/tools.mjs'

const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
const toolsSrc = readFileSync(new URL('../../src/bots/tools.mjs', import.meta.url), 'utf8')

test('REGRESSION PIN: the miner shift loop carries ONE dead-client probe (the loop top)', () => {
  const probes = fleetSrc.match(/if \(miner\.bot\._client\?\.ended\) throw new Error\('the session ended mid-shift \(the client\\'s own ended flag - the attempt rebuilds\)'\)/g) || []
  assert.equal(probes.length, 1, `ONE probe site - a second would be a copy, not a wire (got ${probes.length})`)
  assert.ok(fleetSrc.includes('if (miner.bot._client?.ended) throw'), 'the junk-safe optional chain - a mock bot has no _client and the loop walks')
})

test('REGRESSION PIN: the probe sits at the LOOP TOP, before the re-loot read (the burn bound)', () => {
  const probeAt = fleetSrc.indexOf('if (miner.bot._client?.ended) throw')
  const loopAt = fleetSrc.indexOf("while (!(Date.now() > deadline) && miner.bot.entity) {")
  const relootAt = fleetSrc.indexOf('(v0.201.0) THE RE-LOOT WALK')
  assert.ok(loopAt > 0 && probeAt > loopAt, 'the probe lives inside the shift loop')
  assert.ok(probeAt < relootAt, 'the probe reads BEFORE the re-loot read - one dead iteration bounds the burn, the re-loot gates never ride dead hands')
})

test('REGRESSION PIN: the deadline exit keeps its clean return (the check is inside the loop)', () => {
  // the while condition still owns the deadline - the probe must never turn a
  // deadline exit into a throw (a final bank on a dead client keeps its own
  // guarded refusals)
  assert.ok(fleetSrc.includes("while (!(Date.now() > deadline) && miner.bot.entity) {"), 'the loop condition untouched')
})

test('REGRESSION PIN: the scout keeps its own probe (the two laws share the class, not the site)', () => {
  const scoutSrc = readFileSync(new URL('../../src/bots/scout.mjs', import.meta.url), 'utf8')
  const scoutProbes = scoutSrc.match(/if \(bot\._client\?\.ended\) throw/g) || []
  assert.equal(scoutProbes.length, 1, 'the scout loop-top probe stands (the 0.539.0 byte)')
})

test('REGRESSION PIN: the craft gate carries ONE probe site (the 0.542.0 byte, junk-safe form)', () => {
  const gates = toolsSrc.match(/if \(bot\._client\?\.ended\) \{/g) || []
  assert.equal(gates.length, 1, `ONE gate site - a second would be a copy, not a wire (got ${gates.length})`)
  assert.ok(toolsSrc.includes('if (bot._client?.ended) {'), 'the junk-safe optional chain - a mock bot has no _client and the craft walks (the 0.539.0 precedent)')
})

test('REGRESSION PIN: the craft gate reads BEFORE the storm state write (the side-effect-free refusal)', () => {
  const gateAt = toolsSrc.indexOf('if (bot._client?.ended) {')
  const stormAt = toolsSrc.indexOf('const storm = stormOf(bot)')
  assert.ok(stormAt > 0, 'the lazy storm state write stands')
  assert.ok(gateAt > 0 && gateAt < stormAt, 'the refusal precedes stormOf - no _craftStorm is written on a dead client, the storm counter records craft weather, never socket weather')
})

test('REGRESSION PIN: the craft gate speaks the refusal voice (the silent write dance)', () => {
  assert.ok(toolsSrc.includes('refusing the silent write dance'), 'the dead-client refusal names its cause like the storm refusal does')
  assert.ok(toolsSrc.includes('THE SILENT-CRAFT GATE'), 'the seam doc block stands beside the wire')
})

test('BEHAVIOR: a dead client refuses the craft instantly (no dance, no state)', async () => {
  const lines = []
  const bot = { _client: { ended: true } }
  const ok = await craft(bot, 'oak_planks', 1, null, m => lines.push(m))
  assert.equal(ok, false, 'the client\'s own ended flag is the verdict - the false success is dead')
  assert.equal(lines.filter(l => l.includes('dead client')).length, 1, 'ONE refusal line names the cause')
  assert.equal(bot._craftStorm, undefined, 'no storm state was written - the refusal is side-effect-free')
})

test('BEHAVIOR: a live-shaped bot (no _client) walks past the gate (the junk-safe law)', async () => {
  // the probe must never hold a bot whose socket state it cannot read - a mock
  // bot has no _client, the optional chain reads undefined, the craft walks
  // (here it walks into the storm-free entry and refuses on the missing
  // registry - the honest no-op, NOT a dead-client refusal)
  const lines = []
  const bot = { registry: { itemsByName: {} } }
  const ok = await craft(bot, 'oak_planks', 1, null, m => lines.push(m))
  assert.equal(ok, false, 'the walk continues past the gate and dies on the missing registry')
  assert.equal(lines.filter(l => l.includes('dead client')).length, 0, 'no dead-client line - the gate never spoke for a readable-nothing bot')
  assert.ok(bot._craftStorm, 'the storm state WAS written past the gate - the junk walk reaches the real machinery')
})
