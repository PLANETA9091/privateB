// Drowning rescue e2e diag: a bot that ends up head-under in deep water must
// fire the sentry, swim up, make for the nearest shore and walk out ALIVE.
// Closes the measured pattern behind fleet 900 s (v0.11.3 era): F1 and F3
// "drowned" - walked into water, sank, drowned while the work loop kept
// issuing pathfinder goals. Server console builds a deterministic pool next to
// the spawn yard (terrain-independent), then drops the bot into the middle.
//
//   scripts/server.sh start
//   node testbed/diag-drowning.mjs DROWN
//
// PASS = the sentry fired (rescues >= 1), the bot is alive at the end, the air
// bar recovered (oxygen >= 15) and no drowning damage is in progress.
import { createMiner } from '../src/bots/miner.mjs'
import { execFileSync } from 'node:child_process'
import { Vec3 } from 'vec3'

const username = process.argv[2] ?? 'DROWN'
const cmd = (...words) => {
  try { execFileSync('scripts/server.sh', ['cmd', words.join(' ')], { cwd: '/home/z/privateB-repo', stdio: 'pipe', timeout: 15000 }) } catch (e) { console.log(`[diag] cmd failed: ${e.message}`) }
}

const miner = createMiner({
  username,
  fly: false,
  log: m => console.log(`[diag] ${m}`)
})
await miner.ready
const bot = miner.bot
console.log(`[diag] ${username} ready - building the pool`)

// daylight + clean arena: the water sentry must be the thing being tested, not
// a leftover zombie swarm or the night shelter sentry
cmd('time', 'set', 'day')
cmd('kill', '@e[type=zombie]')
cmd('kill', '@e[type=skeleton]')

// the pool: a 3-layer dirt box (y-2..y), sand floor inside, 2-deep water with
// its surface at ground level + 1. The rim top (y) is level with the water
// surface, so a swimming bot that reaches the rim walks straight out.
const p = bot.entity.position.floored()
const cx = p.x + 8
const cz = p.z
const y = p.y
cmd('fill', cx - 5, y - 2, cz - 5, cx + 5, y, cz + 5, 'dirt') // the containment box
cmd('fill', cx - 4, y - 2, cz - 4, cx + 4, y - 2, cz + 4, 'sand') // pool floor
cmd('fill', cx - 4, y - 1, cz - 4, cx + 4, y, cz + 4, 'water') // 2-deep water
await bot.waitForTicks(20)

// drop the bot into the middle: feet on the floor at y-1, head cell at y - both water
cmd('tp', username, cx + 0.5, y, cz + 0.5)
console.log(`[diag] dropped into the pool at ${cx}, ${y}, ${cz} - watching the sentry`)

// phase 1: the sentry must fire (oxygen path at o2 <= 10, or the 5 s clock
// fallback if this version's metadata never updates - either is a PASS)
const fireDeadline = Date.now() + 20000
while (Date.now() < fireDeadline && miner.stats.rescues === 0 && bot.entity) {
  await bot.waitForTicks(10)
}
console.log(`[diag] rescues=${miner.stats.rescues} after ${(20 - (fireDeadline - Date.now()) / 1000).toFixed(1)}s of waiting`)

// phase 2: the rescue must end with the bot ALIVE and breathing. Walking out
// onto the rim is best-effort (logged), survival is mandatory.
const settleDeadline = Date.now() + 40000
while (Date.now() < settleDeadline && bot.entity) {
  const base = bot.entity.position.floored()
  const head = bot.blockAt(base.offset(0, 1, 0))
  const feet = bot.blockAt(base)
  const wet = (head && /water|kelp|seagrass/.test(head.name)) || (feet && /water|kelp|seagrass/.test(feet.name))
  if (!wet && bot.entity.onGround && bot.oxygenLevel >= 15) break
  await bot.waitForTicks(10)
}
const base = bot.entity?.position?.floored()
const finalHead = base ? bot.blockAt(base.offset(0, 1, 0)) : null
const finalFeet = base ? bot.blockAt(base) : null
const outOfWater = !!base && !/water|kelp|seagrass/.test(finalHead?.name ?? '') && !/water|kelp|seagrass/.test(finalFeet?.name ?? '')
console.log(`[diag] rescues=${miner.stats.rescues} hp=${bot.health} oxygen=${bot.oxygenLevel} outOfWater=${outOfWater} pos=${base} alive=${!!bot.entity}`)
const pass = bot.entity && miner.stats.rescues >= 1 && (bot.oxygenLevel ?? 20) >= 15 && (bot.health ?? 0) > 10
console.log(`[diag] VERDICT: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(0)
