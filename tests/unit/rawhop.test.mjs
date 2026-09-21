// The RAW HOP WALK (v0.48.0): the end-phase A* saturation cure.
//
// Dispatch 35605960761 (v0.45.0+v0.46.0 first joint fleet): the heartbeat
// worker stayed healthy while the MAIN thread's reporter starved twice (50s +
// 209s) - 19 bots' bank chains each ran radius-48 A* hops on the OPEN yard
// platform, saturated the one node thread, and the server keepalive-kicked
// every bot (28 mid-run disconnects; 1.81 b/s vs the 6.53 best). The yard is
// a BUILT FLAT PLATFORM: the hop now walks RAW CONTROLS first (look + forward
// + step-jump, zero A*), and the pathfinder hop becomes the fallback.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import { rawHopEligible, walkRawToward, RAW_HOP_MAX_DIST, depositToChest, PROXIMATE_OPEN_DIST } from '../../src/lib/deposit.mjs'

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

test('walkOnce order: proximate chests skip the raw walk entirely (v0.46.0 rule intact)', async () => {
  const chest = { name: 'chest', position: new Vec3(2.5, 74, 0.5) }
  const bot = makeRawBot({ pos: new Vec3(0.5, 74, 0.5), speed: 3, chest })
  assert.ok(chest.position.distanceTo(bot.entity.position) <= PROXIMATE_OPEN_DIST, 'the mock stands proximate')
  const r = await depositToChest(bot, { log: () => {}, timeoutMs: 30000 })
  assert.ok(r.deposited >= 1, 'the deposit landed via the fast-path')
  assert.equal(bot._lookCalls, 0, 'no raw walk ran - openChest reach governs')
  assert.equal(bot.gotoCalls.length, 0, 'no pathfinder either')
})
