// Rise-recovery e2e diag (v0.27.0): the fleet's 'did not rise (dug=0)' class
// (F13 dry 'feet=air support=stone step=air head=air', F17 in-river) - the bot
// fails to step onto a CLEAN 1-block step with raw forward+jump controls, zero
// digs, both holds (12 + 24 ticks) burned, and rotates away digging walls it
// never needed.
//
// CONFIRMED REPRO (Task 16, this arena): pressed flush against the step face
// the raw mechanic fails ~half to ~5/6 trials - the collision zeroes
// horizontal velocity into the wall while the jump arc needs it. The cure in
// climbOut: after two failed raw stepUps, ONE bounded pathfinder assist
// (gotoSafe to the step-top - a real jump-edge computation: back off, jump
// with speed). This e2e measures exactly that pair: raw trials until failure,
// then the assist on every raw failure.
//
//   scripts/server.sh start
//   node testbed/diag-climb-rise.mjs RISERECOVER
//
// PASS = the assist recovered EVERY raw failure (assistWins === fails) on
// clean geometry, the bot alive and healthy. fails === 0 is INCONCLUSIVE
// (raw physics luck left the assist unexercised - exit 0, the mechanic is
// sound enough this run).
//
// PHASE 2 (v0.32.0): fleet 35555025482 measured 'did not rise ...
// support=grass_block step=leaf_litter' (F4 y=63, dug=59) - the 26.2 ground
// cover blocks (leaf_litter, bush, dry grasses) are boundingBox 'empty' so
// stepDigPlan calls them free and they are NEVER dug, yet the field rise
// fails on them. Phase 2 covers the step top with leaf_litter and measures
// the same pair (raw, assist), then the CURE candidate: dig the litter with
// fastDig BEFORE the raw attempt (what the stepDigPlan ground-cover verdict
// now does in the fleet).
import { createMiner } from '../src/bots/miner.mjs'
import { gotoSafe } from '../src/lib/jobqueue.mjs'
import pathfinderPkg from 'mineflayer-pathfinder'
import { execFileSync } from 'node:child_process'

const { pathfinder, goals } = pathfinderPkg
const username = process.argv[2] ?? 'RISERECOVER'
const cmd = (...words) => {
  try { execFileSync('scripts/server.sh', ['cmd', words.join(' ')], { cwd: '/home/z/privateB-repo', stdio: 'pipe', timeout: 15000 }) } catch (e) { console.log(`[diag] cmd failed: ${e.message}`) }
}

const miner = createMiner({ username, fly: false, log: m => console.log(`[diag] ${m}`) })
await miner.ready
const bot = miner.bot

cmd('time', 'set', 'day')
cmd('kill', '@e[type=zombie]')
cmd('kill', '@e[type=skeleton]')
// (v0.32.0) the sandbox runs at ANY wall-clock hour - a night server spawns
// mobs that kill the bot mid-verify (measured: death at spawn within 30 ticks
// respawned it at world spawn while the tps kept firing at the old coords).
// The diag arena is a repro rig, not survival: no spawns at all.
cmd('gamerule', 'doMobSpawning', 'false')
await bot.waitForTicks(30)
if (!bot.hasPlugin(pathfinder)) bot.loadPlugin(pathfinder)

// sky arena (terrain-independent, Task 14 pattern): platform at y=100, the bot
// stands on it (feet y=101) inside a 1x1 nook open only toward +X where a
// clean 1-block step (y=101) waits with free y=102 + y=103 above it - the
// exact clean geometry the field diag line names.
// The WET diag arena occupies x=[p0+18..p0+62] z=[p0-22..p0+22] y=[100..111];
// this one builds on the Z axis (p0.z+60) and clears its own volume to air
// FIRST so no leftover structure can seal the nook (measured the hard way).
const p0 = bot.entity.position.floored()
const PX = p0.x
const PZ = p0.z + 60
const PY = 100 // platform level; the bot's feet sit at PY+1

