#!/usr/bin/env node
// Honest end-to-end test on a FRESH world with NO prepared resources:
//   * nothing is /fill-ed or /setblock-ed for the test - the only thing built by hand is
//     the yard at spawn (the "workshop" a human would prepare)
//   * 2 scouts fly ~500 blocks in different directions, scanning whatever chunks load
//   * a miner then picks real resource sites out of the shared map and flies to them
//   * it mines to quota, sweeps the drops and reports distance travelled
//
//   node testbed/prospect-mine.mjs [seconds]
import { WorldMap } from '../src/fleet/worldmap.mjs'
import { createScout } from '../src/bots/scout.mjs'
import { createMiner } from '../src/bots/miner.mjs'

const SECONDS = Number(process.argv[2] || 60)
const HOST = '127.0.0.1'
const PORT = 25565
const MAP_FILE = 'data/worldmap.json'

const map = new WorldMap({ file: MAP_FILE })
await map.load?.()
console.log(`--- shared map: ${map.total()} known positions (${map.counts()}) ---`)

console.log('=== phase 1: two scouts explore ===')
const scouts = [
  createScout({ host: HOST, port: PORT, username: 'ScoutE', map, log: console.log }),
  createScout({ host: HOST, port: PORT, username: 'ScoutN', map, log: console.log })
]
await Promise.all(scouts.map(s => s.ready))
const scoutTask = Promise.all([
  scouts[0].patrol({ heading: 'east', distance: 500, lanes: 2, laneGap: 64, altitude: 110, seconds: SECONDS }),
  scouts[1].patrol({ heading: 'north', distance: 500, lanes: 2, laneGap: 64, altitude: 110, seconds: SECONDS })
])
await Promise.all([scouts[0].bot.quit(), scouts[1].bot.quit()])
const patrols = await scoutTask

const report = map.report(14)
console.log('--- map after scouting ---')
console.log(`chunks scanned: ${report.chunksScanned}`)
console.log(`resource positions known: ${report.positions}`)
for (const [name, count] of report.top) {
  const example = map.nearest(name, { x: 0, y: 100, z: 0, distanceTo: () => 0 }) ??
    map.found.get(name)?.values().next().value?.pos
  console.log(`  ${String(count).padStart(6)}  ${name.padEnd(18)} e.g. ${example ? example.floored() : '?'}`)
}
map.save()

console.log('=== phase 2: a miner harvests the discovered sites (no op, no gear) ===')
const miner = createMiner({ host: HOST, port: PORT, username: 'BotH1', mode: 'rage', log: console.log })
await miner.ready
const inv = () => miner.bot.inventory.items().reduce((a, i) => a + i.count, 0)
const before = inv()

const wanted = []
for (const name of ['sand', 'gravel', 'oak_log', 'birch_log', 'spruce_log']) {
  if (map.size(name) > 0) wanted.push({ name, want: name.endsWith('_log') ? 12 : 32 })
}
console.log(`targets with known sites: ${wanted.map(w => `${w.name}(${w.want})`).join(', ') || '(none - scouts found nothing)'}`)

const results = []
for (const { name, want } of wanted) {
  if (miner.bot.entity && !miner.bot.entity.isValid) break
  try {
    results.push({ name, ...await miner.harvestSite(name, { want, map, searchRadius: 96, maxSeconds: 90 }) })
  } catch (e) {
    console.log(`harvest ${name} failed: ${e.message}`)
  }
}

console.log('================ RESULT ================')
console.log(`scouts: ${patrols.map(p => `${p.scans} scans, ${p.found} new positions, ${(p.travelled / 1000).toFixed(1)}k blocks`).join(' | ')}`)
console.log(`map: ${map.total()} positions over ${map.scannedChunks.size} chunks`)
for (const r of results) {
  console.log(`${r.name.padEnd(14)} got ${r.got}/${r.want} in ${r.secs.toFixed(0)}s, travelled ${r.travelled.toFixed(0)} blocks, sites mined ${r.sites}`)
}
console.log(`total items in miner inventory: ${inv() - before}`)
console.log(`materials mined: ${JSON.stringify(miner.stats.byName)}`)
console.log(`distance travelled by miner: ${results.reduce((a, r) => a + r.travelled, 0).toFixed(0)} blocks`)
console.log(`note: no /fill or /setblock was used for resources - everything the miner broke was found by the bots`)
map.save()
miner.bot.quit()
process.exit(0)
