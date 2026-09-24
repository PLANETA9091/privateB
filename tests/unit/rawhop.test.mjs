// The RAW HOP WALK (v0.48.0): the end-phase A* saturation cure.
//
// Dispatch 35605960761 (v0.45.0+v0.46.0 first joint fleet): the heartbeat
// worker stayed healthy while the MAIN thread's reporter starved twice (50s +
// 209s) - 19 bots' bank chains each ran radius-48 A* hops on the OPEN yard
// platform, saturated the one node thread, and the server keepalive-kicked
// every bot (28 mid-run disconnects; 1.81 b/s vs the 6.53 best). The yard is
// a BUILT FLAT PLATFORM: the hop now walks RAW CONTROLS first (look + forward
// + step-jump, zero A*), and the pathfinder hop becomes the fallback.
import { test, beforeEach } from 'node:test'
import { resetDoomedGoalLedger, walkRetryPlan } from '../../src/lib/jobqueue.mjs'
import { isDeadChestVerdict } from '../../src/lib/nopath.mjs'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { rawHopEligible, walkRawToward, RAW_HOP_MAX_DIST, RAW_HOP_NETPROGRESS_MS, depositToChest, PROXIMATE_OPEN_DIST } from '../../src/lib/deposit.mjs'

const TYPES = new Map()
function item (name, count = 1) {
  if (!TYPES.has(name)) TYPES.set(name, TYPES.size + 1)
  return { name, count, type: TYPES.get(name) }
}

// A mock bot whose position ADVANCES toward the target on every look() call
// (speed blocks per look) - physics approximated, controls recorded.
function makeRawBot ({ pos = new Vec3(0.5, 74, 0.5), speed = 2.5, chest = null, gotoScript = [] } = {}) {
  const bot = {
    username: 'RawBot',
    entity: { position: pos.clone() },
    _target: chest ? chest.position : null,
    _speed: speed,
    _controls: {},
    _lookCalls: 0,
    setControlState: (name, v) => { bot._controls[name] = v },
    look: async () => {
      bot._lookCalls++
      if (bot._target && bot._speed > 0) {
        const d = bot.entity.position.distanceTo(bot._target)
        const step = Math.min(bot._speed, Math.max(0, d))
        const dir = bot._target.clone().subtract(bot.entity.position).normalize()
        bot.entity.position = bot.entity.position.add(dir.scale(step))
      }
    },
    inventory: { items: () => bot._items },
    _items: [item('cobblestone', 30)],
    findBlock: () => chest,
    gotoCalls: [],
    _gotoScript: gotoScript,
    pathfinder: {
      goto: async goal => {
        const step = bot.gotoCalls.length < bot._gotoScript.length
          ? bot._gotoScript[bot.gotoCalls.length]
          : bot._gotoScript[bot._gotoScript.length - 1]
        bot.gotoCalls.push(goal)
        if (step instanceof Error) throw step
      }
    },
    openChest: async () => ({
      deposit: async (type, meta, count) => { bot._items = bot._items.filter(i => i.type !== type) },
      close: () => { bot.closed = true }
    })
  }
  return bot
}

// The doomed-goal ledger (v0.72.0) is a module-level singleton in jobqueue.mjs
// (one process = one fleet). A dead verdict recorded by one test's walk must
// not refuse the next test's walks (the mocks reuse chest/furnace positions),
// so every test here starts from an empty ledger.
beforeEach(() => resetDoomedGoalLedger())

test('rawHopEligible: the gate is distance + the water-rescue owner', () => {
  assert.equal(rawHopEligible({ dist: 27 }), true, 'the F4 fleet case (d=27-30 hops)')
  assert.equal(rawHopEligible({ dist: RAW_HOP_MAX_DIST }), true, 'the boundary passes')
  assert.equal(rawHopEligible({ dist: RAW_HOP_MAX_DIST + 1 }), false, 'beyond the box -> pathfinder')
  assert.equal(rawHopEligible({ dist: null }), true, 'unknown distance passes - the walk decides')
  assert.equal(rawHopEligible({ dist: undefined }), true, 'junk-safe')
  assert.equal(rawHopEligible({ dist: 12, waterRescue: true }), false, 'a rescue owner never loses its controls')
  assert.equal(rawHopEligible({ waterRescue: false }), true, 'no dist at all still passes')
})

test('walkRawToward: straight line success, controls cleared in the finally', async () => {
  const target = new Vec3(8.5, 74, 2.5)
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 2.5 })
  bot._target = target
  const r = await walkRawToward(bot, target, { tickMs: 10, stallMs: 500, timeoutMs: 5000 })
  assert.equal(r.walked, true, 'the walk completes')
  assert.ok(r.d <= 3.2, `stops within reach (d=${r.d})`)
  assert.ok(bot._lookCalls >= 2, 'looked at the target more than once')
  assert.equal(bot._controls.forward, false, 'forward CLEARED after the walk - a leaked key walks into the sea')
  assert.equal(bot._controls.jump, false, 'jump cleared')
  assert.equal(bot._controls.sneak, false, 'sneak cleared')
})