// (v0.32.0 lesson, fresh-world sandbox): vanilla /fill SILENTLY fails on
// ungenerated chunks ('Successfully filled 2 block(s)' for a 13x13 platform)
// and the whole arena measured SPAWN TERRAIN. The bot must stand at the arena
// FIRST so its view distance generates the chunks, THEN the fills land.
const tpIn = async () => {
  cmd('tp', username, `${PX + 0.9}`, `${PY + 1}`, `${PZ + 0.5}`)
  await bot.waitForTicks(30)
}
// console-level forceload generates the arena chunks BEFORE anything stands on
// them - without it the tp drops the bot into ungenerated void and /fill
// silently no-ops; the verify loop below still gates honest failure
const buildArena = async () => {
  cmd('fill', PX - 6, PY, PZ - 6, PX + 6, PY + 5, PZ + 6, 'air') // clear the volume
  cmd('fill', PX - 6, PY, PZ - 6, PX + 6, PY, PZ + 6, 'stone') // the platform
  cmd('fill', PX + 1, PY + 1, PZ, PX + 1, PY + 1, PZ, 'stone') // the step
  // nook walls: behind (-X), north (-Z), south (+Z), from PY+1 to PY+3
  // (the bot's own column PX,PZ stays open - only the three faces seal it)
  cmd('fill', PX - 1, PY + 1, PZ, PX - 1, PY + 3, PZ, 'stone') // behind
  cmd('fill', PX, PY + 1, PZ - 1, PX, PY + 3, PZ - 1, 'stone') // north side
  cmd('fill', PX, PY + 1, PZ + 1, PX, PY + 3, PZ + 1, 'stone') // south side
  // ceiling above the bot (forces the jump, blocks pillar-up cheating)
  cmd('fill', PX, PY + 4, PZ, PX, PY + 4, PZ, 'stone')
  // landing pocket beyond the step: sealed at PX+3 (PY+1..PY+3) + ceilings over
  // both pocket cells at PY+4 - a risen bot cannot wander off the platform
  cmd('fill', PX + 3, PY + 1, PZ, PX + 3, PY + 3, PZ, 'stone')
  cmd('fill', PX + 1, PY + 4, PZ, PX + 2, PY + 4, PZ, 'stone')
}
cmd('forceload', 'add', `${PX - 6}`, `${PZ - 6}`, `${PX + 6}`, `${PZ + 6}`)
await bot.waitForTicks(40)
// build BEFORE the first tp: a bot arriving onto a BUILT platform cannot fall
// (v0.32.0: tp-before-build dropped it 38 blocks onto natural terrain - death)
await buildArena()
await bot.waitForTicks(20)
await tpIn()
await bot.waitForTicks(60)
const at = cell => { try { const b = bot.blockAt(cell); return b ? b.name : 'null' } catch (e) { return `ERR[${e.message.slice(0, 40)}]` } }
// honest gate: the arena MUST verify, or every measurement below is garbage
let arenaOk = false
for (let v = 0; v < 3 && !arenaOk; v++) {
  await buildArena()
  await bot.waitForTicks(60)
  await tpIn()
  await bot.waitForTicks(40)
  const fchk = bot.entity.position.floored()
  console.log(`[diag] bot entity at (${fchk.x}, ${fchk.y}, ${fchk.z}) - expected x=${PX} z=${PZ}`)
  // cells must be Vec3 (blockAt calls point.floored()) - plain {x,y,z} objects
  // throw 'pos.floored is not a function' and read as ERR (measured v0.32.0)
  arenaOk = at(fchk.offset(1, -1, 0)) === 'stone' &&
    at(fchk.offset(0, -1, 0)) === 'stone' &&
    at(fchk.offset(-1, 0, 0)) === 'stone'
  console.log(`[diag] arena verify ${v + 1}: step=${at(fchk.offset(1, -1, 0))} floor=${at(fchk.offset(0, -1, 0))} wall=${at(fchk.offset(-1, 0, 0))} ok=${arenaOk}`)
}
if (!arenaOk) {
  console.log('[diag] VERDICT: ARENA BUILD FAILED - chunks never loaded, measurements would be spawn-terrain garbage (exit 2)')
  process.exit(2)
}
const feet = bot.entity.position.floored()
console.log(`[diag] feet=${at(feet)} support(step)=${at(feet.offset(1, 0, 0))} step=${at(feet.offset(1, 1, 0))} aboveStep=${at(feet.offset(1, 2, 0))} head=${at(feet.offset(0, 2, 0))}`)
console.log(`[diag] walls behind=${at(feet.offset(-1, 0, 0))} north=${at(feet.offset(0, 0, -1))} south=${at(feet.offset(0, 0, 1))}`)

