#!/usr/bin/env node
// Integration test: the smelting pipeline on a LIVE vanilla 26.2 server.
//
//   node tests/integration/smelting.test.mjs   (needs a running server)
//
// One bot, no op, no gifts, survival, ground mode - the whole chain by hand:
//   wood -> tools -> hand-dig SAND -> craft planks (fuel) -> shaft down for COBBLE
//   -> carve an alcove at the shaft bottom -> place a crafting table + FURNACE there
//   -> smelt the sand -> GLASS in the inventory (verified).
//
// Everything happens around the shaft bottom ON PURPOSE: no long pathfinder walks, no
// yard, no dependence on the terrain around spawn - the same test runs on a fresh CI
// world and on a churned local one. This is the furnace half of the base plan
// (data/base-raw.json needs glass from 157k sand, iron ingots, popped chorus).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withTimeout, gotoSafe } from '../../src/lib/jobqueue.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const HOST = process.env.MC_HOST || '127.0.0.1'
const PORT = Number(process.env.MC_PORT || 25565)

process.on('unhandledRejection', e => log(`unhandled rejection (kept alive): ${e?.stack || e}`))
process.on('uncaughtException', e => log(`uncaught exception (kept alive): ${e?.stack || e}`))

const logDir = path.join('/tmp', `smelt-test-${process.pid}`)
fs.mkdirSync(logDir, { recursive: true })
const logFile = path.join(logDir, 'smelt.log')
const logStream = fs.createWriteStream(logFile, { flags: 'a' })
logStream.on('error', () => { /* stream already ended */ })
const log = m => {
  if (!logStream.writableEnded) { try { logStream.write(`${new Date().toISOString()} ${m}\n`) } catch { /* closed */ } }
  console.log(`[smelt-test] ${m}`)
}

const countOf = (bot, name) => bot.inventory.items().filter(i => i.name === name).reduce((a, i) => a + i.count, 0)

// craft with variant retry (the oak-vs-birch recipe trap from tools.mjs) + hard timeout
// NOTE: bot.craft opens the crafting table ITSELF - never openCraftingTable() by hand
// first or the windowOpen event never fires and the craft hangs until the timeout.
async function craftItem (bot, itemName, times, table, { tries = 3 } = {}) {
  const id = bot.registry.itemsByName[itemName]?.id
  if (id == null) return false
  const recipes = bot.recipesFor(id, null, 1, table ?? null) || []
  for (const recipe of recipes) {
    for (let i = 0; i < tries; i++) {
      try {
        await withTimeout(bot.craft(recipe, times, table ?? null), 15000, `craft ${itemName}`)
        return true
      } catch (e) {
        log(`craft ${itemName} failed: ${e.message}`)
        // the full recovery dance (same as tools.mjs craft): a timed-out or desynced
        // craft leaves the window open with the grid poisoned - every later attempt
        // would fail "missing ingredient" forever unless the window is closed + swept
        recoverCraftWindow(bot, log)
        const swept = await sweepGridItems(bot)
        if (swept) log(`swept ${swept} ghost grid slot(s) back into the inventory`)
      }
    }
  }
  return false
}

// place a machine block on a free neighbour cell (same rules as placeTable: vanilla
// refuses placements that intersect an entity hitbox, and right-clicks throttled to
// 4 game ticks - hence the waitForTicks(5) before each attempt)
async function placeMachine (bot, itemName) {
  const { Vec3 } = await import('vec3')
  const stack = bot.inventory.items().find(i => i.name === itemName)
  if (!stack) return null
  const feet = bot.entity.position.floored()
  let skipped = 0
  let rejected = 0
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const cell = feet.offset(dx, 0, dz)
    // never place into the cell the bot itself occupies (vanilla refuses placements
    // that intersect an entity hitbox - the bot often falls into the freshly carved cell)
    const feetB = bot.blockAt(feet)
    if (feetB && cell.equals(feetB.position)) continue
    const cellB = bot.blockAt(cell)
    const floorB = bot.blockAt(cell.offset(0, -1, 0))
    if (!cellB || !floorB) { skipped++; continue }
    if (cellB.boundingBox !== 'empty' || floorB.boundingBox === 'empty' || floorB.boundingBox === 'fluid') { skipped++; continue }
    try {
      await bot.equip(stack, 'hand')
      await bot.waitForTicks(5)
      await bot.placeBlock(floorB, new Vec3(0, 1, 0))
      const placed = bot.blockAt(cell)
      if (placed && placed.name === itemName) return placed
      rejected++
    } catch (e) { rejected++; log(`placeMachine ${itemName} at ${cell}: ${e.message}`) }
  }
  log(`placeMachine ${itemName}: all 8 cells tried (skipped=${skipped} rejected=${rejected})`)
  return null
}

