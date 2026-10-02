#!/usr/bin/env node
//
// smokebook.mjs - THE SMOKE VERDICT's field reader (v0.504.0)
// Mines a CI smoke fleet log (the integration job's fleet-logs artifact,
// /tmp/fleet-test-*/fleet.log, bots ProdTestN) into the verdict console:
//
//   node scripts/fleet-mining/smokebook.mjs /tmp/fleet-test-7904/fleet.log
//
// The smoke fleet is the fleet CI runs on EVERY push - during the
// dispatch stall it was the only fleet data CI delivered (face 44's
// big-fleet job starved in the queue). Zero lines of it had a reader
// before smokeread.mjs; this script prints the book.
import { readFileSync } from 'node:fs'
import { smokeVerdict } from '../../src/lib/smokeread.mjs'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/fleet-mining/smokebook.mjs <smoke-fleet.log>')
  process.exit(1)
}
const lines = readFileSync(file, 'utf8').split('\n')
const v = smokeVerdict(lines)
if (!v) {
  console.error('[smokebook] no verdict - the file did not read as a smoke log')
  process.exit(1)
}

const botNames = Object.keys(v.bots).sort()
console.log('=== SMOKE VERDICT ===')
console.log(`bots ${botNames.length}: ${botNames.join(', ')}`)
for (const name of botNames) {
  const b = v.bots[name]
  const spawn = b.spawn ? `(${b.spawn.x},${b.spawn.y},${b.spawn.z})` : 'NONE'
  const ladder = b.attempts.map(a => `#${a.attempt}${a.ok ? 'ok' : 'FAIL'}(${a.kit})`).join(' ') || 'none'
  const quit = b.quit ? (b.quit.clean ? 'clean' : `DIRTY(${b.quit.reason})`) : 'ABSENT'
  console.log(`  ${name}: spawn ${spawn} ground=${b.groundMode} fastbreak=${b.fastbreak} ladder [${ladder}] rotations ${b.rotations} (${b.rotationSidesteps} sidesteps) saplings ${b.saplings}/${b.saplings + b.saplingFails} quit ${quit}`)
}
const l = v.lane
console.log(`craft lane (fleet-wide, never attributed): storms ${l.stormDeclarations} / refusals ${l.stormRefusals} / variant fails ${l.variantFails} / exhausted ${l.variantExhausted} / grid recoveries ${l.gridRecoveries} / ghost sweeps ${l.ghostSweeps} (${l.ghostSlots} slots) / starved reads ${l.starvedReads} / self-heal ${l.selfHealOk}ok/${l.selfHealMisses}miss`)
const r = v.run
if (r.miningPhase) console.log(`mining: alive=${r.miningPhase.alive}/${r.miningPhase.total} window=${r.miningPhase.windowS}s picks=${r.miningPhase.picks} | ticks ${r.windowTicks.map(t => `+${t.delta}->${t.total}`).join(' ') || 'none'}`)
if (r.result) console.log(`RESULT: mined=${r.result.mined} failed=${r.result.failed} | ${Object.entries(r.result.byName).map(([n, c]) => `${n}=${c}`).join(' ')}`)
if (r.worldmap) console.log(`worldmap: ${r.worldmap.positions} positions, ${r.worldmap.chunks} chunks`)
console.log(`storm->fail link (single-fail rule): ${v.stormLinkedFails === null ? 'UNKNOWN (the interleaving refuses)' : v.stormLinkedFails}`)
console.log(`GRADE: ${String(v.grade).toUpperCase()}`)
