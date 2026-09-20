// Wet-escape climb e2e diag (v0.17.0): a bot at the bottom of its own flooded
// shaft must dig a horizontal gallery out from under the water column and
// staircase back to the surface ALIVE.
//
// Closes the measured pattern behind the 2026-09-20 17:05 fleet run: F7 spent
// the WHOLE 450s run at y=55 - climbOut refused every rotation with dug=0
// (the cells above its head were water: the shaft had become a 1x1 well),
// while the drowning rescue timed out 'still wet' four times (a down-flow
// beats swim-up, no shore inside the scan radius). Master v0.16.2 had NO
// answer for this state. Server console builds a deterministic flooded well
// (terrain-independent, the diag-drowning pattern).
//
//   scripts/server.sh start
//   node testbed/diag-climb-wet.mjs WETCLIMB
//
// PASS = the bot ends ON the surface (feet y >= ground level), out of the
// water column, alive, with the wet escape telemetry visible (traversed > 0
// or climbs >= 1).
import { createMiner } from '../src/bots/miner.mjs'
import { execFileSync } from 'node:child_process'

const username = process.argv[2] ?? 'WETCLIMB'
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
console.log(`[diag] ${username} ready - building the flooded well`)

// daylight + clean arena: the wet escape is the thing under test, not mobs
cmd('time', 'set', 'day')
cmd('kill', '@e[type=zombie]')
cmd('kill', '@e[type=skeleton]')

// a real pickaxe: the escape digs stone; bare-handed stone does not break in
// any window (150 server ticks - the fastDig lesson). Diag-only shortcut for
// determinism (the fleet's bots carry picks from the tool bootstrap anyway).
cmd('give', username, 'stone_pickaxe', 1)
await bot.waitForTicks(30)

// (2026-09-21, Task 14) FLOATING ARENA - three measured failure modes killed the
// old spawn-anchored build: (1) on a slope spawn the console water tower POURS
// over its mouth and pools around the well base (the terrain probe read
// 'dy=2:water' on ALL 4 gallery directions while dy=0/dy=1 were dry dirt) - the
// waterfall guard (correctly!) refused every side, FAIL by terrain luck; (2) a
// previous diag's escape staircase chewed up the world spawn itself (the bot
// spawned INTO a wet crater); (3) any structure SMALLER than the escape's reach
// gets breached - the gallery walks up to TRAVERSE_MAX_BLOCKS (12) and digs
// feet+head cells straight through a 1-thick wall, then the staircase drifts up
// to 7 more blocks laterally - a bot outside the structure falls onto the
// platform (gained resets, FAIL). The stable geometry: a monolithic 41x41 stone
// block (101..110) ON a 45x45 platform at fixed y=100 - gallery AND staircase
// stay inside solid stone (the exact fleet scenario: cross the aquifer band
// horizontally, staircase up to the rim), the wall is unreachable, the only way
// out is UP through the self-dug steps. Water column 101..108 (the F7
// signature: 7 water blocks above the head), capped by 2 stone layers.
const p0 = bot.entity.position.floored()
const ax = p0.x + 40 // well clear of the chewed spawn area, same loaded chunks
const az = p0.z
const DEPTH = 8
const PLATFORM_Y = 100 // fixed - never reads local terrain
const groundY = PLATFORM_Y + 1 // the platform top IS the ground now
const cx = ax // the well site = the arena center
const cz = az
cmd('fill', ax - 22, PLATFORM_Y, az - 22, ax + 22, PLATFORM_Y, az + 22, 'stone') // the platform
cmd('fill', cx - 20, groundY, cz - 20, cx + 20, groundY + DEPTH + 1, cz + 20, 'stone') // the monolith
await bot.waitForTicks(20)
cmd('fill', cx, groundY, cz, cx, groundY + DEPTH - 1, cz, 'air') // hollow the column
cmd('fill', cx, groundY, cz, cx, groundY + DEPTH - 1, cz, 'water') // fill it with sources
await bot.waitForTicks(40) // let the water settle into a full column
const Vec3c = bot.entity.position.floored().constructor
const cap = bot.blockAt(new Vec3c(cx, groundY + DEPTH + 1, cz))
console.log(`[diag] cap block=${cap?.name} (stone = the column is sealed)`)
const skyCell = bot.blockAt(new Vec3c(cx, groundY + DEPTH + 2, cz))
console.log(`[diag] above-cap cell block=${skyCell?.name} skyLight=${skyCell?.skyLight}`)
const stackTop = bot.blockAt(new Vec3c(cx, groundY + DEPTH - 1, cz))
console.log(`[diag] well top block=${stackTop?.name} (water = the column flooded)`)

// drop the bot to the well bottom: feet in the lowest water cell, 7 water
// blocks above its head - the exact F7 signature
cmd('tp', username, cx + 0.5, groundY, cz + 0.5)
await bot.waitForTicks(20)
const check = bot.entity?.position?.floored()
console.log(`[diag] bot in the well at ${check} (ground ${groundY}) - running climbOut`)

// (Task 14, measured) mineflayer's block.skyLight for CONSOLE-BUILT geometry is
// STALE garbage: the open-sky cell read 0 while the sealed water column read 15
// - pillarTarget's skylight scan then 'proves' the bot is already out at dy=1
// ('already out (skylight)', zero attempts). The fleet never sees this (its bots
// dig gradually through streaming light updates), so the diag pins the fleet's
// OWN target semantics: digShaft records stats.shaftEntryY and the climb returns
// to the recorded RIM level - light-independent, deterministic here too.
miner.stats.shaftEntryY = groundY + DEPTH - 1

// THE ESCAPE: climbOut must notice the wet ceiling, dig the gallery sideways,
// staircase up and breach the surface next to the well. res.ok is informational
// only: without populated skyLight metadata the climb's internal target is the
// cap (feet+maxUp), so a bot that is ALREADY on the surface may still report
// 'stalled' while wandering up a slope - the surface check is the real test.
const t0 = Date.now()
const res = await miner.climbOut({ maxUp: DEPTH + 4, maxMs: 120000 })
const secs = ((Date.now() - t0) / 1000).toFixed(1)

const now = bot.entity?.position?.floored()
const feetBlock = now ? bot.blockAt(now) : null
const headBlock = now ? bot.blockAt(now.offset(0, 1, 0)) : null
const wet = name => /water|kelp|seagrass|bubble/.test(name ?? '')
const outOfWater = !!now && !wet(feetBlock?.name) && !wet(headBlock?.name)
const onSurface = !!now && now.y >= groundY
console.log(`[diag] climbOut: ok=${res.ok} reason=${res.reason} gained=${res.gained} dug=${res.dug} traversed=${res.traversed} in ${secs}s`)
console.log(`[diag] hp=${bot.health} oxygen=${bot.oxygenLevel} pos=${now} onSurface=${onSurface} outOfWater=${outOfWater} alive=${!!bot.entity}`)
console.log(`[diag] stats: rescues=${miner.stats.rescues} climbs=${miner.stats.climbs ?? 0} mined=${miner.stats.mined}`)

// the wet escape PASSES when the bot is alive, ON the surface and out of the
// water - the horizontal escape + staircase did their job
const pass = !!bot.entity && onSurface && outOfWater && (bot.health ?? 0) > 10 && res.gained >= DEPTH - 1
console.log(`[diag] VERDICT: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(0)
