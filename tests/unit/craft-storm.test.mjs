// (v0.43.0) The craft-storm brake. Measured (F1, fleet 35572106504): after an
// ECONNRESET reconnect with the server still stalled, F1's crafts ALL timed out
// at the 7000ms fence - 6 back-to-back timeouts = 42s of hammering a server that
// never confirmed a single click. The brake: per-bot consecutive-timeout counter,
// exponential backoff between in-loop retries, and a cooldown that refuses new
// crafts after CRAFT_STORM_GIVE_UP consecutive timeouts (one probe craft after
// it elapses; a success resets the state; a reconnect resets it with the bot).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  craft, craftBackoffMs, craftStormVerdict, preflightClearWindow,
  CRAFT_STORM_GIVE_UP, CRAFT_STORM_BASE_MS, CRAFT_STORM_CAP_MS
} from '../../src/bots/tools.mjs'

const TYPES = new Map()
const item = name => ({ name, type: TYPES.has(name) ? TYPES.get(name) : TYPES.set(name, TYPES.size + 1).get(name) })

// A bot whose every craft never settles (the stalled-server shape) and whose
// window state is empty (currentWindow/inventory undefined -> the sweep and the
// recovery are no-ops, exactly like the real desynced corpse).
const stormBot = () => {
  const recipes = [{ delta: [item('oak_planks')] }, { delta: [item('oak_planks'), item('stick')] }]
  return {
    registry: { itemsByName: { stick: { id: 42 } } },
    recipesFor: () => recipes,
    craft: () => new Promise(() => {})
  }
}

test('craftBackoffMs: the exponential ladder doubles and caps', () => {
  assert.equal(craftBackoffMs({ consecutive: 1 }), 1000)
  assert.equal(craftBackoffMs({ consecutive: 2 }), 2000)
  assert.equal(craftBackoffMs({ consecutive: 3 }), 4000)
  assert.equal(craftBackoffMs({ consecutive: 4 }), 8000)
  assert.equal(craftBackoffMs({ consecutive: 9 }), CRAFT_STORM_CAP_MS, 'the ladder caps at 8s')
  assert.equal(craftBackoffMs({ consecutive: 0 }), 0)
  assert.equal(craftBackoffMs({ consecutive: -2 }), 0)
  assert.equal(craftBackoffMs({ consecutive: 'junk' }), 0)
  assert.equal(craftBackoffMs({}), 0)
  assert.equal(craftBackoffMs({ consecutive: 2, baseMs: 10 }), 20, 'the base is injectable for tests')
  assert.equal(craftBackoffMs({ consecutive: 20, baseMs: 10, capMs: 40 }), 40, 'the cap is injectable for tests')
})

test('craftBackoffMs: defaults live in the exported constants', () => {
  assert.equal(CRAFT_STORM_GIVE_UP, 3)
  assert.equal(CRAFT_STORM_BASE_MS, 1000)
  assert.equal(CRAFT_STORM_CAP_MS, 8000)
})

test('craftStormVerdict: below GIVE_UP everything is allowed', () => {
  const bot = stormBot()
  assert.deepEqual(craftStormVerdict(bot), { allowed: true, waitMs: 0, consecutive: 0 })
  bot._craftStorm = { consecutive: CRAFT_STORM_GIVE_UP - 1, cooldownUntil: 0 }
  assert.equal(craftStormVerdict(bot).allowed, true, '2 timeouts still craft')
})

test('craftStormVerdict: the cooldown refuses entry, then allows one probe', () => {
  const bot = stormBot()
  bot._craftStorm = { consecutive: CRAFT_STORM_GIVE_UP, cooldownUntil: 1000 }
  assert.deepEqual(craftStormVerdict(bot, { now: 500 }), { allowed: false, waitMs: 500, consecutive: 3 }, 'mid-cooldown')
  assert.equal(craftStormVerdict(bot, { now: 1000 }).allowed, true, 'the cooldown elapsed - a probe craft may run')
  assert.equal(craftStormVerdict(bot, { now: 2000 }).allowed, true, 'well past the cooldown')
  bot._craftStorm = { consecutive: 5, cooldownUntil: 1000 }
  assert.equal(craftStormVerdict(bot, { now: 500 }).waitMs > 0, true, 'deeper storms wait too')
})

