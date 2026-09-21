// Surface-handoff e2e diag (v0.37.0): the fleet's 'cannot leave the shaft' class,
// measured on the FIRST run whose bank trips finally fired (35566494961):
//   F2 [F2] climb diag: level at y=64 blocked toward 1,0 (dug=3)   x3 bearings
//   F2 climb out (trip): failed - stalled
//   F2 map trip skipped: cannot leave the shaft                    x11 fleet-wide
// A bot that re-surfaced onto FLAT open ground has no STEP cell in any bearing
// (the support check reads feet+d at feet level = AIR on level terrain), so the
// staircase refuses all four walls and burns its fail budget on a bot that is
// already standing outside. The rise-failure path has handed sky-lit bots to the
// chest walk since v0.23.0 - but only through the terrace probe (solid floor AT
// feet level in front); flat ground has its floor one BELOW, which the old
// verdict could not see. v0.37.0 adds the surface verdict to the BLOCKED path
// and the walkFlat direction to the probe set.
//
//   scripts/server.sh start
//   node testbed/diag-climb-surface.mjs SURFACER
//
// Arena: a flat 13x13 stone platform at y=100 (no step, no nook - the exact
// level-ground shape). The bot stands on it; shaftEntryY is injected 4 levels
// above so the climb MUST try to rise. Pre-fix behaviour: 4 bearings blocked ->
// 'failed - stalled'. Post-fix: the FIRST blocked event returns
// { ok: true, reason: 'walkable surface' } and the bank chain proceeds.
//
// PASS = ok===true with reason 'walkable surface', the bot alive on the platform.
import { createMiner } from '../src/bots/miner.mjs'
import pathfinderPkg from 'mineflayer-pathfinder'
import { execFileSync } from 'node:child_process'
import Vec3 from 'vec3'

const { pathfinder } = pathfinderPkg
const username = process.argv[2] ?? 'SURFACER'
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
if (!bot.hasPlugin(pathfinder)) bot.loadPlugin(pathfinder)

// THIRD arena site: the RISE arena sits at p0.z+60 (z+54..z+66), the WET arena
// at x=[p0+18..p0+62] - this one builds at p0.z+90 so no leftover structure of
// either can touch it, and clears its own volume to air FIRST (v0.32.0 lesson).
const p0 = bot.entity.position.floored()
const PX = p0.x
const PZ = p0.z + 90
const PY = 100 // platform level; the bot's feet sit at PY+1

const tpIn = async () => {
  cmd('tp', username, `${PX + 0.5}`, `${PY + 1}`, `${PZ + 0.5}`)
  await bot.waitForTicks(30)
}
const buildArena = async () => {
  cmd('fill', PX - 6, PY, PZ - 6, PX + 6, PY + 5, PZ + 6, 'air') // clear the volume
  cmd('fill', PX - 6, PY, PZ - 6, PX + 6, PY, PZ + 6, 'stone') // the FLAT platform
  // nothing else: no step, no nook - level ground in every bearing
}
cmd('forceload', 'add', `${PX - 6}`, `${PZ - 6}`, `${PX + 6}`, `${PZ + 6}`)
await bot.waitForTicks(40)
await buildArena() // build BEFORE the tp: a bot arriving onto a built platform cannot fall
await bot.waitForTicks(20)
await tpIn()
await bot.waitForTicks(60)

const at = cell => { try { const b = bot.blockAt(cell); return b ? b.name : 'null' } catch (e) { return `ERR[${e.message.slice(0, 40)}]` } }
let arenaOk = false
for (let v = 0; v < 3 && !arenaOk; v++) {
  await buildArena()
  await bot.waitForTicks(60)
  await tpIn()
  await bot.waitForTicks(40)
  const fchk = bot.entity.position.floored()
  console.log(`[diag] bot entity at (${fchk.x}, ${fchk.y}, ${fchk.z}) - expected x=${PX} z=${PZ}`)
  arenaOk = at(fchk.offset(0, -1, 0)) === 'stone' &&
    at(fchk.offset(1, 0, 0)) === 'air' && // no step UP in front (the support-check blocker)
    at(fchk.offset(1, -1, 0)) === 'stone' // ground one below (the walkFlat direction)
  console.log(`[diag] arena verify ${v + 1}: floor=${at(fchk.offset(0, -1, 0))} frontFeet=${at(fchk.offset(1, 0, 0))} frontGround=${at(fchk.offset(1, -1, 0))} ok=${arenaOk}`)
}
if (!arenaOk) {
  console.log('[diag] VERDICT: ARENA BUILD FAILED - measurements would be spawn-terrain garbage (exit 2)')
  process.exit(2)
}

const feet = bot.entity.position.floored()
const skyFeet = (() => { try { const b = bot.blockAt(feet); return b?.skyLight ?? -1 } catch { return -1 } })()
console.log(`[diag] feet=${at(feet)} skyLight=${skyFeet} front: feet=${at(feet.offset(1, 0, 0))} head=${at(feet.offset(1, 1, 0))} ground=${at(feet.offset(1, -1, 0))}`)

// the climb: target 4 levels above the feet (the injected stale entry level -
// exactly the field shape: the terrain no longer owes those levels, the bot is
// already on open ground). dir +X (pure cardinal, away from the arena edge is
// guaranteed by the 6-block platform radius and the walkFlat handoff).
miner.stats.shaftEntryY = PY + 5
let res = null
try {
  res = await miner.climbOut({ dir: new Vec3(1, 0, 0), shouldStop: () => false })
} catch (e) {
  console.log(`[diag] climbOut threw: ${e.message}`)
}
console.log(`[diag] climbOut result: ${JSON.stringify(res)}`)

const feetAfter = bot.entity.position.floored()
const alive = !!bot.entity && (bot.health ?? 0) > 10
const onPlatform = feetAfter.y === PY + 1
const pass = !!res && res.ok === true && res.reason === 'walkable surface' && alive && onPlatform
console.log(`[diag] VERDICT: ${pass ? 'PASS' : 'FAIL'} - ok=${res?.ok} reason=${res?.reason} alive=${alive} onPlatform=${onPlatform} feet=${feetAfter.x},${feetAfter.y},${feetAfter.z}`)
console.log(`[diag] pre-fix this arena stalled: 4 bearings blocked (no step UP on flat ground) -> 'failed - stalled'`)
process.exit(pass ? 0 : 1)