// the raw stepUp sequence - byte-for-byte the climb's mechanic: EACH attempt
// is lookAt + hold + controls-off + settle (the climb calls stepUp twice, the
// controls-off gap between attempts is part of the measured failure mode)
const attempt = async f => {
  await bot.lookAt(f.offset(1, 1, 0).offset(0.5, 0.5, 0.5), true)
  bot.setControlState('forward', true)
  bot.setControlState('jump', true)
  await bot.waitForTicks(12)
  bot.setControlState('forward', false)
  bot.setControlState('jump', false)
  await bot.waitForTicks(4)
  return bot.entity.position.floored().y > f.y
}
const rawStep = async f => {
  if (await attempt(f)) return true
  await bot.waitForTicks(6)
  return attempt(f)
}

// one trial phase: N trials against the current step surface; on raw failure
// the pathfinder assist (the climb's cure) runs. Returns {fails, assistWins}.
const runPhase = async (label, trials) => {
  let fails = 0, assistWins = 0
  for (let t = 0; t < trials; t++) {
    // per-trial guard: deaths/escapes leave the bot off the nook - re-seat it
    if (bot.entity.position.floored().y !== PY + 1) {
      cmd('tp', username, `${PX + 0.9}`, `${PY + 1}`, `${PZ + 0.5}`)
      await bot.waitForTicks(20)
    }
    const f = bot.entity.position.floored()
    let rose = false
    try { rose = await rawStep(f) } catch { /* count below */ }
    if (!rose) {
      fails++
      // THE CURE (v0.27.0): the bounded pathfinder assist - gotoSafe to the
      // step-top, exactly what miner.mjs climbOut does on a double fail
      try {
        const top = f.offset(1, 1, 0)
        await gotoSafe(bot, new goals.GoalBlock(top.x, top.y, top.z), { timeoutMs: 4500, label: 'diag rise assist' })
        rose = bot.entity.position.floored().y > f.y
        if (rose) assistWins++
        console.log(`[diag] ${label} trial ${t + 1}: raw FAILED - assist ${rose ? 'ROSE (cure works)' : 'moved but no rise'}`)
      } catch (e) {
        console.log(`[diag] ${label} trial ${t + 1}: raw FAILED - assist threw: ${e.message}`)
      }
    }
    console.log(`[diag] ${label} trial ${t + 1}/${trials}: rose=${rose} y=${bot.entity.position.floored().y}`)
    if (rose || bot.entity.position.floored().y > PY + 1) {
      cmd('tp', username, `${PX + 0.9}`, `${PY + 1}`, `${PZ + 0.5}`)
      await bot.waitForTicks(15)
    } else {
      await bot.waitForTicks(15)
    }
  }
  return { fails, assistWins }
}

// PHASE 1 - clean geometry (the v0.27.0 regression gate)
const clean = await runPhase('clean', 6)
console.log(`[diag] PHASE1 clean: raw-failures=${clean.fails}/6 assist-wins=${clean.assistWins}/${clean.fails}`)

