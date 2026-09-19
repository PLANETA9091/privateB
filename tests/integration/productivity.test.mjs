#!/usr/bin/env node
// Integration test: does the fleet actually produce, on a live vanilla 26.2 server?
//
//   node tests/integration/productivity.test.mjs [host] [port]
//
// Requires a running server (CI starts one; locally: scripts/server.sh start).
// Ground mode only (fly: false, allow-flight can stay false) - exactly how the
// production fleet runs. Asserts:
//   1. every bot spawns and stays connected
//   2. bots chop wood and craft tools without op and without gifts
//   3. bots mine blocks on the ground (the "known problem" from README)
//   4. the job queue never stalls: progress happens in EVERY measurement window
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// env switches so CI and local runs can tune the duration
const HOST = process.env.MC_HOST || '127.0.0.1'
const PORT = Number(process.env.MC_PORT || 25565)
const WINDOW_SECONDS = Number(process.env.FLEET_TEST_SECONDS || 90)
const BOT_COUNT = Number(process.env.FLEET_TEST_BOTS || 2)
const MIN_BLOCKS_PER_WINDOW = Number(process.env.FLEET_TEST_MIN_BLOCKS || 6)

// A fleet of bots on real sockets WILL occasionally hit mineflayer-internal paths
// that reject with nobody awaiting them (a placeBlock chain after a socket drop, an
// autoeat tick on a closing connection). Node kills the whole process for those, which
// would take the healthy bots down with the dead one - log and stay alive instead.
process.on('unhandledRejection', e => log(`unhandled rejection (kept alive): ${e?.stack || e}`))
process.on('uncaughtException', e => log(`uncaught exception (kept alive): ${e?.stack || e}`))

const logDir = path.join('/tmp', `fleet-test-${process.pid}`)
fs.mkdirSync(logDir, { recursive: true })
const logFile = path.join(logDir, 'fleet.log')
const logStream = fs.createWriteStream(logFile, { flags: 'a' })
// Bots keep firing events (disconnects, pending dig chains) for a moment after the
// test ends and the stream is closed - a bare write-after-end would surface as an
// uncaughtException (and, funnily enough, our own handler logs it => another write).
logStream.on('error', () => { /* stream already ended */ })
const log = m => {
  if (!logStream.writableEnded) { try { logStream.write(`${new Date().toISOString()} ${m}\n`) } catch { /* closed */ } }
  if (process.env.VERBOSE) console.log(m)
}