test('walkRawToward: no progress stalls out honestly (and jumps the step first)', async () => {
  const target = new Vec3(6.5, 74, 0.5)
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 0 }) // a wall: no movement at all
  bot._target = target
  await assert.rejects(
    () => walkRawToward(bot, target, { tickMs: 50, stallMs: 300, timeoutMs: 5000 }),
    /raw walk stalled/,
    'the stall names itself for the log'
  )
  assert.equal(bot._controls.forward, false, 'controls cleared on the failure path too')
  assert.equal(bot._controls.jump, false, 'jump cleared (it fired during the stall, then cleared)')
  assert.ok(bot._controls._sawJump === undefined || bot._controls.jump === false, 'no leaked jump')
})

test('walkRawToward: slow-but-moving times out (the bounded-clock rule)', async () => {
  const target = new Vec3(60.5, 74, 0.5) // far beyond the timeout's reach
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 0.4 })
  bot._target = target
  await assert.rejects(
    () => walkRawToward(bot, target, { tickMs: 30, stallMs: 100000, timeoutMs: 400 }),
    /raw walk timeout/,
    'the timeout names itself'
  )
  assert.equal(bot._controls.forward, false, 'controls cleared on timeout')
})

// (v0.149.0) THE NET-PROGRESS FLOOR - movement is not approach.
// The run85 F3 shape (dispatch 36016062585): two raw hops burnt 20.3s + 15.2s
// ending at d=8.0/8.4 - the bot MOVED every tick (defeating the 2s stall gate)
// but never approached, and the 20s clock burnt the deposit slice twice.
test('walkRawToward: the jitter bot aborts at the net-progress floor (~8s, not the full clock)', async () => {
  const target = new Vec3(8.5, 74, 0.5) // d=8.0 along +x
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 0 })
  bot._target = target
  let flip = false
  bot.look = async () => {
    bot._lookCalls++
    flip = !flip
    // oscillate PERPENDICULAR to the target axis: every tick moves 0.8 (the
    // stall gate's 0.35 bar never fires) but the distance never improves
    bot.entity.position = new Vec3(0.5, 74, 0.5 + (flip ? 0.4 : -0.4))
  }
  let err = null
  const t0 = Date.now()
  try { await walkRawToward(bot, target, { tickMs: 20, stallMs: 100000, timeoutMs: 30000, netProgressMs: 400 }) } catch (e) { err = e }
  assert.ok(err, 'the walk aborted')
  assert.match(err.message, /no net progress/, 'the floor names itself')
  assert.match(err.message, /best d=8\.0/, 'the best distance is in the message for the log')
  assert.ok(Date.now() - t0 < 5000, `the abort cost ~400ms, not the 30s clock (spent ${Date.now() - t0}ms)`)
  assert.equal(bot._controls.forward, false, 'controls cleared on the abort')
  // the classification contract: NOT a retry class, NOT a ledger shape
  assert.doesNotMatch(err.message, /timeout after/, 'walkRetryPlan must not read it as a retry')
  assert.equal(walkRetryPlan({ error: err, attempt: 1, maxAttempts: 2 }).action, 'give-up', 'no deterministic re-issue of the identical goto')
  assert.equal(isDeadChestVerdict(err.message).dead, false, 'the verdict is the START\'s, not the chest cell\'s')
})

test('walkRawToward: a slow-but-APPROACHING walker is never punished by the floor', async () => {
  const target = new Vec3(4.5, 74, 0.5) // d=4.0 - a short approach
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 0.3 })
  bot._target = target
  const r = await walkRawToward(bot, target, { tickMs: 20, stallMs: 100000, timeoutMs: 30000, netProgressMs: 200 })
  assert.equal(r.walked, true, 'the approach completed')
  assert.ok(r.d <= 3.2, `stops within reach (d=${r.d})`)
})

test('walkRawToward: the stall gate still fires first for a zero-movement bot', async () => {
  const target = new Vec3(8.5, 74, 0.5)
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 0 })
  bot._target = target
  await assert.rejects(
    () => walkRawToward(bot, target, { tickMs: 20, stallMs: 300, timeoutMs: 30000, netProgressMs: 400 }),
    /raw walk stalled/,
    'zero movement stays the stall gate\'s class (2s, not the 8s floor)'
  )
})