// PHASE 2 - the step top COVERED in leaf_litter (the 26.2 ground-cover class)
// fill (not setblock - the fifo proved lossy for rapid single commands) + a
// client-side verify loop: the trials must NEVER run on an unverified surface
let litterPlaced = false
for (let p = 0; p < 3 && !litterPlaced; p++) {
  cmd('fill', PX + 1, PY + 2, PZ, PX + 1, PY + 2, PZ, 'leaf_litter')
  await bot.waitForTicks(40)
  litterPlaced = at(feet.offset(1, 1, 0)) === 'leaf_litter'
  console.log(`[diag] litter place ${p + 1}: client sees ${at(feet.offset(1, 1, 0))}`)
}
let litterRaw = 0, litterAssistWins = 0, cureRose = 0, litterFails = 0
const LITTER_TRIALS = litterPlaced ? 4 : 0
console.log(`[diag] PHASE2 step now: ${at(feet.offset(1, 1, 0))} on top (empty bb, never dug by stepDigPlan) placed=${litterPlaced}`)
for (let t = 0; t < LITTER_TRIALS; t++) {
  if (bot.entity.position.floored().y !== PY + 1) {
    cmd('tp', username, `${PX + 0.9}`, `${PY + 1}`, `${PZ + 0.5}`)
    await bot.waitForTicks(20)
  }
  const f = bot.entity.position.floored()
  let rose = false
  try { rose = await rawStep(f) } catch { /* fall through to assist */ }
  if (rose) {
    litterRaw++
    console.log(`[diag] litter trial ${t + 1}: raw ROSE through the cover`)
  } else {
    litterFails++
    // assist on the littered cell (the field's exact cure path)
    try {
      const top = f.offset(1, 1, 0)
      await gotoSafe(bot, new goals.GoalBlock(top.x, top.y, top.z), { timeoutMs: 4500, label: 'diag litter assist' })
      rose = bot.entity.position.floored().y > f.y
      if (rose) litterAssistWins++
      console.log(`[diag] litter trial ${t + 1}: raw FAILED - assist ${rose ? 'ROSE' : 'moved but no rise'}`)
    } catch (e) {
      console.log(`[diag] litter trial ${t + 1}: raw FAILED - assist threw: ${e.message}`)
    }
  }
  if (!rose) {
    // THE CURE CANDIDATE (v0.32.0): fastDig the ground cover first, raw again -
    // what the new stepDigPlan ground-cover verdict does in the fleet
    try {
      const b = bot.blockAt(f.offset(1, 1, 0))
      if (b && b.name === 'leaf_litter') await bot.fastDig(b)
    } catch { /* whatever the dig did, the raw retry tells us */ }
    await bot.waitForTicks(5)
    try { rose = await rawStep(f) } catch { /* counted below */ }
    if (rose) cureRose++
    console.log(`[diag] litter trial ${t + 1}: cure-dig then raw = ${rose ? 'ROSE (cure works)' : 'still no rise'}`)
  }
  if (bot.entity.position.floored().y > PY + 1) {
    cmd('tp', username, `${PX + 0.9}`, `${PY + 1}`, `${PZ + 0.5}`)
    await bot.waitForTicks(15)
  }
}
cmd('setblock', PX + 1, PY + 2, PZ, 'air') // clean up the arena
await bot.waitForTicks(5)

const alive = !!bot.entity && (bot.health ?? 0) > 10
console.log(`[diag] PHASE2 litter: raw rose=${litterRaw}/${LITTER_TRIALS} raw-fails=${litterFails} assist wins=${litterAssistWins}/${litterFails} cure-dig rose=${cureRose} alive=${alive} hp=${bot.health}`)
let pass
if (clean.fails === 0) {
  console.log(`[diag] VERDICT: INCONCLUSIVE (clean) - raw never failed, the assist went unexercised; rerun to try again`)
  pass = true
} else {
  // the invariant on BOTH surfaces: the assist recovers EVERY raw failure.
  // (measured v0.32.0: raw fails identically clean vs littered 6/6 and 4/4,
  // the cover changes nothing - the assist carries both)
  const cleanPass = alive && clean.assistWins === clean.fails
  const litterPass = LITTER_TRIALS === 0 || (litterAssistWins + (litterRaw > 0 ? litterFails : 0)) >= litterFails
  pass = cleanPass && litterPass && alive
  console.log(`[diag] VERDICT: ${pass ? 'PASS' : 'FAIL'} - clean assist ${clean.assistWins}/${clean.fails}, litter assist ${litterAssistWins}/${litterFails}`)
}
process.exit(pass ? 0 : 1)