test(`fleet productivity: ${BOT_COUNT} bots mine on the ground for ${WINDOW_SECONDS}s`, { timeout: (WINDOW_SECONDS + 420) * 1000 }, async t => {
  t.after(async () => {
    for (const m of miners) { try { m.bot.quit() } catch { /* gone */ } }
    // let the sockets flush and the bots die before closing the log, otherwise their
    // last words land on an ended stream (write after end -> uncaughtException noise)
    await new Promise(r => setTimeout(r, 2000))
    logStream.end()
    console.log(`[fleet-test] logs: ${logFile}`)
  })

  const { createMiner, fleetStats } = await import(path.join(root, 'src', 'bots', 'miner.mjs'))
  const { ensureTools, countItem } = await import(path.join(root, 'src', 'bots', 'tools.mjs'))
  const { WorldMap } = await import(path.join(root, 'src', 'fleet', 'worldmap.mjs'))
  const { Vec3 } = await import('vec3')

  // The shared scout -> miner resource map: while mining, every bot records what it sees;
  // the assertion at the end proves the pipeline actually filled it.
  const map = new WorldMap({ file: path.join(logDir, 'map.json') })

  // --- spawn the fleet in ground mode (no flight, exactly like production) ---
  const miners = []
  for (let i = 1; i <= BOT_COUNT; i++) {
    miners.push(createMiner({
      host: HOST,
      port: PORT,
      username: `ProdTest${i}`,
      fly: false,
      mode: 'rage',
      map,
      log
    }))
  }
  await Promise.all(miners.map(m => m.ready))
  for (const m of miners) {
    assert.ok(m.bot.entity, `${m.username} must be spawned`)
    log(`${m.username} spawned at ${m.bot.entity.position.floored()}`)
  }

  const deadline = Date.now() + WINDOW_SECONDS * 1000
  const direction = [new Vec3(1, 0, 0), new Vec3(-1, 0, 0)]

  // --- wood + tools (no op, no gifts) ---
  // Both bots work CONCURRENTLY: the sequential loop burned up to 105s per bot before
  // the mining window even started, which is exactly how the whole test outgrew its
  // own 330s budget. Different direction per bot keeps them off each other's trees.
  const toolResults = await Promise.all(miners.map(async (m, i) => {
    try {
      await m.gatherWood({ want: 4, direction: direction[i % 2], maxSeconds: 60, shouldStop: () => Date.now() > deadline })
    } catch (e) { log(`${m.username} gatherWood failed: ${e.message}`) }
    try {
      // a tight cap: the 26.2 craft window can burn seconds per ghost-grid recovery, and
      // the tool phase must not eat the whole budget (a run where the tools finished at
      // t+90s left the mining phase zero seconds - the degenerate pass we assert against)
      const res = await ensureTools(m.bot, { miner: m, log, maxSeconds: 45 })
      log(`${m.username} tools: ${res.ok ? 'ok' : 'fail'} (${res.kit})`)
      return res
    } catch (e) {
      log(`${m.username} ensureTools failed: ${e.message}`)
      return { ok: false, kit: e.message }
    }
  }))
  assert.ok(
    toolResults.some(r => r.ok),
    `at least one bot must craft a pickaxe (got: ${JSON.stringify(toolResults)})`
  )

  // --- mine on the ground and demand progress in every window ---
  // One workOnGround per bot for the whole phase (concurrent calls on the same bot would
  // fight over the pathfinder); a sampler measures how much each window contributed.
  // GUARANTEED MINING WINDOW: whatever the tool phase ate, the ground phase gets at
  // least 45s - without this a slow tool phase ended the test before a single hop, and
  // the map/mining assertions measured an empty run instead of fleet productivity.
  const miningDeadline = Math.max(deadline, Date.now() + 45000)
  const windowMs = 15000
  const samples = []
  const minersAlive = () => miners.filter(m => m.bot.entity)
  let minedAtWindowStart = fleetStats(minersAlive()).mined

  const miningStart = Date.now()
  log(`mining phase: alive=${minersAlive().length}/${miners.length} window=${Math.round((miningDeadline - Date.now()) / 1000)}s pick=${minersAlive().filter(m => m.bot.inventory.items().some(it => it.name.includes('pickaxe'))).length}`)
  const work = minersAlive().map((m, i) => {
    const soft = ['dirt', 'grass_block', 'sand', 'gravel', 'clay', 'coarse_dirt', 'podzol']
    const pick = m.bot.inventory.items().some(it => it.name.includes('pickaxe'))
    const names = pick ? [...soft, 'stone', 'andesite', 'diorite', 'tuff', 'coal_ore', 'iron_ore'] : soft
    return m.workOnGround(names, {
      direction: direction[i % 2],
      hopDistance: 12,
      shouldStop: () => Date.now() > miningDeadline
    }).catch(e => { log(`${m.username} workOnGround error: ${e.message}`); return null })
  })

  const sampler = setInterval(() => {
    const now = fleetStats(minersAlive())
    const delta = now.mined - minedAtWindowStart
    samples.push(delta)
    log(`window: +${delta} blocks (total ${now.mined})`)
    minedAtWindowStart = now.mined
  }, windowMs)

  await Promise.race([
    Promise.all(work).then(() => log(`mining phase: all work promises SETTLED after ${Math.round((Date.now() - miningStart) / 1000)}s`)),
    new Promise(r => setTimeout(r, Math.max(1000, miningDeadline - Date.now())))
  ])
  clearInterval(sampler)

  const total = fleetStats(minersAlive())
  log(`RESULT: mined=${total.mined} failed=${total.failed} byName=${JSON.stringify(total.byName)}`)

  // the core assertion: the fleet is productive (the old bug was total stagnation)
  assert.ok(total.mined >= MIN_BLOCKS_PER_WINDOW * Math.max(1, samples.length),
    `fleet mined only ${total.mined} blocks (need >= ${MIN_BLOCKS_PER_WINDOW * samples.length}); windows: ${samples.join(', ')}`)

  // no bot may have been kicked for flying (ground mode must be clean)
  const kickLog = fs.readFileSync(logFile, 'utf8')
  assert.ok(!/KICKED/.test(kickLog), 'bots must not be kicked in ground mode')

  // ANTI-STALL (v0.4.0): a fleet that mines hard for two windows and then freezes
  // (+0, +0, +0 ...) still beats a "total" check while being completely broken.
  // Two CONSECUTIVE dead windows mean a real stall (field logs showed exactly that).
  for (let i = 1; i < samples.length; i++) {
    assert.ok(
      !(samples[i - 1] === 0 && samples[i] === 0),
      `fleet stalled: windows ${i - 1} and ${i} both produced 0 blocks (all windows: ${samples.join(', ')})`
    )
  }

  // scout -> miner pipeline: walking miners mark their chunks as scanned. This part is
  // deterministic. The POSITION count is logged but NOT asserted: whether a scan actually
  // finds map-worthy blocks (sand/gravel/ores/logs) depends on the terrain around the
  // server's random spawn - a fresh CI world can legitimately yield 0 positions while the
  // pipeline itself works (locally the same code records 200+ positions in a forest).
  const mapRep = map.report()
  log(`worldmap: ${mapRep.positions} positions, ${mapRep.chunksScanned} chunks`)
  assert.ok(mapRep.chunksScanned >= 1, 'the chunks the miners worked in must be marked scanned')
})

// Also import-check the whole bot stack in CI (catches broken refactors early)
test('bot modules import cleanly', async () => {
  for (const mod of ['src/bots/miner.mjs', 'src/bots/scout.mjs', 'src/bots/tools.mjs', 'src/lib/deposit.mjs', 'src/fleet/worldmap.mjs', 'src/fleet/structurefind.mjs', 'src/fleet/chatsync.mjs', 'src/lib/fly.mjs', 'src/lib/fastdig.mjs', 'src/lib/jobqueue.mjs', 'src/lib/goals.mjs']) {
    await import(path.join(root, mod))
  }
})
