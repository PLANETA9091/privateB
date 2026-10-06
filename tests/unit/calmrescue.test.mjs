import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { calmRescueParadox, CALM_RESCUE_FLOOR } from '../../src/lib/calmrescue.mjs'

// Face 33's live shapes verbatim (run 37461703252) - the lens era's
// first ZERO-DEATH face ('death causes: none', combat 0 lines) with
// the water lane at full churn: 35 drowning-rescue starts (F12=9 the
// top seat, 10 spenders), 22 released, 1 timeout orphan - the churn
// the death clock never metered.
const face33 = ({ withDeath = false } = {}) => {
  const lines = []
  const starts = [['F12', 9], ['F10', 7], ['F15', 4], ['F16', 3], ['F11', 3], ['F14', 3], ['F13', 2], ['F4', 2], ['F2', 1], ['F3', 1]]
  // each counted end closes its OWN open episode (the ledger's pairing
  // law): the first 22 starts ride a release each; 13 episodes stay open
  let relLeft = 22
  for (const [bot, n] of starts) {
    for (let i = 0; i < n; i++) {
      lines.push(`${bot} [${bot}] water: drowning rescue start (drowning, oxygen 13)`)
      if (relLeft > 0) {
        lines.push(`${bot} [${bot}] water: rescue released (surface-safe, open water - no land known; the walk gate reopens) in 4.6s`)
        relLeft--
      }
    }
  }
  lines.push('F10 [F10] water: rescue timeout (still wet, 9 passes, 0 probes, tail wet/wet/wet) [blind: 9 passes, 0 shore scans hit, 0 standing probes - no ground truth ever gathered] in 27.3s')
  if (withDeath) lines.push('F5 [F5] died - respawning (cause: drowning (2.0s before death at [-130,40,401]))')
  return lines
}

test('the 33rd byte-exact: 0 deaths rode 35 rescue starts - the paradox reads', () => {
  const r = calmRescueParadox(face33())
  assert.ok(r, 'the face reads')
  assert.equal(r.deaths, 0)
  assert.equal(r.starts, 35)
  assert.deepEqual(r.table[0], ['F12', 9])
  assert.equal(r.table.length, 10)
  assert.ok(r.paradox, 'the paradox fires')
  assert.equal(r.paradox.starts, 35)
  assert.deepEqual(r.paradox.top, ['F12', 9])
  assert.equal(r.paradox.spenders, 10)
  assert.equal(r.paradox.ends.released, 22)
  assert.equal(r.paradox.ends.timeout, 0, 'the ledger\'s timeout class claims nothing here (the real face\'s own shape)')
  assert.equal(r.paradox.ends.unclosed, 13, 'the 13 open episodes ride EOF unclosed (35 starts - 22 released)')
})

test('deaths ride - the churn has its explainers, the paradox stays silent', () => {
  const r = calmRescueParadox(face33({ withDeath: true }))
  assert.ok(r, 'the face reads')
  assert.equal(r.deaths, 1)
  assert.equal(r.paradox, null, 'no paradox on a dying face')
  assert.equal(r.table, null)
})

test('below the floor the quiet lane stays data - the bar is honest', () => {
  const lines = [
    'F3 [F3] water: drowning rescue start (drowning, oxygen 13)',
    'F3 [F3] water: drowning rescue start (drowning, oxygen 12)',
    'F5 [F5] water: drowning rescue start (drowning, oxygen 14)',
    'F3 [F3] water: rescue released (surface-safe, open water - no land known; the walk gate reopens) in 3.1s'
  ]
  const r = calmRescueParadox(lines)
  assert.ok(r, 'the face reads')
  assert.equal(r.deaths, 0)
  assert.equal(r.starts, 3)
  assert.equal(r.paradox, null, '3 starts is a strand, not churn')
  const edge = calmRescueParadox([
    ...Array.from({ length: CALM_RESCUE_FLOOR }, () => 'F3 [F3] water: drowning rescue start (drowning, oxygen 13)'),
    'F3 [F3] water: rescue released (surface-safe, open water - no land known; the walk gate reopens) in 3.1s'
  ])
  assert.ok(edge.paradox, 'the floor itself fires (sustained churn begins)')
})

test('junk-safe null on non-input', () => {
  assert.equal(calmRescueParadox(null), null)
  assert.equal(calmRescueParadox(undefined), null)
  assert.equal(calmRescueParadox(42), null)
})

test('WIRING: decompose rides the calm paradox beside the rescue end-state', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /import \{ calmRescueParadox \} from '\.\.\/\.\.\/src\/lib\/calmrescue\.mjs'/)
  assert.match(src, /calmRescueParadox\(lines\)/)
  assert.match(src, /the calm paradox \(v0\.701\.0\)/)
})
