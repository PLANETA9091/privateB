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
await bot.waitForTicks(20)

cmd('tp', username, `${PX + 0.9}`, `${PY + 1}`, `${PZ + 0.5}`)
await bot.waitForTicks(20)
const feet = bot.entity.position.floored()
const at = cell => { try { const b = bot.blockAt(cell); return b ? b.name : 'null' } catch { return 'err' } }
console.log(`[diag] feet=${at(feet)} support(step)=${at(feet.offset(1, 0, 0))} step=${at(feet.offset(1, 1, 0))} aboveStep=${at(feet.offset(1, 2, 0))} head=${at(feet.offset(0, 2, 0))}`)
console.log(`[diag] walls behind=${at(feet.offset(-1, 0, 0))} north=${at(feet.offset(0, 0, -1))} south=${at(feet.offset(0, 0, 1))}`)

// the raw stepUp sequence - byte-for-byte the climb's double attempt
// (12-tick hold, then a 24-tick hold on the same bearing)
const TRIALS = 6
let fails = 0
let assistWins = 0
for (let t = 0; t < TRIALS; t++) {
  // per-trial guard: deaths/escapes leave the bot off the nook - re-seat it
  if (bot.entity.position.floored().y !== PY + 1) {
    cmd('tp', username, `${PX + 0.9}`, `${PY + 1}`, `${PZ + 0.5}`)
    await bot.waitForTicks(20)
  }
  const f = bot.entity.position.floored()
  const raw = async holdTicks => {
    await bot.lookAt(f.offset(1, 1, 0).offset(0.5, 0.5, 0.5), true)
    bot.setControlState('forward', true)
    bot.setControlState('jump', true)
    await bot.waitForTicks(holdTicks)
    bot.setControlState('forward', false)
    bot.setControlState('jump', false)
    await bot.waitForTicks(4)
    return bot.entity.position.floored().y > f.y
  }
  let rose = false
  try { rose = await raw(12) } catch { /* count below */ }
  if (!rose) { try { rose = await raw(24) } catch { /* count below */ } }
  if (!rose) {
    fails++
    // THE CURE (v0.27.0): the bounded pathfinder assist - gotoSafe to the
    // step-top, exactly what miner.mjs climbOut now does on a double fail
    try {
      const top = f.offset(1, 1, 0)
      await gotoSafe(bot, new goals.GoalBlock(top.x, top.y, top.z), { timeoutMs: 4500, label: 'diag rise assist' })
      rose = bot.entity.position.floored().y > f.y
      if (rose) assistWins++
      console.log(`[diag] trial ${t + 1}: raw FAILED - assist ${rose ? 'ROSE (cure works)' : 'also failed'}`)
    } catch (e) {
      console.log(`[diag] trial ${t + 1}: raw FAILED - assist threw: ${e.message}`)
    }
  }
  console.log(`[diag] trial ${t + 1}/${TRIALS}: rose=${rose} y=${bot.entity.position.floored().y}`)
  if (rose || bot.entity.position.floored().y > PY + 1) {
    cmd('tp', username, `${PX + 0.9}`, `${PY + 1}`, `${PZ + 0.5}`)
    await bot.waitForTicks(15)
  } else {
    await bot.waitForTicks(15)
  }
}

const alive = !!bot.entity && (bot.health ?? 0) > 10
console.log(`[diag] raw-failures=${fails}/${TRIALS} assist-wins=${assistWins}/${fails} alive=${alive} hp=${bot.health}`)
let pass
if (fails === 0) {
  console.log(`[diag] VERDICT: INCONCLUSIVE - raw never failed this run, the assist went unexercised (the mechanic is sound enough; rerun to try again)`)
  pass = true
} else {
  pass = alive && assistWins === fails
  console.log(`[diag] VERDICT: ${pass ? 'PASS' : 'FAIL'} - the assist must recover every raw failure on clean geometry`)
}
process.exit(pass ? 0 : 1)
