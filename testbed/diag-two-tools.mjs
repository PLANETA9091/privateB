#!/usr/bin/env node
// Two concurrent bots - the minimal reproduction of the 'x' of null failure in ensureTools.
import { createMiner } from '../src/bots/miner.mjs'
import { ensureTools } from '../src/bots/tools.mjs'
import { Vec3 } from 'vec3'

const log = m => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`)
process.on('unhandledRejection', e => log(`unhandledRejection: ${e?.stack || e}`))
process.on('uncaughtException', e => log(`uncaughtException: ${e?.stack || e}`))

const run = async (name, dir) => {
  const miner = createMiner({ host: '127.0.0.1', port: 25565, username: name, fly: false, mode: 'rage', log })
  await miner.ready
  log(`${name} spawned at ${miner.bot.entity.position.floored()}`)
  try {
    await miner.gatherWood({ want: 4, direction: dir, maxSeconds: 60 })
  } catch (e) {
    log(`${name} gatherWood FAILED: ${e.stack}`)
  }
  try {
    const res = await ensureTools(miner.bot, { miner, log, maxSeconds: 90 })
    log(`${name} ensureTools: ${JSON.stringify(res)}`)
  } catch (e) {
    log(`${name} ensureTools FAILED: ${e.stack}`)
  }
  try { miner.bot.quit() } catch { /* gone */ }
}

const direction = [new Vec3(1, 0, 0), new Vec3(-1, 0, 0)]
await Promise.all([run('DiagA', direction[0]), run('DiagB', direction[1])])
process.exit(0)
