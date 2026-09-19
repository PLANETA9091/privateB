#!/usr/bin/env node
// Diagnose the "Cannot read properties of null (reading 'x')" inside ensureTools.
import { createMiner } from '../src/bots/miner.mjs'
import { ensureTools } from '../src/bots/tools.mjs'
import { Vec3 } from 'vec3'

const log = m => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`)
process.on('unhandledRejection', e => log(`unhandledRejection: ${e?.stack || e}`))
process.on('uncaughtException', e => log(`uncaughtException: ${e?.stack || e}`))

const miner = createMiner({ host: '127.0.0.1', port: 25565, username: 'Diag1', fly: false, mode: 'rage', log })
await miner.ready
log(`spawned at ${miner.bot.entity.position.floored()}`)
try {
  await miner.gatherWood({ want: 4, direction: new Vec3(1, 0, 0), maxSeconds: 60 })
  log(`logs: ${miner.bot.inventory.items().filter(i => i.name.endsWith('_log')).reduce((a, i) => a + i.count, 0)}`)
} catch (e) {
  log(`gatherWood FAILED: ${e.stack}`)
}
try {
  const res = await ensureTools(miner.bot, { miner, log, maxSeconds: 90 })
  log(`ensureTools: ${JSON.stringify(res)}`)
} catch (e) {
  log(`ensureTools FAILED: ${e.stack}`)
}
try { miner.bot.quit() } catch { /* gone */ }
process.exit(0)
