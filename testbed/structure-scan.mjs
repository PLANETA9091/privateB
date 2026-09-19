#!/usr/bin/env node
// Survival structure discovery test: a bot flies to an area and finds structures by blocks
// only - no /locate, no op. Results are compared against the true placement chunks that the
// verified 26.2 placement maths derives from the world seed.
//
//   node testbed/structure-scan.mjs <x> <z> [--seed 8624896123745] [--structure shipwreck]
import { Vec3 } from 'vec3'
import { createScout } from '../src/bots/scout.mjs'
import { scanForStructures } from '../src/fleet/structurefind.mjs'
import { STRUCTURES, potentialStructureChunk } from '../src/seed/placement.mjs'

const X = Number(process.argv[2] ?? -128)
const Z = Number(process.argv[3] ?? 32)
const seedArg = process.argv.includes('--seed') ? process.argv[process.argv.indexOf('--seed') + 1] : '8624896123745'
const SEED = BigInt(seedArg)

const scout = createScout({ host: '127.0.0.1', port: 25565, username: 'StructScout', log: console.log })
await scout.ready
const bot = scout.bot

// the bot can be kicked (e.g. bad connection or a stalled anti-kick); never keep waiting forever
let alive = true
bot.on('end', r => { alive = false; console.log(`bot disconnected (${r})`) })
bot.on('kicked', r => { alive = false; console.log(`bot kicked: ${typeof r === 'string' ? r : JSON.stringify(r)}`) })
bot.on('error', e => { alive = false; console.log(`bot error: ${e.message}`) })

console.log(`flying to ${X},${Z} to look for structures by blocks (no op, no /locate)`)
try {
  await bot.flyTravel(new Vec3(X, 100, Z), { speed: 1.5, cruiseAbove: 30, timeoutMs: 60000 })
} catch (err) {
  console.log(`travel: ${err.message}`)
}

const detections = []
const seen = new Set()
// scan the area in a small cross pattern so the loaded chunks cover the structure
const offsets = [[0, 0], [48, 0], [-48, 0], [0, 48], [0, -48]]
for (const [dx, dz] of offsets) {
  if (!alive) break
  try {
    await bot.flyTravel(new Vec3(X + dx, 85, Z + dz), { speed: 1.5, cruiseAbove: 20, timeoutMs: 25000 })
  } catch { /* keep scanning */ }
  for (let i = 0; i < 3 && alive; i++) {
    for (const det of await scanForStructures(bot, { maxDistance: 48 })) {
      const key = `${det.structure}@${det.minChunk.x},${det.minChunk.z}`
      if (seen.has(key)) continue
      seen.add(key)
      detections.push(det)
      console.log(`FOUND ${det.structure} (confident=${det.confident}) hits=${det.hits} blocks=${JSON.stringify(det.blocks)}`)
      console.log(`      bbox ${det.min.floored()} .. ${det.max.floored()} | minChunk (${det.minChunk.x},${det.minChunk.z}) centerChunk (${det.centerChunk.x},${det.centerChunk.z})`)
    }
    await new Promise(r => setTimeout(r, 400))
  }
}
if (!alive) {
  console.log('bot is gone - aborting instead of waiting for timeouts')
  process.exit(1)
}

console.log(`\ndetections: ${detections.length}`)
for (const det of detections) {
  const def = STRUCTURES[det.structure]
  if (!def) { console.log(`  ${det.structure}: no placement definition (cracker cannot use it yet)`); continue }
  // true placement chunk: which potential chunk lies inside / near this detection
  const cx = det.centerChunk.x
  const cz = det.centerChunk.z
  const radius = 6
  let best = null
  for (let rx = Math.floor((cx - radius) / def.spacing) - 1; rx <= Math.floor((cx + radius) / def.spacing) + 1; rx++) {
    for (let rz = Math.floor((cz - radius) / def.spacing) - 1; rz <= Math.floor((cz + radius) / def.spacing) + 1; rz++) {
      const cand = potentialStructureChunk(SEED, def, rx, rz)
      const dist = Math.max(Math.abs(cand.chunkX - cx), Math.abs(cand.chunkZ - cz))
      if (dist <= radius && (best == null || dist < best.dist)) best = { ...cand, dist }
    }
  }
  if (!best) {
    console.log(`  ${det.structure}: no true placement chunk within ${radius} chunks of ${cx},${cz}`)
    continue
  }
  console.log(`  ${det.structure}: detected chunk (${cx},${cz}) -> true placement chunk (${best.chunkX},${best.chunkZ}) offset (${best.chunkX - cx},${best.chunkZ - cz}) dist ${best.dist}`)
}

bot.quit()
process.exit(0)