// GRAVITY-BLOCK GUARD (live failure 2026-09-19: a shaft bottom under a sand stratum -
// every carved alcove cell was instantly refilled by the sand ABOVE it falling in on
// the dig update, so placeMachine saw 8 solid cells and returned null in 1ms). Dig the
// column above the cell before placing: no gravity block overhead = no refill race.
async function digAbove (bot, miner, cell) {
  for (let dy = 1; dy <= 2; dy++) {
    const b = bot.blockAt(cell.offset(0, dy, 0))
    if (!b || b.type === 0 || b.boundingBox !== 'block') continue
    try { await withTimeout(bot.fastDig(b), 10000, `dig above ${cell}+${dy}`) } catch { /* leave it */ }
  }
}

// dig ONE wall block at feet level to create a free placement cell underground
async function carveAlcove (bot, miner) {
  const { Vec3 } = await import('vec3')
  const feet = bot.entity.position.floored()
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cell = feet.offset(dx, 0, dz)
    const wall = bot.blockAt(cell)
    const floorBelow = bot.blockAt(cell.offset(0, -1, 0))
    if (!wall || wall.type === 0 || wall.boundingBox !== 'block') continue
    if (!floorBelow || floorBelow.boundingBox !== 'block') continue
    try {
      // fastDig: server-confirmed break (bot.dig resolves instantly under the rage
      // digTime=0 patch - the block would never actually break), tool auto-equipped
      await withTimeout(bot.fastDig(wall), 15000, `alcove dig ${cell}`)
      await bot.waitForTicks(3)
      const now = bot.blockAt(cell)
      if (now && now.boundingBox === 'empty') { log(`alcove carved at ${cell}`); return true }
    } catch (e) { log(`alcove dig failed at ${cell}: ${e.message}`) }
  }
  return false
}

