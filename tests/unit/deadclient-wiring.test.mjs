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
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

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
