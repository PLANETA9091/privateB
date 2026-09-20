#!/usr/bin/env node
// E2E check for the v0.15.0 claim layer over REAL bots on the live server.
//
// The 8-bot fleet run showed claims=0 because every map trip died EARLIER in the
// pipeline: ensureSurface('trip') -> climbOut stalled at the y=42 aquifer terrain
// (the v0.14.x staircase refusing its step cells). That is the other agent's active
// area. This diag bypasses the shaft/climb half and drives mapTrip directly, which
// is the only new wiring: with two equidistant seeded clusters, bot 2 must be
// STEERED off bot 1's claimed cluster by the shared board.
//
//   node testbed/diag-claims.mjs
import { createMiner } from '../src/bots/miner.mjs'
import { WorldMap } from '../src/fleet/worldmap.mjs'
import { ClaimBoard } from '../src/fleet/claims.mjs'
import { Vec3 } from 'vec3'

const log = m => console.log(`[diag] ${m}`)
const map = new WorldMap()
const board = new ClaimBoard()

const boot = await createMiner({ username: 'DiagBoot', mode: 'rage', fly: false, log: () => {} })
await boot.ready
const spawn = boot.bot.entity.position.floored()
log(`spawn at ${spawn}`)
boot.bot.quit()

// Two sand clusters, symmetric around spawn (both ~75 blocks), so the ONLY thing
// that can separate the bots' choices is the claim penalty. verify=false in
// mapTargetFor means the seeded positions are not block-checked - the claim layer
// is what we are testing, not the harvest.
const clusterPos = { A: [], B: [] }
const seedCluster = (label, dx, dz) => {
  const base = new Vec3(spawn.x + dx, spawn.y, spawn.z + dz)
  for (let i = 0; i < 5; i++) {
    const pos = base.offset(i, 0, 0)
    map.add('sand', pos)
    clusterPos[label].push(pos)
  }
  log(`cluster ${label} seeded around ${base.floored()}`)
  return base
}
const clusterA = seedCluster('A', 75, 0)
const clusterB = seedCluster('B', 0, 75)

// a claim counts as "on cluster X" when it sits on ANY of its seeded positions
const claimOnAny = (label, owner) => clusterPos[label].some(p => board.claimedBy(p) === owner)

const makeBot = async name => {
  const m = await createMiner({ username: name, mode: 'rage', fly: false, map, board, log: () => {} })
  await m.ready
  return m
}

const results = { claims: [], targets: [], alive: 0 }
try {
  const b1 = await makeBot('DiagF1')
  const b2 = await makeBot('DiagF2')
  const b3 = await makeBot('DiagF3')

  // Bot 1 commits to a cluster. Wherever it lands (arrival is terrain luck), its
  // claim must sit on one of the two clusters.
  const t1 = await b1.mapTrip(['sand'], { walkTimeoutMs: 30000, harvestSeconds: 5 })
  log(`bot1 trip: ${JSON.stringify(t1)} claims=${b1.stats.claims}`)
  const aClaim = claimOnAny('A', 'DiagF1')
  const bClaim = claimOnAny('B', 'DiagF1')
  log(`bot1 claim on A=${aClaim} on B=${bClaim}`)
  results.claims.push(b1.stats.claims)

  // Bot 2 must now be steered to the OTHER cluster (its two candidates are
  // equidistant; only the claim penalty separates them).
  const t2 = await b2.mapTrip(['sand'], { walkTimeoutMs: 30000, harvestSeconds: 5 })
  log(`bot2 trip: ${JSON.stringify(t2)} claims=${b2.stats.claims}`)
  const otherA = claimOnAny('A', 'DiagF2')
  const otherB = claimOnAny('B', 'DiagF2')
  log(`bot2 claim on A=${otherA} on B=${otherB}`)
  results.claims.push(b2.stats.claims)
  results.targets = [aClaim || otherA ? 'A' : '?', bClaim || otherB ? 'B' : '?']

  // Bot 3 stacks a third claim somewhere - the board holds all of them (TTL alive).
  const t3 = await b3.mapTrip(['sand'], { walkTimeoutMs: 30000, harvestSeconds: 5 })
  log(`bot3 trip: ${JSON.stringify(t3)} claims=${b3.stats.claims}`)
  results.claims.push(b3.stats.claims)

  results.alive = [b1, b2, b3].filter(m => m.bot.entity && m.bot.health > 0).length
  log(`board size=${board.size()} (TTL 120s may have expired the first claim by now)`)
  for (const [k, c] of board.claims) log(`  board: ${k} owner=${c.owner}`)
  log(`RESULT: claims=${results.claims.join(',')} distinctBotTargets=${new Set(results.targets).size >= 1 ? 'ok' : '?'} alive=${results.alive}/3`)
  const ok = results.claims.filter(c => c >= 1).length === 3 && board.size() >= 2 && results.alive === 3
  log(ok ? 'DIAG PASS - claim layer live over real bots' : 'DIAG FAIL - see lines above')
  process.exitCode = ok ? 0 : 1
  for (const m of [b1, b2, b3]) { try { m.bot.quit() } catch { /* gone */ } }
  setTimeout(() => process.exit(process.exitCode || 0), 1500)
} catch (e) {
  log(`DIAG ERROR: ${e.message}`)
  process.exit(1)
}
