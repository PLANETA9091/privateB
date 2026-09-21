// (v0.45.0) The hop search budget. MEASURED (dispatch 35599777909, v0.43.0+
// v0.44.0, NORMAL END, mined=3919): the palette rule opened the warehouse and
// 304 hops STILL failed - 159x 'Took to long to decide path to goal!', 102x
// 'No path to the goal!' - because the miner's global pathfinder budget
// (searchRadius=32, thinkTimeout=2000) is tuned for tunnels, and the warehouse
// spans +-26 blocks of the yard (a bot at the yard edge stands 40+ blocks from
// the far chest row: the goal is OUTSIDE the 32-block search box, 'No path' by
// construction). The cure: hopReachable skips chests the search box can never
// reach (nearest-first scan means one miss = all miss), and withHopPathfinder
// runs the hop walk under a temporary wider budget (48 / 4500ms), restored in
// a finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hopReachable, withHopPathfinder, HOP_SEARCH_RADIUS, HOP_THINK_TIMEOUT_MS, PROXIMATE_OPEN_DIST, STALE_VIEW_MIN_UNITS, STALE_VIEW_SETTLE_MS, STALE_VIEW_WINDOW_MS } from '../../src/lib/deposit.mjs'

test('hopReachable: the boundary and the junk contract', () => {
  assert.equal(hopReachable(0), true, 'at the chest')
  assert.equal(hopReachable(26), true, 'a yard-center hop')
  assert.equal(hopReachable(HOP_SEARCH_RADIUS), true, 'exactly at the radius passes (<=)')
  assert.equal(hopReachable(HOP_SEARCH_RADIUS + 0.5), false, 'beyond the radius is hopeless')
  assert.equal(hopReachable(40), true, 'the F2 evidence distance (40 blocks) is reachable under the widened 48 budget')
  assert.equal(hopReachable(50), false, 'but past the widened budget the skip takes over')
  assert.equal(hopReachable(null), true, 'unknown distance - let the walk decide')
  assert.equal(hopReachable(NaN), true)
  assert.equal(hopReachable(undefined), true)
  assert.equal(hopReachable('30'), true, 'numeric strings coerce')
  assert.equal(hopReachable(Infinity), true, 'non-finite distances are the unknown class - the walk decides')
})

test('hopReachable: a custom radius overrides the default', () => {
  assert.equal(hopReachable(40, 48), true)
  assert.equal(hopReachable(40, 32), false)
  assert.equal(hopReachable(10, 0), true, 'junk radius falls back to HOP_SEARCH_RADIUS')
  assert.equal(hopReachable(10, NaN), true)
})

test('constants: the hop budget sits between the tunnel tuning and the unbounded OOM zone', () => {
  assert.equal(HOP_SEARCH_RADIUS, 48, 'wider than the miner global 32, still bounded')
  assert.ok(HOP_THINK_TIMEOUT_MS >= 4000 && HOP_THINK_TIMEOUT_MS <= 6000, 'the think window absorbs CPU starvation without hanging the walk')
})

test('withHopPathfinder: widens for the walk and restores on resolve', async () => {
  const pf = { searchRadius: 32, thinkTimeout: 2000 }
  const bot = { pathfinder: pf }
  let seen = null
  const out = await withHopPathfinder(bot, () => {
    seen = { r: pf.searchRadius, t: pf.thinkTimeout }
    return 'ok'
  })
  assert.equal(out, 'ok')
  assert.deepEqual(seen, { r: HOP_SEARCH_RADIUS, t: HOP_THINK_TIMEOUT_MS }, 'the walk ran under the hop budget')
  assert.equal(pf.searchRadius, 32, 'the tunnel radius is restored')
  assert.equal(pf.thinkTimeout, 2000, 'the think timeout is restored')
})

test('withHopPathfinder: the budget is restored on reject too (the finally path)', async () => {
  const pf = { searchRadius: 32, thinkTimeout: 2000 }
  const bot = { pathfinder: pf }
  await assert.rejects(
    withHopPathfinder(bot, async () => {
      assert.equal(pf.searchRadius, HOP_SEARCH_RADIUS, 'widened when the walk starts')
      throw new Error('No path to the goal!')
    }),
    /No path/
  )
  assert.equal(pf.searchRadius, 32, 'restored even after the walk failed')
  assert.equal(pf.thinkTimeout, 2000)
})

