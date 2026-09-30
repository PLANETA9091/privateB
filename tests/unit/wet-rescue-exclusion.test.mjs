// Tests for the v0.357.0 wet-rescue exclusion in src/lib/statcarry.mjs.
// Face 36733939481 read 'storm verdict: STORM - 600 air glitches (60.0/min),
// top F12 g600 (100%), 1 abandon hand' while the anatomy decomposed ALL 600
// to ONE bot's ONE wet rescue (F12 at [-161,55,401], 8+ drowning passes) -
// the rescue's surface-bob reads dry block contact while the bar is genuinely
// low, so the critical-on-dry counter ate the whole rescue as an ambient
// storm, and the liar ladder's own abandon ('2 confirmed no-op pages')
// proved the class. The cure: the increment classifies (a read inside the
// wet window counts BOTH counters - the total keeps its meaning for the
// economy and the diet, no cascade) and the verdict reads the DRY sum: an
// all-wet face downgrades to the honest WET class, a mixed face names the
// excluded share, a clean face renders byte-identical to v0.356.0.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { stormVerdictRow, wetRescueWindowLive, WET_RESCUE_GLITCH_WINDOW_MS, STORM_GLITCH_FLOOR } from '../../src/lib/statcarry.mjs'

const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const carrySrc = fs.readFileSync(new URL('../../src/lib/statcarry.mjs', import.meta.url), 'utf8')
const fleetSrc = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

test('the window constant is the 45s rescue tail, pinned', () => {
  assert.equal(WET_RESCUE_GLITCH_WINDOW_MS, 45000)
})

test('the classifier: head wet NOW is always in the window', () => {
  assert.equal(wetRescueWindowLive({ headWetNow: true, now: 1000 }), true)
  assert.equal(wetRescueWindowLive({ headWetNow: true, now: null, lastRescueAt: null }), true)
})

test('the classifier: the rescue tail keeps the window open, the tail closes it', () => {
  const now = 1_000_000
  // a rescue fired 10s ago - inside the window
  assert.equal(wetRescueWindowLive({ headWetNow: false, lastRescueAt: now - 10_000, now }), true)
  // the wet episode ended 10s ago - inside the window
  assert.equal(wetRescueWindowLive({ headWetNow: false, lastWetEndAt: now - 10_000, now }), true)
  // both anchors 46s old - the window closed
  assert.equal(wetRescueWindowLive({ headWetNow: false, lastRescueAt: now - 46_000, lastWetEndAt: now - 46_000, now }), false)
  // the exact boundary: 45000ms is OUTSIDE (strict <), 44999 is inside
  assert.equal(wetRescueWindowLive({ headWetNow: false, lastRescueAt: now - WET_RESCUE_GLITCH_WINDOW_MS, now }), false)
  assert.equal(wetRescueWindowLive({ headWetNow: false, lastRescueAt: now - (WET_RESCUE_GLITCH_WINDOW_MS - 1), now }), true)
  // a future anchor never opens a window (the now >= t guard)
  assert.equal(wetRescueWindowLive({ headWetNow: false, lastRescueAt: now + 5_000, now }), false)
})

test('the classifier is junk-safe: junk never invents a window (the body-guard law)', () => {
  for (const p of [undefined, null, {}, { headWetNow: false }, { headWetNow: 'yes', now: 1000 }, { headWetNow: 1, now: 1000 }, { headWetNow: false, now: 'soon' }, { headWetNow: false, now: NaN }, { headWetNow: false, now: 0 }, { headWetNow: false, now: -5 }, { headWetNow: false, now: 1000, lastRescueAt: -1 }, { headWetNow: false, now: 1000, lastWetEndAt: 'x' }, { headWetNow: false, now: Infinity, lastRescueAt: 1 }]) {
    assert.equal(wetRescueWindowLive(p), false)
  }
  // strict boolean read (the sealCrossTarget law): 1 and 'yes' are NOT headWetNow
})

test('the all-wet face downgrades to the honest WET class - the face-12 replay', () => {
  const line = stormVerdictRow({ airGlitches: 600, wetGlitches: 600, secs: 600, abandons: 1 })
  assert.match(line, /^storm verdict: WET - 600 air glitches \(600 wet-rescued, dry 0\) - the storm signal stays calm, 1 abandon hand$/)
  // the storm dressing never rides the WET class (no rate, no holder)
  assert.doesNotMatch(line, /\/min\)/)
  assert.doesNotMatch(line, /top /)
  assert.doesNotMatch(line, /STORM/)
})

