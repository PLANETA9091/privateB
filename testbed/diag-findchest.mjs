// findChest palette e2e (v0.43.0): the bank gate's final wall, measured live.
// Dispatch 35591877408 (v0.42.1): F10 stood 13 blocks from the 50 VERIFIED
// warehouse chests - 'scan: no chest within 64b (bankable 126)', banked=0. The
// v0.41.0 yard filter answers chestNearYard({chestPos: null}) = false, and
// mineflayer's palette fast-path (blocks.js isBlockInSection) probes the matcher
// with Block.fromStateId(stateId, 0) - NO position - so every chest section was
// skipped and findChest returned null EVERYWHERE. The same trap was measured
// live once before (tools.mjs reachableTable, v0.6.7: findBlock null with the
// target 3 blocks away). The cure is the PALETTE CANDIDATE RULE in findChest.
//
//   scripts/server.sh start
//   node testbed/diag-findchest.mjs CHESTSCOUT
//
// This rig places a real chest 10 blocks from the bot (server console), then
// demands findChest finds it WITH the yard filter active (yardCenter = spawn
// analog - the fleet's exact shape). PASS = found + far-yard rejection +
// exclude honored; the three together prove the palette rule reopens the
// warehouse without reopening the wilderness hijack.
import { createMiner } from '../src/bots/miner.mjs'
import { findChest } from '../src/lib/deposit.mjs'
import { execFileSync } from 'node:child_process'
import Vec3 from 'vec3'

const username = process.argv[2] ?? 'CHESTSCOUT'
const cmd = (...words) => {
  try { execFileSync('scripts/server.sh', ['cmd', words.join(' ')], { cwd: '/home/z/privateB-repo', stdio: 'pipe', timeout: 15000 }) } catch (e) { console.log(`[diag] cmd failed: ${e.message}`) }
}

const miner = createMiner({ username, fly: false, log: m => console.log(`[diag] ${m}`) })
await miner.ready
const bot = miner.bot

cmd('time', 'set', 'day')
cmd('kill', '@e[type=zombie]')
cmd('kill', '@e[type=skeleton]')
cmd('gamerule', 'doMobSpawning', 'false') // a repro rig, not survival (rise e2e lesson)
await bot.waitForTicks(30)

const p0 = bot.entity.position.floored()
const chestPos = new Vec3(p0.x + 10, p0.y + 3, p0.z)
cmd('setblock', Math.round(chestPos.x), Math.round(chestPos.y), Math.round(chestPos.z), 'minecraft:chest')
console.log(`[diag] chest commanded at ${chestPos.floored()}`)

// setblock -> block update stream; poll until the bot's world view sees it
let landed = null
for (let i = 0; i < 20 && !landed; i++) {
  await bot.waitForTicks(10)
  try {
    const b = bot.blockAt(chestPos)
    if (b && b.name === 'chest') landed = b
  } catch { /* chunk not yet in view */ }
}
if (!landed) {
  console.log('[diag] FAIL: chest never landed in the bot world view (chunk transport?)')
  process.exit(1)
}
console.log(`[diag] chest landed at ${landed.position.floored()}`)

let pass = true

// THE GATE: yard filter ACTIVE (the fleet's exact shape) must still find it
const found = findChest(bot, { maxDistance: 64, yardCenter: p0, log: m => console.log(`[diag] ${m}`) })
if (!found) {
  console.log('[diag] FAIL: findChest with the yard filter returned null (the v0.41.0 palette regression)')
  pass = false
} else {
  console.log(`[diag] findChest found ${found.name} at ${found.position.floored()} (yard filter active)`)
}

// control 1: a far yardCenter must reject the real chest (the wilderness guard is alive)
const farYard = { x: p0.x + 500, y: p0.y, z: p0.z }
const rejected = findChest(bot, { maxDistance: 64, yardCenter: farYard, log: m => console.log(`[diag] ${m}`) })
if (rejected) {
  console.log('[diag] FAIL: a far yardCenter must reject the chest (wilderness hijack reopened)')
  pass = false
} else {
  console.log('[diag] far yardCenter rejects the chest (wilderness guard alive)')
}

// control 2: the exclude list is honored on the real per-block scan
if (found) {
  const excl = findChest(bot, {
    maxDistance: 64, yardCenter: p0,
    exclude: [{ x: Math.round(chestPos.x), y: Math.round(chestPos.y), z: Math.round(chestPos.z) }],
    log: m => console.log(`[diag] ${m}`)
  })
  if (excl) {
    console.log('[diag] FAIL: the excluded chest must not come back')
    pass = false
  } else {
    console.log('[diag] exclude list honored on the real scan')
  }
}

console.log(pass ? '[diag] PASS' : '[diag] FAIL')
process.exit(pass ? 0 : 1)