test('withHopPathfinder: a bot without a pathfinder (or junk fields) runs as-is', async () => {
  assert.equal(await withHopPathfinder({}, () => 'bare'), 'bare')
  assert.equal(await withHopPathfinder(null, () => 'null-bot'), 'null-bot')
  const pf = {} // junk pathfinder: assignment may work or throw, restore must not crash
  const bot = { pathfinder: pf }
  assert.equal(await withHopPathfinder(bot, () => 'junk'), 'junk')
  assert.ok('searchRadius' in pf || pf.searchRadius === undefined, 'no crash either way')
})

// ---------------------------------------------------------------------------
// (v0.46.0) THE PROXIMITY FAST-PATH + THE STALE-VIEW GUARD (their 19:53 sketch
// items 1+4, fleet 35599777909: 10/19 bots refused 'nothing to deposit' with
// 43-337 units in pocket - the desynced window view strikes the DEPOSIT
// DECISION; F6 hopped 8 warehouse chests from arm's reach and burned the
// decision clock on every one).
import { depositToChests } from '../../src/lib/deposit.mjs'

test('v0.46.0 constants: the probe thresholds sit in sane bands', () => {
  assert.equal(PROXIMATE_OPEN_DIST, 4, 'inside openChest reach (~4.5), outside goal-near noise')
  assert.ok(STALE_VIEW_MIN_UNITS >= 16 && STALE_VIEW_MIN_UNITS <= 48, 'full enough that KEEP cannot explain it, small enough to fire on real pockets')
  assert.ok(STALE_VIEW_SETTLE_MS >= 200 && STALE_VIEW_SETTLE_MS <= 1500, 'the resync settle mirrors the craft path')
})

test('v0.46.0 chain: the stale-view probe resyncs, the proximity fast-path skips the walk, the deposit lands', async () => {
  const chest = { name: 'chest', position: { x: 0, y: 64, z: 0, floored: () => ({ x: 0, y: 64, z: 0 }) } }
  let items = [] // the STALE view: the pocket reads empty (the '[empty]' flip)
  let probed = false
  const bot = {
    username: 'T',
    entity: { position: { x: 2, y: 64, z: 2, distanceTo: () => 3 } },
    inventory: { items: () => items },
    // the memo remembers the last good read: a full pocket 5s ago
    _bankableMemo: { units: 30, at: Date.now() - 5000 },
    findBlock: ({ matching }) => (matching(chest) ? chest : null),
    openChest: async () => {
      if (!probed) {
        probed = true
        return { close: () => { items = [{ name: 'cobblestone', count: 30, type: 7 }] } } // the resync
      }
      return { close: () => {}, deposit: async () => { items = [] } } // the transfer
    },
    pathfinder: { searchRadius: 32, thinkTimeout: 2000 }
  }
  const lines = []
  const res = await depositToChests(bot, { maxChests: 1, log: l => lines.push(l), yardCenter: { x: 0, y: 64, z: 0 } })
  assert.equal(res.deposited, 30, 'the re-synced pocket deposited')
  assert.equal(res.chestsUsed, 1)
  assert.ok(lines.some(l => /stale-view probe/.test(l)), 'the probe line prints')
  assert.equal(probed, true, 'the probe opened exactly one window before the chain')
  assert.equal(bot.pathfinder.searchRadius, 32, 'the hop budget was restored (no walk ever ran: proximate)')
})

test('v0.46.0 guard: a STALE memo (window elapsed) does not probe', async () => {
  let opens = 0
  const bot = {
    username: 'T3',
    _bankableMemo: { units: 200, at: Date.now() - STALE_VIEW_WINDOW_MS - 1000 },
    entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 3 } },
    inventory: { items: () => [] },
    findBlock: () => { opens++; return null },
    openChest: async () => { opens++; return { close: () => {} } }
  }
  const res = await depositToChests(bot, { maxChests: 1, log: () => {}, yardCenter: null })
  assert.deepEqual(res.chestReport, ['nothing to deposit'])
  assert.equal(opens, 0, 'an old memo is not evidence - no probe window')
})

test('v0.46.0 guard: an honest empty pocket (raw 0) refuses WITHOUT any probe', async () => {
  let opens = 0
  const bot = {
    username: 'T2',
    entity: { position: { x: 0, y: 64, z: 0, distanceTo: () => 5 } },
    inventory: { items: () => [] },
    findBlock: () => null,
    openChest: async () => { opens++; return { close: () => {} } }
  }
  const res = await depositToChests(bot, { maxChests: 1, log: () => {}, yardCenter: null })
  assert.equal(res.deposited, 0)
  assert.deepEqual(res.chestReport, ['nothing to deposit'])
  assert.equal(opens, 0, 'no chest, no raw units - no probe window')
})
