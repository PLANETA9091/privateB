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

// (v0.756.0) THE CHURN'S OWN METER - the paradox's clock leg. Face 63
// (37589681027, the anatomy tree's first face) is the maiden read:
// 0 deaths, 24 rescue starts, the hb clock's end 721s - 3.33 starts/100s.
import { churnDensity, CHURN_METER_SCALE_S } from '../../src/lib/calmrescue.mjs'

test('the churn\'s own meter (v0.756.0): face 63\'s own read prices the density', () => {
  // The maiden field read: 24 starts over the 721s clock = 3.33/100s.
  assert.equal(churnDensity(24, 721), 3.33)
  assert.equal(CHURN_METER_SCALE_S, 100)
  // The pace row's own 2-decimal rounding law.
  assert.equal(churnDensity(35, 600), 5.83)
  assert.equal(churnDensity(10, 600), 1.67)
  // A custom scale prices in the caller's own unit (the junk law keeps
  // the default the row's own style).
  assert.equal(churnDensity(24, 721, { scale: 60 }), 2)
})

test('the churn\'s own meter (v0.756.0): the meter rides the paradox object', () => {
  // The face-33 fixture (0 deaths, 35 starts) + one heartbeat line: the
  // meter joins the hb clock by reuse (sealDeathCensus's clockEnd).
  const lines = face33()
  lines.push('[2026-10-07 10:00:00:123] F1 [F1 b] heartbeat] n=36 ts=600s')
  const r = calmRescueParadox(lines)
  assert.ok(r.paradox)
  assert.ok(r.paradox.meter)
  assert.equal(r.paradox.meter.clockEndS, 600)
  assert.equal(r.paradox.meter.density, 5.83)
  assert.equal(r.paradox.meter.scale, 100)
  // A clockless face (no hb lines) reads the meter's own silence.
  const clockless = calmRescueParadox(face33())
  assert.ok(clockless.paradox)
  assert.equal(clockless.paradox.meter, null)
})

test('the churn\'s own meter (v0.756.0): junk battery - no density from nothing', () => {
  assert.equal(churnDensity(null, 600), null)
  assert.equal(churnDensity('24', 600), null)
  assert.equal(churnDensity(-1, 600), null)
  assert.equal(churnDensity(24, null), null)
  assert.equal(churnDensity(24, 0), null)
  assert.equal(churnDensity(24, -5), null)
  assert.equal(churnDensity(24, 600, { scale: 0 }), null)
  assert.equal(churnDensity(NaN, 600), null)
  // The zero-starts face prices honestly at 0 (a quiet lane is data).
  assert.equal(churnDensity(0, 600), 0)
})
