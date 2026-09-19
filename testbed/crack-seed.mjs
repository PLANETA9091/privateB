#!/usr/bin/env node
// Recover the world seed from structure positions that the server itself reported.
//
// Ground truth comes from the server console: `execute positioned X Y Z run locate structure
// minecraft:<name>` prints "The nearest minecraft:<name> is at [x, ~, z]". Those lines are
// parsed into observations and fed to the cracker.
//
//   node testbed/crack-seed.mjs [--phaseA] [--slice i/n] [--expect <seed>] [--log <path>]
import fs from 'node:fs'
import { observe, totalBits, crack, lowBitsSurvivors } from '../src/seed/crack.mjs'

const arg = (flag, def = null) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : def)
const LOG = arg('--log', 'testbed/server/logs/latest.log')
const EXPECT = arg('--expect', '8624896123745')
const PHASE_A_ONLY = process.argv.includes('--phaseA')
const slice = arg('--slice', null)

const NAME_MAP = {
  shipwreck: 'shipwreck',
  ocean_monument: 'ocean_monument',
  monument: 'ocean_monument',
  village_plains: 'village_plains',
  village_desert: 'village_desert',
  village_savanna: 'village_savanna',
  village_taiga: 'village_taiga',
  village_snowy: 'village_snowy',
  desert_pyramid: 'desert_pyramid',
  pillager_outpost: 'pillager_outpost',
  swamp_hut: 'swamp_hut',
  ruined_portal: 'ruined_portal',
  jungle_temple: 'jungle_temple'
}

function parseObservations (path) {
  const text = fs.readFileSync(path, 'utf8')
  const seen = new Set()
  const out = []
  const re = /The nearest minecraft:([a-z_]+) is at \[(-?\d+), ~, (-?\d+)\]/g
  for (const match of text.matchAll(re)) {
    const [, rawName, x, z] = match
    const name = NAME_MAP[rawName]
    if (!name) continue
    const key = `${rawName}@${x},${z}`
    if (seen.has(key)) continue
    seen.add(key)
    try {
      out.push(observe(name, Number(x), Number(z)))
    } catch (err) {
      console.warn(`skip ${rawName}@${x},${z}: ${err.message}`)
    }
  }
  return out
}

const constraints = parseObservations(LOG)
const byName = {}
for (const c of constraints) byName[c.name] = (byName[c.name] || 0) + 1
console.log(`observations: ${constraints.length} -> ${JSON.stringify(byName)}`)
console.log(`information available: ${totalBits(constraints).toFixed(1)} bits (48 needed for a unique structure seed)`)

if (PHASE_A_ONLY) {
  const t0 = Date.now()
  const survivors = lowBitsSurvivors(constraints)
  console.log(`phase A: ${survivors.length} low-19-bit survivors in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  const expectedLow = Number(BigInt(EXPECT) & 0x7FFFFn)
  console.log(`expected low 19 bits of ${EXPECT}: ${expectedLow} present: ${survivors.includes(expectedLow)}`)
  process.exit(0)
}

let highStart = 0
let highStep = 1
if (slice) {
  const [i, n] = slice.split('/').map(Number)
  highStart = i
  highStep = n
}

const t0 = Date.now()
const result = crack({
  constraints,
  highStart,
  highStep,
  onProgress: (checked, seed) => {
    const rate = checked / ((Date.now() - t0) / 1000)
    console.log(`  ... ${(checked / 1e6).toFixed(1)}M checked (${(rate / 1e6).toFixed(2)}M/s) at seed ${seed}`)
  }
})
console.log(`phase A: ${result.survivors} survivors in ${(result.phaseA / 1000).toFixed(1)}s`)
console.log(`phase B: checked ${result.checked.toLocaleString()} candidates in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log(`FOUND: ${result.found.length ? result.found.join(', ') : '(none)'}`)
if (EXPECT) {
  const hit = result.found.map(String).includes(EXPECT)
  console.log(hit ? `MATCH: recovered the world seed ${EXPECT}` : `no match yet (expected ${EXPECT})`)
}