test('smelting pipeline: craft a furnace, place it, smelt sand into glass', { timeout: 390000 }, async t => {
  // BUDGET: node:test kills this file at 390s. A pathological spawn (barren beach:
  // 0 trees in 90s, tool retry, no reachable stone) can eat 5+ minutes BEFORE the
  // smelting phase even starts - measured in CI (run 35469790933: tools ok only at
  // t+310s, then the cobble hunt burned the rest and the test died on the raw
  // timeout instead of skipping). Every phase below checks the clock and SKIPS when
  // the remaining budget cannot fit the rest of the chain - an environment flake
  // must not look like a pipeline failure.
  const BUDGET_MS = 350000 // 40s margin before the 390s test timeout
  const budgetStarted = Date.now()
  const budgetLeft = () => BUDGET_MS - (Date.now() - budgetStarted)
  t.after(async () => {
    for (const m of miners) { try { m.bot.quit() } catch { /* gone */ } }
    await new Promise(r => setTimeout(r, 1500))
    logStream.end()
    console.log(`[smelt-test] logs: ${logFile}`)
  })

  const { createMiner } = await import(path.join(root, 'src', 'bots', 'miner.mjs'))
  const { ensureTools, countItem, LOG_BLOCKS, relocateToSolidGround, recoverCraftWindow, sweepGridItems } = await import(path.join(root, 'src', 'bots', 'tools.mjs'))
  const { smeltBatch } = await import(path.join(root, 'src', 'lib', 'smelting.mjs'))
  const pathfinderPkg = await import('mineflayer-pathfinder')
  const { goals } = pathfinderPkg.default // dynamic import wraps the CJS default export

  // --- spawn one bot, ground mode, survival ---
  const miners = [createMiner({ host: HOST, port: PORT, username: 'SmeltTest', fly: false, mode: 'rage', log })]
  await miners[0].ready
  const miner = miners[0]
  const bot = miner.bot
  assert.ok(bot.entity, 'bot must be spawned')
  log(`spawned at ${bot.entity.position.floored()}`)

  // --- hand-dig 2 dry sand BEFORE the tool phase: the bot spawns next to the
  //     beach, and after the tool phase it may have been walked inland/relocated ---
  // DRY sand only (air above): underwater sand floods the dig cell - fastDig never
  // sees the block "gone" (water replaces air) and the drop floats away unpicked.
  // progressive search: meadows may hide the nearest beach beyond the first radius
  const sandDeadline = Date.now() + 60000
  const findDrySand = maxR => {
    const cands = bot.findBlocks({ matching: b => b.name === 'sand', maxDistance: maxR, count: 24 })
      .map(p => bot.blockAt(p))
      .filter(b => b && b.name === 'sand')
      .filter(b => {
        const above = bot.blockAt(b.position.offset(0, 1, 0))
        return above && above.boundingBox === 'empty'
      })
      .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
    return cands[0] ?? null
  }
  let sandB = findDrySand(32)
  for (const maxR of [64, 128]) {
    if (sandB || Date.now() > sandDeadline) break
    try { await gotoSafe(bot, new goals.GoalNear(bot.entity.position.x + 24, bot.entity.position.y, bot.entity.position.z + 24, 2), { timeoutMs: 15000, label: `sand widen ${maxR}` }) } catch { /* scan from here */ }
    sandB = findDrySand(maxR)
  }
  assert.ok(sandB, 'dry sand must exist within 128 blocks (fixed-seed spawn area)')
  try { await gotoSafe(bot, new goals.GoalNear(sandB.position.x, sandB.position.y, sandB.position.z, 1), { timeoutMs: 30000, label: 'walk to sand' }) } catch (e) { log(`sand walk failed: ${e.message}`) }
  for (let i = 0; i < 3 && countOf(bot, 'sand') < 2 && Date.now() < sandDeadline; i++) {
    const b = findDrySand(6)
    if (!b) { log(`dig ${i}: no dry sand within 6 at ${bot.entity.position.floored()}`); break }
    // fastDig, NOT bot.dig: the rage patch sets digTime()=0, which makes bot.dig
    // resolve instantly WITHOUT server confirmation (block never breaks, no drop).
    // fastDig loops until the block really disappeared from the world.
    try { await withTimeout(bot.fastDig(b), 12000, `dig sand ${i}`) } catch (e) { log(`dig failed: ${e.message}`) }
    log(`dig ${i}: ${b.name} at ${b.position.floored()} -> sand=${countOf(bot, 'sand')}`)
  }
  // TOLERANT: the spawn point moves between runs (trees / beach / meadow) - if no dry
  // sand is at hand the smelting phase falls back to cobblestone -> stone below
  log(`sand: ${countOf(bot, 'sand')} (optional; cobblestone is the fallback input)`)

  const sandDeadline2 = Date.now()

  // --- tools (wood -> planks -> sticks -> table -> wooden pickaxe + shovel) ---
  // want: 14 logs - tools eat ~2 logs' worth, the fuel + table phases need ~5 more.
  // TWO full attempts: the 26.2 craft window desyncs under rage conditions and one
  // poisoned cascade can sink a single pass (the fleet survives this via redundancy;
  // a single-bot test needs an explicit retry).
  let toolRes = { ok: false, kit: 'not attempted' }
  for (let attempt = 0; attempt < 2 && !toolRes.ok; attempt++) {
    // 70/60s: two full 90s attempts on a barren spawn blow the whole test budget
    // (measured: 0 logs in 90s twice = 300s before the table is even craftable)
    try { await miner.gatherWood({ want: 20, maxSeconds: 70 }) } catch (e) { log(`gatherWood failed: ${e.message}`) }
    toolRes = await ensureTools(bot, { miner, log, maxSeconds: 60 })
    if (toolRes.ok) break
    // beach spawns can leave every neighbour cell under water - no legal placement
    // cell. Walk inland (the fleet's relocate-to-solid-ground escalation) and retry.
    log(`tools attempt ${attempt} failed (${toolRes.kit}) - walking inland and retrying`)
    try {
      const { Vec3 } = await import('vec3')
      const here = bot.entity.position
      await gotoSafe(bot, new goals.GoalNear(here.x + 16, here.y, here.z + 16, 2), { timeoutMs: 20000, label: 'inland walk' })
      await relocateToSolidGround(bot)
    } catch (e) { log(`inland walk failed: ${e.message}`) }
  }
  log(`tools: ${toolRes.ok ? 'ok' : 'fail'} (${toolRes.kit})`)
  if (!toolRes.ok) {
    // TOLERANT (like the planks/stone skips below): a STRIPPED spawn forest (several
    // diag/test runs chop the same fixed-seed spawn area bare) or a night-mob kill
    // streak of the naked bot are ENVIRONMENT conditions, not smelting-pipeline
    // failures - the fleet survives them via redundancy, a single bot cannot.
    const woodLeft = [...bot.inventory.items()].filter(i => i.name.endsWith('_log')).reduce((a, i) => a + i.count, 0)
    if (woodLeft === 0) {
      t.skip(`wood scarce this run (0 logs after 2 gatherWood passes) - full chain not exercised`)
      return
    }
  }
  assert.ok(toolRes.ok, 'tool bootstrap must succeed before the smelting chain')
  // the rest of the chain needs ~150s minimum (8 cobble + furnace craft/place + 2 smelts):
  // a bootstrap that ate the budget is an environment condition, not a pipeline failure
  if (budgetLeft() < 150000) {
    t.skip(`bootstrap ate the budget (${Math.round(budgetLeft() / 1000)}s left) - smelting chain not exercised this run`)
    return
  }

  // --- fuel: convert the DOMINANT log type into planks (>= 20 of one kind: the
  //     table craft eats 4, pickFuel reserves 8 for the tool bootstrap, the rest
  //     must still cover 2 smelts = 2 planks) ---
  const dominantLog = LOG_BLOCKS.map(n => ({ n, c: countOf(bot, n) })).sort((a, b) => b.c - a.c)[0]
  if (dominantLog?.c > 0) {
    const plankName = dominantLog.n.replace(/_(log|stem)$/, '_planks')
    while (countOf(bot, dominantLog.n) > 0 && countOf(bot, plankName) < 20) {
      if (!await craftItem(bot, plankName, 1, null, { tries: 1 })) break
    }
  }
  const planks = bot.inventory.items().filter(i => i.name.endsWith('_planks')).reduce((a, i) => a + i.count, 0)
  log(`planks for fuel: ${planks}`)
  if (planks < 12) {
    // resource scarcity is an ENVIRONMENT condition (sparse/churned trees), not a
    // smelting-pipeline failure - skip cleanly so CI measures the pipeline, not the forest
    t.skip(`wood scarce this run (${planks} planks) - full chain not exercised`)
    return
  }

  // --- shaft down for cobblestone (wooden pickaxe digs stone) ---
  // digShaft must include the TOPSOIL names: from a meadow surface the block below is
  // grass/dirt, and a stone-only name list makes the shaft sidestep across the terrain
  // forever instead of digging down to the stone layer (measured: 330s of wandering).
  // COBBLE-PRODUCING blocks ONLY: diorite/andesite/tuff veins dig fine but drop
  // non-cobble items - a furnace needs 8 cobblestone strictly (measured: a 16-block
  // shaft through a diorite vein yielded 0 cobble). Sidestepping around a vein is
  // cheaper than digging it.
  const diggable = ['dirt', 'grass_block', 'sand', 'gravel', 'sandstone', 'red_sandstone', 'stone', 'cobblestone']
  const stoneTargets = ['stone', 'cobblestone']
  // alternate strategies until 8 cobble: the shaft descends (sidesteps around caves),
  // the job-queue collector walks to VERIFIED reachable stone. On churned worlds a
  // single strategy can hit a cave-riddled patch - alternating keeps the budget busy.
  // The phase deadline is BUDGET-CAPPED: the furnace + smelt phases still need ~100s.
  const cobbleBudgetMs = Math.min(150000, budgetLeft() - 100000)
  if (cobbleBudgetMs < 40000) {
    t.skip(`no budget left for the cobble phase (${Math.round(budgetLeft() / 1000)}s left) - smelting chain not exercised this run`)
    return
  }
  const cobbleDeadline = Date.now() + cobbleBudgetMs
  for (let round = 0; countItem(bot, 'cobblestone') < 8 && Date.now() < cobbleDeadline; round++) {
    if (round % 2 === 0) {
      try {
        await miner.digShaft(diggable, {
          maxBlocks: 40,
          maxMs: 45000,
          onProgress: (n, st) => log(`shaft r${round}: ${n} blocks (${JSON.stringify(st.byName)})`),
          shouldStop: () => countItem(bot, 'cobblestone') >= 8 || Date.now() > cobbleDeadline
        })
      } catch (e) { log(`digShaft failed: ${e.message}`) }
    } else {
      try {
        await miner.collectArea(stoneTargets, {
          count: 12,
          hopDistance: 16,
          perBlockTimeoutMs: 8000,
          maxSeconds: 40,
          shouldStop: () => countItem(bot, 'cobblestone') >= 8 || Date.now() > cobbleDeadline
        })
      } catch (e) { log(`collectArea failed: ${e.message}`) }
    }
    // death insurance between rounds: a shaft can still kill (respawn = empty pockets)
    if (!bot.inventory.items().some(i => i.name.includes('pickaxe'))) {
      log('lost tools - re-bootstrapping like the fleet does')
      try { await miner.gatherWood({ want: 8, maxSeconds: 40 }) } catch { /* mine anyway */ }
      try { await ensureTools(bot, { miner, log, maxSeconds: 50 }) } catch (e) { log(`re-bootstrap failed: ${e.message}`) }
    }
  }
  log(`cobblestone: ${countOf(bot, 'cobblestone')} at ${bot.entity?.position?.floored()} hp=${bot.health} (byName=${JSON.stringify(miner.stats.byName)})`)
  if (countItem(bot, 'cobblestone') < 8) {
    t.skip(`stone scarce this run (${countItem(bot, 'cobblestone')} cobble) - full chain not exercised`)
    return
  }

  // --- underground workshop: alcove -> table -> furnace (all at the shaft bottom) ---
  let table = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 5 })
  if (!table) {
    // craft a fresh table from the planks we made (2x2 grid, no table needed)
    if (!countOf(bot, 'crafting_table')) assert.ok(await craftItem(bot, 'crafting_table', 1, null), 'table craft must succeed')
    for (let attempt = 0; attempt < 3 && !table; attempt++) {
      const carved = await carveAlcove(bot, miner)
      if (carved) {
        // the carved cell is feet-level: kill any gravity block (sand/gravel) directly
        // above it BEFORE placing, or the refill race eats the cell (measured live)
        const feet = bot.entity.position.floored()
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = feet.offset(dx, 0, dz)
          const b = bot.blockAt(c)
          if (b && b.boundingBox === 'empty') { await digAbove(bot, miner, c); break }
        }
        table = await placeMachine(bot, 'crafting_table')
        log(`table attempt ${attempt}: carved, placed=${table?.position?.floored() ?? 'FAILED'}`)
      }
    }
  }
  assert.ok(table, 'a crafting table must be placeable at the shaft bottom')
  const crafted = await craftItem(bot, 'furnace', 1, table)
  try { bot.closeWindow(bot.currentWindow) } catch { /* already closed */ }
  assert.ok(crafted, 'furnace craft must succeed (8 cobblestone -> furnace)')
  log(`furnace crafted (${countOf(bot, 'furnace')} in inventory)`)

  // place the furnace into another carved cell (the table already took one)
  let furnaceBlock = await placeMachine(bot, 'furnace')
  if (!furnaceBlock) {
    assert.ok(await carveAlcove(bot, miner), 'must be able to carve a cell for the furnace')
    const feet = bot.entity.position.floored()
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = feet.offset(dx, 0, dz)
      const b = bot.blockAt(c)
      if (b && b.boundingBox === 'empty') { await digAbove(bot, miner, c); break }
    }
    furnaceBlock = await placeMachine(bot, 'furnace')
  }
  assert.ok(furnaceBlock, 'furnace must be placeable on a free neighbour cell')
  log(`furnace placed at ${furnaceBlock.position.floored()}`)

  // --- SMELT: the actual pipeline under test ---
  // input: sand -> glass when the beach cooperated, otherwise cobblestone -> stone
  // (the same furnace mechanics: claim, fuel policy, verified transfers, output)
  const inputName = countOf(bot, 'sand') >= 1 ? 'sand' : 'cobblestone'
  const expectOut = inputName === 'sand' ? 'glass' : 'stone'
  log(`smelting input: ${inputName} x${countOf(bot, inputName)} -> ${expectOut}`)
  const smeltSeconds = Math.min(150, Math.floor((budgetLeft() - 30000) / 1000))
  if (smeltSeconds < 20) {
    t.skip(`no budget left for the smelt phase (${Math.round(budgetLeft() / 1000)}s left) - chain verified up to the placed furnace`)
    return
  }
  const res = await smeltBatch(bot, {
    machineBlock: bot.blockAt(furnaceBlock.position) ?? furnaceBlock,
    inputName,
    count: 2,
    maxSeconds: smeltSeconds,
    fuelReserve: { reservePlanks: 0, reserveLogs: 0, reserveSticks: 0 },
    log
  })
  log(`smeltBatch -> ${JSON.stringify(res)}`)
  assert.ok(res.smelted >= 1, `at least 1 item must smelt (got ${res.smelted}, reason: ${res.reason})`)
  assert.ok(countOf(bot, expectOut) >= 1, `${expectOut} must be IN the inventory (verified transfer)`)
  log(`${expectOut.toUpperCase()} smelted: ${countOf(bot, expectOut)} - the furnace pipeline works end to end`)
})
