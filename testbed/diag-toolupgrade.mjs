#!/usr/bin/env node
// Live diag for the tool upgrade chain (src/lib/toolupgrade.mjs).
// One bot: bootstrap tools (wooden+stone at best), dig cobble, then force the
// upgrade scenarios in order:
//   1. natural: healthy stone pick + cobble reserve -> upgrade to stone? no - iron?
//      no ingots -> NOT due (the guard that stops pointless table trips)
//   2. synthetic wear: report the pick's real durability; if upgradeCheck says due
//      after wear injection is impossible offline, drive the WOODEN->STONE path by
//      equipping a low-durability wooden pick (crafted fresh has used=0, so we rely
//      on the natural path: dig with the wooden pick until wear crosses the line)
// The REAL end-to-end proof is: bot digs -> wear drops -> upgradeCheck fires ->
// upgradeTools crafts a fresh pickaxe WITHOUT any re-bootstrap.
import { createMiner } from '../src/bots/miner.mjs'
import { ensureTools, countItem } from '../src/bots/tools.mjs'
import { upgradeCheck, upgradeTools, pickWear, bestPickaxe } from '../src/lib/toolupgrade.mjs'
import { Vec3 } from 'vec3'

const log = m => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`)
process.on('unhandledRejection', e => log(`unhandledRejection: ${e?.stack || e}`))
process.on('uncaughtException', e => log(`uncaughtException: ${e?.stack || e}`))

const miner = createMiner({ host: '127.0.0.1', port: 25565, username: 'UpgDiag', fly: false, mode: 'rage', log })
await miner.ready
const bot = miner.bot
log(`spawned at ${bot.entity.position.floored()}`)

const inv = () => bot.inventory.items().map(i => `${i.name}x${i.count}`).join(' ') || 'empty'

// phase 1: bootstrap the kit
try {
  await miner.gatherWood({ want: 8, direction: new Vec3(1, 0, 0), maxSeconds: 60 })
} catch (e) { log(`gatherWood failed (continuing): ${e.message}`) }
const boot = await ensureTools(bot, { miner, log, maxSeconds: 90 })
log(`ensureTools: ${JSON.stringify(boot)}`)
log(`inventory: ${inv()}`)

// phase 2: earn cobble (the upgrade's fuel) - the wooden->stone upgrade fires on
// MATERIAL OPPORTUNITY (cobble >= reserve) even while the pick is healthy; the worn
// branch shares the same craft machinery (unit-pinned) and fires later on long runs.
let upgrades = 0
let checks = 0
const deadline = Date.now() + 300000
while (Date.now() < deadline && bot.entity) {
  const wear = pickWear(bot)
  const c = upgradeCheck(bot)
  checks++
  log(`pick=${bestPickaxe(bot)?.item.name ?? 'none'} wear=${wear ? `${wear.left}/${wear.max}` : 'unknown'} cobble=${countItem(bot, 'cobblestone')} check=${JSON.stringify(c)}`)
  if (c.due) {
    log(`UPGRADE DUE: ${c.reason} -> ${c.target}`)
    const res = await upgradeTools(bot, { log })
    log(`upgradeTools: ${JSON.stringify(res)}`)
    if (res.ok) {
      upgrades++
      if (upgrades >= 1) break // proof delivered: opportunity branch crafts at the dig site
    }
    await new Promise(r => setTimeout(r, 8000)) // failed: cool down like the fleet does (no hot spin)
    continue
  }
  // dig/collect to burn durability (and to earn the cobble for the next tier)
  try {
    if (checks % 2 === 0) {
      await miner.collectArea(['stone', 'cobblestone', 'andesite', 'diorite'], {
        count: 8, hopDistance: 16, perBlockTimeoutMs: 8000, maxSeconds: 45,
        shouldStop: () => upgradeCheck(bot).due
      })
    } else {
      await miner.digShaft(['stone', 'cobblestone', 'andesite', 'diorite', 'tuff', 'dirt', 'grass_block'], {
        maxBlocks: 24,
        maxMs: 45000,
        shouldStop: () => upgradeCheck(bot).due
      })
    }
  } catch (e) { log(`dig: ${e.message}`) }
  await new Promise(r => setTimeout(r, 500))
}

log(`RESULT: upgrades=${upgrades} checks=${checks} final inventory: ${inv()}`)
log(`wear at end: ${JSON.stringify(pickWear(bot) ? { left: pickWear(bot).left, max: pickWear(bot).max } : null)}`)
try { bot.quit() } catch { /* gone */ }
process.exit(0)