test('the mixed face stays STORM and names the excluded wet share', () => {
  const line = stormVerdictRow({
    airGlitches: 1323, wetGlitches: 600, secs: 600,
    bots: [{ name: 'F9', stats: { airGlitches: 700 } }]
  })
  assert.match(line, /^storm verdict: STORM - 1323 air glitches \(132\.3\/min\), top F9 g700 \(53%\)/)
  assert.match(line, /, wet-rescued 600$/)
})

test('a wet share below the floor changes nothing - CALM is byte-identical', () => {
  assert.equal(
    stormVerdictRow({ airGlitches: 60, wetGlitches: 60 }),
    'storm verdict: CALM - 60 air glitches'
  )
})

test('the sync law: absent or zero wetGlitches renders the v0.356.0 face byte-identical', () => {
  for (const wet of [undefined, null, 0]) {
    const line = stormVerdictRow({ airGlitches: 276, secs: 600, wet })
    assert.match(line, /^storm verdict: STORM - 276 air glitches \(27\.6\/min\)/)
    assert.doesNotMatch(line, /wet-rescued/)
  }
  assert.equal(stormVerdictRow({ airGlitches: 0, wet: 0 }), 'storm verdict: CALM - 0 air glitches')
})

test('the wet share battery: junk reads 0, negatives clamp, overcounts clamp to the total', () => {
  for (const wet of [null, undefined, NaN, -5, '600', Infinity, -Infinity, 0.4]) {
    const line = stormVerdictRow({ airGlitches: 276, wetGlitches: wet })
    assert.match(line, /STORM/)
    assert.doesNotMatch(line, /wet-rescued/)
  }
  // wet > g clamps to g (the share is a subset, never a second storm on top)
  const clamped = stormVerdictRow({ airGlitches: 150, wetGlitches: 900 })
  assert.match(clamped, /^storm verdict: WET - 150 air glitches \(150 wet-rescued, dry 0\)/)
})

test('the dry boundary holds the floor from both sides: dry 100 is STORM, dry 99 is WET', () => {
  assert.equal(STORM_GLITCH_FLOOR, 100)
  assert.match(stormVerdictRow({ airGlitches: 200, wetGlitches: 100 }), /STORM/)
  assert.match(stormVerdictRow({ airGlitches: 200, wetGlitches: 100 }), /, wet-rescued 100/)
  assert.match(stormVerdictRow({ airGlitches: 200, wetGlitches: 101 }), /^storm verdict: WET - 200 air glitches \(101 wet-rescued, dry 99\)/)
})

test('the miner wiring: the increment classifies BEFORE the total, both counters ride', () => {
  assert.match(minerSrc, /wetRescueGlitches: 0, glitchAbandons: 0/)
  assert.match(minerSrc, /let headWetEndedAt = 0 \/\/ \(v0\.357\.0\)/)
  assert.match(minerSrc, /if \(headWetSince\) \{ headWetLastMs = now - headWetSince; headWetEndedAt = now \} headWetSince = 0/)
  const classifyIdx = minerSrc.indexOf('if (wetRescueWindowLive({ headWetNow: headWetSince > 0, lastWetEndAt: headWetEndedAt, lastRescueAt, now })) stats.wetRescueGlitches = (stats.wetRescueGlitches ?? 0) + 1')
  const totalIdx = minerSrc.indexOf('stats.airGlitches++')
  assert.ok(classifyIdx > 0, 'the classification call exists')
  assert.ok(totalIdx > classifyIdx, 'the total counts AFTER the classification - both counters ride every read')
})

test('the miner import pin: the classifier rides the statcarry import', () => {
  assert.match(minerSrc, /import \{[^}]*wetRescueWindowLive[^}]*\} from '\.\.\/lib\/statcarry\.mjs'/)
})

test('the relog carry law: wetRescueGlitches is born inside CARRY_FIELDS', () => {
  const m = carrySrc.match(/export const CARRY_FIELDS = \[[\s\S]*?\]/)
  assert.ok(m, 'CARRY_FIELDS exists')
  assert.match(m[0], /'wetRescueGlitches'/)
})

test('the fleet wiring: the storm verdict reads the fleet-wide wet share', () => {
  assert.match(fleetSrc, /wetGlitches: list\.reduce\(\(a, m\) => a \+ \(m\.stats\?\.wetRescueGlitches \?\? 0\), 0\)/)
  const callIdx = fleetSrc.indexOf('console.log(stormVerdictRow({')
  const wetIdx = fleetSrc.indexOf('wetGlitches: list.reduce')
  assert.ok(callIdx >= 0 && wetIdx > callIdx && wetIdx - callIdx < 400, 'the wet feed rides the storm verdict call')
})
