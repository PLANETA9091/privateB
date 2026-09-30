// Tests for the storm verdict row in src/lib/statcarry.mjs (v0.342.0).
// Four faces of record priced the bimodal law (0 / 276 / 0 / 1323 air
// glitches) and the v0.337.0 abandonment spoke its first leg on the storm
// face (5 hands, the witness guard proven in the field) - but no line ever
// NAMED the face's storm class or counted the hands: the row renders the
// verdict ALWAYS (CALM is a verdict, not a silence - the 05:00 ledger-skip
// lesson), the STORM side names the rate, the top holder and the abandon
// hands, and the floor is the ledger-grain law's own number.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { stormVerdictRow, STORM_GLITCH_FLOOR } from '../../src/lib/statcarry.mjs'

test('the floor is the ledger-grain number and the bimodal split holds it from both sides', () => {
  assert.equal(STORM_GLITCH_FLOOR, 100)
  // the calm side of the split: 0 (three faces of record)
  assert.match(stormVerdictRow({ airGlitches: 0 }), /CALM/)
  // the storm side's floor end: 257 (face 36626921875) and 276 (the dark twin)
  assert.match(stormVerdictRow({ airGlitches: 257 }), /STORM/)
  assert.match(stormVerdictRow({ airGlitches: 276 }), /STORM/)
})

test('the boundary pins: 99 is CALM, 100 is STORM, 101 is STORM', () => {
  assert.match(stormVerdictRow({ airGlitches: 99 }), /CALM/)
  assert.match(stormVerdictRow({ airGlitches: 100 }), /STORM/)
  assert.match(stormVerdictRow({ airGlitches: 101 }), /STORM/)
})

test('the storm line names the count, the rate and the worst face of record', () => {
  const line = stormVerdictRow({ airGlitches: 1323, secs: 600 })
  assert.match(line, /STORM/)
  assert.match(line, /1323 air glitches/)
  assert.match(line, /\(132\.3\/min\)/)
})

test('a junk duration drops the rate but the count still speaks', () => {
  for (const secs of [null, undefined, NaN, 0, -5, '600']) {
    const line = stormVerdictRow({ airGlitches: 276, secs })
    assert.match(line, /276 air glitches/)
    assert.doesNotMatch(line, /\/min\)/)
  }
})

test('the top holder names the bot and its share of the storm', () => {
  const line = stormVerdictRow({
    airGlitches: 1000,
    bots: [{ name: 'F12', stats: { airGlitches: 560 } }, { name: 'F1', stats: { airGlitches: 214 } }]
  })
  assert.match(line, /top F12 g560 \(56%\)/)
})

test('the holder scan is junk-safe: junk entries stay silent, junk names read ?, ties keep the first', () => {
  assert.doesNotMatch(stormVerdictRow({ airGlitches: 200, bots: [null, {}, { name: null, stats: null }] }), /top/)
  assert.match(stormVerdictRow({ airGlitches: 200, bots: [{ stats: { airGlitches: 50 } }] }), /top \? g50/)
  const tie = stormVerdictRow({
    airGlitches: 200,
    bots: [{ name: 'F1', stats: { airGlitches: 100 } }, { name: 'F2', stats: { airGlitches: 100 } }]
  })
  assert.match(tie, /top F1 g100/)
})

test('the abandonment hands render only when they exist, with the singular/plural split', () => {
  assert.doesNotMatch(stormVerdictRow({ airGlitches: 1323 }), /hand/)
  assert.match(stormVerdictRow({ airGlitches: 1323, abandons: 1 }), /1 abandon hand(?!s)/)
  assert.match(stormVerdictRow({ airGlitches: 1323, abandons: 5 }), /5 abandon hands/)
  // the face of record's exact shape: the storm, the hands, the witness proof
  assert.match(stormVerdictRow({ airGlitches: 1323, secs: 600, abandons: 5 }), /5 abandon hands/)
  for (const junk of [null, undefined, NaN, 0, -2, '5']) {
    assert.doesNotMatch(stormVerdictRow({ airGlitches: 1323, abandons: junk }), /hand/)
  }
})

test('junk fleet sums read the CALM zero class - garbage never renders as a storm', () => {
  for (const junk of [null, undefined, NaN, -1, '1323']) {
    assert.equal(stormVerdictRow({ airGlitches: junk }), 'storm verdict: CALM - 0 air glitches')
  }
  assert.equal(stormVerdictRow({}), 'storm verdict: CALM - 0 air glitches')
  assert.equal(stormVerdictRow(), 'storm verdict: CALM - 0 air glitches')
})

test('the row is ALWAYS a string - never null (the always-printed law)', () => {
  assert.equal(typeof stormVerdictRow({ airGlitches: 0 }), 'string')
  assert.equal(typeof stormVerdictRow({ airGlitches: 1323 }), 'string')
})

test('the fractional glitch sums floor (the counters are integers)', () => {
  assert.match(stormVerdictRow({ airGlitches: 99.9 }), /CALM/)
  assert.match(stormVerdictRow({ airGlitches: 100.9 }), /100 air glitches/)
})

test('the wiring: the counter rides both band hands in miner.mjs and the stats seed carries it', () => {
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // the stats seed carries the counter
  assert.match(src, /rescues: 0, airGlitches: 0, glitchAbandons: 0, claims: 0/)
  // both confirmation bands count the hand at the exact crossing page
  const hands = src.match(/stats\.glitchAbandons = \(stats\.glitchAbandons \?\? 0\) \+ 1/g) || []
  assert.equal(hands.length, 2)
  // the hand counter rides INSIDE the abandon-hand gate (not the ratchet)
  assert.match(src, /if \(glitchConfirmed === GLITCH_ABANDON_PAGES\) \{\n[^\n]*\n[^\n]*\n\s*stats\.glitchAbandons/)
})

test('the wiring: fleet19 prints the row always, with the fleet-wide glitch and hand sums', () => {
  const src = fs.readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(src, /stormVerdictRow/)
  assert.match(src, /abandons: list\.reduce\(\(a, m\) => a \+ \(m\.stats\?\.glitchAbandons \?\? 0\), 0\)/)
  // the row sits OUTSIDE the rescue-economy gate (the always-printed law)
  const stormIdx = src.indexOf('stormVerdictRow({')
  const gateIdx = src.indexOf('const rescueEconomy = rescueEconomyDecode(')
  assert.ok(stormIdx > -1 && gateIdx > -1 && stormIdx < gateIdx, 'the storm row must print before/unconditionally of the economy gate')
})