test('craft storm: 3 timeout crafts abandon the item, arm the cooldown and bound the burn', async () => {
  const bot = stormBot()
  let calls = 0
  bot.craft = () => { calls++; return new Promise(() => {}) }
  const lines = []
  const t0 = Date.now()
  const ok = await craft(bot, 'stick', 1, null, l => lines.push(l), { timeoutMs: 50, stormBaseMs: 10 })
  const dt = Date.now() - t0
  assert.equal(ok, false)
  assert.equal(calls, 3, '3 timeout crafts, then the brake stops the dance (the old loop burned 4-6)')
  assert.equal(bot._craftStorm.consecutive, CRAFT_STORM_GIVE_UP, '3 consecutive timeouts state')
  assert.ok(bot._craftStorm.cooldownUntil > t0, 'the cooldown is armed in the future')
  assert.ok(dt < 5000, `bounded burn, took ${dt}ms (the unbraked storm was 42s+)`)
  const joined = lines.join('\n')
  assert.match(joined, /craft storm: 3 consecutive craft timeouts - cooldown 40ms/, 'the storm line names the cooldown')
  assert.match(joined, /variant#1 attempt0 failed: craft stick: timeout after 50ms/, 'per-attempt failure lines keep their shape')
})

test('craft storm: a cooldown in force refuses the next craft WITHOUT touching bot.craft', async () => {
  const bot = stormBot()
  let calls = 0
  bot.craft = () => { calls++; return new Promise(() => {}) }
  bot._craftStorm = { consecutive: CRAFT_STORM_GIVE_UP, cooldownUntil: Date.now() + 60000 }
  const lines = []
  const ok = await craft(bot, 'stick', 1, null, l => lines.push(l))
  assert.equal(ok, false)
  assert.equal(calls, 0, 'the brake refuses at entry - zero clicks land on the stalled server')
  assert.match(lines.join('\n'), /storm cooldown \d+ms left \(3 consecutive timeouts\) - refusing/)
})

test('craft storm: two timeouts then success - the retry spreads, the state resets', async () => {
  const bot = stormBot()
  let calls = 0
  bot.craft = () => {
    calls++
    return calls >= 3 ? Promise.resolve() : new Promise(() => {}) // v0a0, v0a1 stall; v1a0 lands
  }
  const lines = []
  const t0 = Date.now()
  const ok = await craft(bot, 'stick', 1, null, l => lines.push(l), { timeoutMs: 50, stormBaseMs: 10 })
  const dt = Date.now() - t0
  assert.equal(ok, true)
  assert.equal(calls, 3)
  assert.equal(bot._craftStorm.consecutive, 0, 'a landed craft resets the storm')
  assert.equal(bot._craftStorm.cooldownUntil, 0)
  assert.ok(dt >= 30, `the backoff sleeps actually happened (${dt}ms)`)
})

test('craft storm: a probe craft after the cooldown re-arms a deeper cooldown on timeout', async () => {
  const bot = stormBot()
  bot._craftStorm = { consecutive: CRAFT_STORM_GIVE_UP, cooldownUntil: 0 } // elapsed - probe allowed
  const lines = []
  const t0 = Date.now()
  const ok = await craft(bot, 'stick', 1, null, l => lines.push(l), { timeoutMs: 50, stormBaseMs: 10 })
  assert.equal(ok, false)
  assert.equal(bot._craftStorm.consecutive, CRAFT_STORM_GIVE_UP + 1, 'the probe timeout deepens the counter')
  assert.ok(bot._craftStorm.cooldownUntil > t0, 'a fresh, deeper cooldown is armed')
  assert.match(lines.join('\n'), /craft storm: 4 consecutive craft timeouts - cooldown 80ms/)
})

// (v0.122.0) THE PRE-FLIGHT. run106 (35907836654): F7's craft lane died for the
// whole run (3 -> 4 -> 5 consecutive timeouts on HAND recipes) while the server
// was demonstrably alive - the dance hung on a stale window that the recovery
// only closed AFTER the failure. The pre-flight closes it BEFORE the dance.

test('craft pre-flight: a real stale window is closed BEFORE the dance', async () => {
  const bot = stormBot()
  bot.craft = () => Promise.resolve()
  const closes = []
  bot.currentWindow = { type: 'minecraft:chest' }
  bot.closeWindow = w => closes.push(w.type)
  const lines = []
  const ok = await craft(bot, 'stick', 1, null, l => lines.push(l))
  assert.equal(ok, true)
  assert.deepEqual(closes, ['minecraft:chest'], 'the stale window closed before the dance')
  assert.match(lines.join('\n'), /craft: pre-flight cleared stale minecraft:chest window/)
})

test('craft pre-flight: a clean lane is a strict no-op (no close, no line)', async () => {
  const bot = stormBot()
  bot.craft = () => Promise.resolve()
  let closes = 0
  bot.closeWindow = () => { closes++ }
  const lines = []
  const ok = await craft(bot, 'stick', 1, null, l => lines.push(l))
  assert.equal(ok, true)
  assert.equal(closes, 0, 'nothing to close - the craft ran without touching windows')
  assert.doesNotMatch(lines.join('\n'), /pre-flight/, 'no pre-flight line on a clean lane')
})

test('craft pre-flight: the F7 healing shape - a poisoned lane heals on the FIRST probe', async () => {
  const bot = stormBot()
  bot._craftStorm = { consecutive: CRAFT_STORM_GIVE_UP, cooldownUntil: 0 } // probe allowed
  bot.craft = () => Promise.resolve() // the dance lands on the cleaned state
  const closes = []
  bot.currentWindow = { type: 'minecraft:inventory' }
  bot.closeWindow = w => closes.push(w.type)
  const lines = []
  const ok = await craft(bot, 'stick', 1, null, l => lines.push(l))
  assert.equal(ok, true, 'the probe craft LANDED - the lane healed instead of re-arming')
  assert.deepEqual(closes, ['minecraft:inventory'])
  assert.equal(bot._craftStorm.consecutive, 0, 'a landed probe resets the storm')
  assert.equal(bot._craftStorm.cooldownUntil, 0, 'no deeper cooldown armed')
})

test('craft pre-flight: a cooldown refusal stays side-effect-free (no close)', async () => {
  const bot = stormBot()
  bot._craftStorm = { consecutive: CRAFT_STORM_GIVE_UP, cooldownUntil: Date.now() + 60000 }
  bot.craft = () => Promise.resolve()
  let closes = 0
  bot.currentWindow = { type: 'minecraft:chest' }
  bot.closeWindow = () => { closes++ }
  const lines = []
  const ok = await craft(bot, 'stick', 1, null, l => lines.push(l))
  assert.equal(ok, false)
  assert.equal(closes, 0, 'the refusal closes no window - zero side effects')
})

test('craft pre-flight: junk-safe - a throwing accessor or close never kills the craft', async () => {
  const bot = stormBot()
  bot.craft = () => Promise.resolve()
  bot.currentWindow = new Proxy({}, { get () { throw new Error('window corpse') } })
  const lines = []
  const ok1 = await craft(bot, 'stick', 1, null, l => lines.push(l))
  assert.equal(ok1, true, 'a throwing window accessor flows - the dance proceeds')
  const bot2 = stormBot()
  bot2.craft = () => Promise.resolve()
  bot2.currentWindow = { type: 'minecraft:chest' }
  bot2.closeWindow = () => { throw new Error('close corpse') }
  const ok2 = await craft(bot2, 'stick', 1, null, l => lines.push(l))
  assert.equal(ok2, true, 'a throwing close flows - the dance proceeds')
})

test('craft pre-flight: the exported helper returns the verdict shape directly', () => {
  const bot = { currentWindow: { type: 'minecraft:chest' }, closeWindow: () => {} }
  assert.equal(preflightClearWindow(bot), true)
  const clean = { currentWindow: null, closeWindow: () => { throw new Error('never') } }
  assert.equal(preflightClearWindow(clean), false, 'a clean lane returns false without closing')
  assert.equal(preflightClearWindow({}), false, 'no window state at all -> false')
})