test('walkRawToward: netProgressMs 0 disables the floor (the legacy shape byte for byte)', async () => {
  const target = new Vec3(8.5, 74, 0.5)
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 0 })
  bot._target = target
  await assert.rejects(
    () => walkRawToward(bot, target, { tickMs: 20, stallMs: 100000, timeoutMs: 300, netProgressMs: 0 }),
    /raw walk timeout/,
    'the legacy bounded-clock rule owns the walk when the floor is off'
  )
})

test('the net-progress constant and its default wiring', async () => {
  assert.equal(RAW_HOP_NETPROGRESS_MS, 8000, 'the floor is 8s - twice the stall gate, half a failed pathfinder think-cycle x2')
  // the default rides through: a jitter bot with NO netProgressMs option still aborts
  const target = new Vec3(8.5, 74, 0.5)
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 0 })
  bot._target = target
  let flip = false
  bot.look = async () => {
    bot._lookCalls++
    flip = !flip
    bot.entity.position = new Vec3(0.5, 74, 0.5 + (flip ? 0.4 : -0.4))
  }
  await assert.rejects(
    () => walkRawToward(bot, target, { tickMs: 10, stallMs: 100000, timeoutMs: 30000, netProgressMs: 100 }),
    /no net progress/,
    'the gate is live by default (overridable for tests)'
  )
})

test('walkRawToward: junk bot / junk target fails fast, controls still cleared', async () => {
  await assert.rejects(() => walkRawToward({}, new Vec3(1, 1, 1)), /no position/)
  const bot = makeRawBot({})
  await assert.rejects(() => walkRawToward(bot, null), /no position/)
})

test('walkOnce order: a raw-capable hop NEVER touches the pathfinder (zero A* on the yard)', async () => {
  const chest = { name: 'chest', position: new Vec3(12.5, 74, 0.5) }
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 3, chest })
  const r = await depositToChest(bot, { log: () => {}, timeoutMs: 30000 })
  assert.ok(r.deposited >= 1, 'the deposit landed')
  assert.equal(bot.gotoCalls.length, 0, 'ZERO pathfinder goals - the raw walk owned the hop')
  assert.ok(bot._lookCalls > 0, 'the raw walk actually ran')
})

test('walkOnce order: a stalled raw walk falls back to the pathfinder (semantics preserved)', async () => {
  const chest = { name: 'chest', position: new Vec3(9.5, 74, 0.5) }
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 0, chest })
  bot._gotoScript = ['ok']
  const lines = []
  const r = await depositToChest(bot, { log: m => lines.push(String(m)), timeoutMs: 30000 })
  assert.ok(r.deposited >= 1, 'the fallback lands the deposit')
  assert.equal(bot.gotoCalls.length, 1, 'the pathfinder hop ran as the fallback')
  assert.ok(lines.some(l => /raw hop failed: raw walk stalled/.test(l)), 'the raw failure names itself in the log')
})

test('walkOnce order: a net-progress-dead raw walk falls back to the pathfinder and lands (the run85 F3 cure)', async () => {
  // the F3 shape: d=8.0, the bot jitters in the crowded rows, the raw hop
  // aborts at the floor INSTEAD of burning 20s - and the pathfinder fallback
  // gets its slice and lands the deposit the old clock could never afford
  const chest = { name: 'chest', position: new Vec3(8.5, 74, 0.5) }
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 0, chest })
  let flip = false
  bot.look = async () => {
    bot._lookCalls++
    flip = !flip
    bot.entity.position = new Vec3(0.5, 74, 0.5 + (flip ? 0.4 : -0.4))
  }
  bot._gotoScript = ['ok']
  const lines = []
  const r = await depositToChest(bot, { log: m => lines.push(String(m)), timeoutMs: 30000, netProgressMs: 300 })
  assert.ok(r.deposited >= 1, 'the fallback lands the deposit')
  assert.equal(bot.gotoCalls.length, 1, 'the pathfinder hop ran as the fallback')
  assert.ok(lines.some(l => /raw hop failed: raw walk: no net progress/.test(l)), 'the abort names itself in the log')
})

test('walkOnce order: proximate chests skip the raw walk entirely (v0.46.0 rule intact)', async () => {
  const chest = { name: 'chest', position: new Vec3(2.5, 74, 0.5) }
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 3, chest })
  assert.ok(chest.position.distanceTo(bot.entity.position) <= PROXIMATE_OPEN_DIST, 'the mock stands proximate')
  const r = await depositToChest(bot, { log: () => {}, timeoutMs: 30000 })
  assert.ok(r.deposited >= 1, 'the deposit landed via the fast-path')
  assert.equal(bot._lookCalls, 0, 'no raw walk ran - openChest reach governs')
  assert.equal(bot.gotoCalls.length, 0, 'no pathfinder either')
})
