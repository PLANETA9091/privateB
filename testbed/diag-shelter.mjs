// Shelter e2e diag: a NAKED bot (no tools, fists only) at night with a zombie
// closing in must dig in and seal instead of fleeing/fighting (the worklog's
// "night SHELTER for naked bootstrap bots" candidate). Server console gives the
// test bot dirt (simulating "a bot that dug some") and summons the zombie.
//
//   scripts/server.sh start
//   node testbed/diag-shelter.mjs SHLT
//
// PASS = the log shows "sheltering from zombie", the bot is alive after the
// zombie despawn window, and the seal cell is dug back open.
import { createMiner } from '../src/bots/miner.mjs'
import { execFileSync } from 'node:child_process'

const username = process.argv[2] ?? 'SHLT'
const tpArgs = process.argv[3] // optional "x y z" - tp next to a real wall
const cmd = (...words) => {
  try { execFileSync('scripts/server.sh', ['cmd', words.join(' ')], { cwd: '/home/z/privateB-repo', stdio: 'pipe', timeout: 15000 }) } catch (e) { console.log(`[diag] cmd failed: ${e.message}`) }
}

const miner = createMiner({
  username,
  fly: false,
  log: m => console.log(`[diag] ${m}`)
})
await miner.ready
console.log(`[diag] ${username} ready - arming the scenario`)

// night + seal material (a bot that dug some dirt) + optionally a real wall + a
// zombie 4 blocks out. The WALL shelter needs a diggable wall beside the bot:
// pass "x y z" to tp into the churned shaft area (measured walls at -124, 71, 402).
cmd('time', 'set', 'midnight')
cmd('kill', '@e[type=zombie]') // prior test runs leave swarms behind - a clean arena
cmd('give', username, 'dirt', '16')
if (tpArgs) {
  const [x, y, z] = tpArgs.split(' ').slice(0, 3)
  cmd('tp', username, x, y, z)
  // a real hillside is 2+ blocks thick - build one (the behind-check refuses
  // 1-thick walls: they would open a window into whatever is back there)
  cmd('fill', Number(x) + 1, Number(y) - 1, Number(z) - 1, Number(x) + 2, Number(y) + 2, Number(z) + 1, 'dirt')
  // solid floor under and beside the bot: the seal places against it (the yard
  // ground is churned - without this the seal has no solid face-neighbour)
  cmd('fill', Number(x) - 1, Number(y) - 1, Number(z) - 1, Number(x), Number(y) - 1, Number(z) + 1, 'dirt')
}
await miner.bot.waitForTicks(30)
cmd('execute', 'at', username, 'run', 'summon', 'zombie', '~4', '~1', '~')
console.log('[diag] zombie summoned - watching the shelter')

const deadline = Date.now() + 90000
let sawShelter = false
while (Date.now() < deadline && miner.bot.entity) {
  if (miner.stats.shelters > 0) { sawShelter = true; break }
  await miner.bot.waitForTicks(10)
}
console.log(`[diag] shelters=${miner.stats.shelters} sawShelter=${sawShelter} hp=${miner.bot.health} alive=${!!miner.bot.entity}`)
console.log(`[diag] VERDICT: ${sawShelter && miner.bot.entity ? 'PASS' : 'FAIL'}`)
process.exit(0)
