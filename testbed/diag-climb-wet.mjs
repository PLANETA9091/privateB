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

const p = bot.entity.position.floored()
const cx = p.x + 6
const cz = p.z
const DEPTH = 8
const groundY = p.y // the bot stands on the surface at groundY; ground body below
// skyLight telemetry: if this stack never populates block.skyLight, pillarTarget
// degrades to the cap target (feet+maxUp) and res.ok may stay false even on a
// clean escape - which is exactly why the pass criterion below is SURFACE-
// relative (onSurface/outOfWater), not climbOut-return-relative.
cmd('fill', cx, groundY - DEPTH, cz, cx, groundY - 1, cz, 'stone') // seal the column solid first
await bot.waitForTicks(20)
cmd('fill', cx, groundY - DEPTH, cz, cx, groundY - 1, cz, 'air') // hollow it
cmd('fill', cx, groundY - DEPTH, cz, cx, groundY - 1, cz, 'water') // fill it with sources
await bot.waitForTicks(40) // let the water settle into a full column
const mouth = bot.blockAt(new (bot.entity.position.floored().constructor)(cx, groundY, cz))
console.log(`[diag] well mouth block=${mouth?.name} skyLight=${mouth?.skyLight} (null/undefined = the stack never fills it)`)

// drop the bot to the well bottom: feet in the lowest water cell, 7 water
// blocks above its head - the exact F7 signature
cmd('tp', username, cx + 0.5, groundY - DEPTH, cz + 0.5)
await bot.waitForTicks(20)
const check = bot.entity?.position?.floored()
console.log(`[diag] bot in the well at ${check} (ground ${groundY}) - running climbOut`)

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
