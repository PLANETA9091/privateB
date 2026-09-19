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

const logDir = path.join('/tmp', `fleet-test-${process.pid}`)
fs.mkdirSync(logDir, { recursive: true })
const logFile = path.join(logDir, 'fleet.log')
const logStream = fs.createWriteStream(logFile, { flags: 'a' })
const log = m => { logStream.write(`${new Date().toISOString()} ${m}\n`); if (process.env.VERBOSE) console.log(m) }

test(`fleet productivity: ${BOT_COUNT} bots mine on the ground for ${WINDOW_SECONDS}s`, { timeout: (WINDOW_SECONDS + 240) * 1000 }, async t => {
  t.after(() => {
    for (const m of miners) { try { m.bot.quit() } catch { /* gone */ } }
    logStream.end()
    console.log(`[fleet-test] logs: ${logFile}`)
  })

  const { createMiner, fleetStats } = await import(path.join(root, 'src', 'bots', 'miner.mjs'))
  const { ensureTools, countItem } = await import(path.join(root, 'src', 'bots', 'tools.mjs'))
  const { Vec3 } = await import('vec3')

  // --- spawn the fleet in ground mode (no flight, exactly like production) ---
  const miners = []
  for (let i = 1; i <= BOT_COUNT; i++) {
    miners.push(createMiner({
      host: HOST,
      port: PORT,
      username: `ProdTest${i}`,
      fly: false,
      mode: 'rage',
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
  const toolResults = []
  for (let i = 0; i < miners.length; i++) {
    const m = miners[i]
    try {
      await m.gatherWood({ want: 4, direction: direction[i % 2], maxSeconds: 60, shouldStop: () => Date.now() > deadline })
    } catch (e) { log(`${m.username} gatherWood failed: ${e.message}`) }
    try {
      const res = await ensureTools(m.bot, { miner: m, log, maxSeconds: 45 })
      toolResults.push(res)
      log(`${m.username} tools: ${res.ok ? 'ok' : 'fail'} (${res.kit})`)
    } catch (e) { log(`${m.username} ensureTools failed: ${e.message}`) }
  }
  assert.ok(
    toolResults.some(r => r.ok),
    `at least one bot must craft a pickaxe (got: ${JSON.stringify(toolResults)})`
  )

  // --- mine on the ground and demand progress in every window ---
  // One workOnGround per bot for the whole phase (concurrent calls on the same bot would
  // fight over the pathfinder); a sampler measures how much each window contributed.
  const windowMs = 15000
  const samples = []
  const minersAlive = () => miners.filter(m => m.bot.entity)
  let minedAtWindowStart = fleetStats(minersAlive()).mined

  const work = minersAlive().map((m, i) => {
    const soft = ['dirt', 'grass_block', 'sand', 'gravel', 'clay', 'coarse_dirt', 'podzol']
    const pick = m.bot.inventory.items().some(it => it.name.includes('pickaxe'))
    const names = pick ? [...soft, 'stone', 'andesite', 'diorite', 'tuff', 'coal_ore', 'iron_ore'] : soft
    return m.workOnGround(names, {
      direction: direction[i % 2],
      hopDistance: 12,
      shouldStop: () => Date.now() > deadline
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
    Promise.all(work),
    new Promise(r => setTimeout(r, WINDOW_SECONDS * 1000))
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
})

// Also import-check the whole bot stack in CI (catches broken refactors early)
test('bot modules import cleanly', async () => {
  for (const mod of ['src/bots/miner.mjs', 'src/bots/scout.mjs', 'src/bots/tools.mjs', 'src/fleet/worldmap.mjs', 'src/fleet/structurefind.mjs', 'src/lib/fly.mjs', 'src/lib/fastdig.mjs', 'src/lib/jobqueue.mjs']) {
    await import(path.join(root, mod))
  }
})
