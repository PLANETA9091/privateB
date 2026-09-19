#!/usr/bin/env node
// Harvest run against the build's own material plan (data/base-raw.json):
// N miners self-discover the resources in the world (findBlock + outward hops, no op)
// and mine to quota, while progress is reported against what base.litematic actually needs.
//
//   node testbed/harvest-plan.mjs [seconds] [bots] [targets]
import fs from 'node:fs'
import { createMiner, fleetStats } from '../src/bots/miner.mjs'

const SECONDS = Number(process.argv[2] || 120)
const BOTS = Number(process.argv[3] || 3)
const WANTED = (process.argv[4] || 'sand,gravel,oak_log,birch_log,spruce_log,dirt').split(',')

let plan
 try {
  plan = JSON.parse(fs.readFileSync('data/base-raw.json', 'utf8'))
} catch (err) {
  console.error(`cannot read data/base-raw.json: ${err.message}`)
  process.exit(1)
}
const need = plan.rawResources
console.log(`--- base.litematic needs: ${Object.entries(need).slice(0, 8).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(', ')} ... ---`)
console.log(`--- targets this run: ${WANTED.map(t => `${t}(${need[t] ?? '?'})`).join(', ')} ---`)

const count = (bot, name) => bot.inventory.items().filter(i => i.name === name).reduce((a, i) => a + i.count, 0)
const totals = {}
const miners = []
for (let i = 1; i <= BOTS; i++) {
  const miner = createMiner({ host: '127.0.0.1', port: 25565, username: `Har${i}`, mode: 'rage', log: () => {} })
  miner.bot.on('kicked', r => console.log(`Har${i} kicked: ${typeof r === 'string' ? r : JSON.stringify(r)}`))
  miners.push(miner)
  for (const t of WANTED) totals[t] = totals[t] || 0
}
await Promise.all(miners.map(m => m.ready))
console.log(`${BOTS} miners ready`)

const deadline = Date.now() + SECONDS * 1000
const reporter = setInterval(() => {
  const per = WANTED.map(t => `${t}=${miners.reduce((a, m) => a + count(m.bot, t), 0)}`).join(' ')
  const s = fleetStats(miners)
  console.log(`t-${Math.max(0, (deadline - Date.now()) / 1000).toFixed(0)}s mined=${s.mined} | ${per} | skipped=${s.skipped} fail=${s.failed}`)
}, 10000)

// each bot takes one target at a time, round-robin, until the deadline
const jobs = miners.map((m, i) => (async () => {
  const target = WANTED[i % WANTED.length]
  try {
    return await m.harvestSite(target, {
      want: Number.MAX_SAFE_INTEGER,
      map: null,
      searchRadius: 96,
      maxSeconds: SECONDS + 5
    })
  } catch (e) {
    console.log(`Har${i + 1} ${target} failed: ${e.message}`)
    return null
  }
})())
await Promise.all(jobs)
clearInterval(reporter)

const secs = SECONDS
const s = fleetStats(miners)
console.log('================ RESULT ================')
console.log(`bots=${BOTS} time=${secs}s mined=${s.mined} (${(s.mined / secs).toFixed(2)} blocks/s)`)
for (const t of WANTED) {
  const got = miners.reduce((a, m) => a + count(m.bot, t), 0)
  const required = need[t]
  const pct = required ? ` (${((got / required) * 100).toFixed(2)}% of the ${required.toLocaleString()} needed)` : ''
  console.log(`  ${t.padEnd(14)} collected ${String(got).padStart(6)}${pct}`)
}
console.log(`materials mined: ${JSON.stringify(s.byName)}`)
console.log(`distance travelled: ${sumTravelled(miners).toFixed(0)} blocks`)
for (const m of miners) m.bot.quit()
process.exit(0)

function sumTravelled (list) {
  return list.reduce((a, m) => a + (m.stats.travelled ?? 0), 0)
}
