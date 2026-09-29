// Tests for the v0.314.0 BLIND RESCUE DECODE in src/lib/drowning.mjs.
// The measured shape this module closes: fleet 36566021862 (the first
// full-survival face) lost F10 to a head-wet climb that burned o2 3 -> 0
// while EVERY pass line read 'shore=none land=n/a probes=0' - the shore scan
// only runs when the head is dry and the standing probe only runs in the dry
// branch, so a submerged climb gathers ZERO ground truth by construction and
// the end lines carried the counts but never named the blindness. These tests
// pin the decode (the floor, the seen-exemptions, the junk discipline) and
// the wiring (the bracket rides the existing 'water: rescue' end line) so the
// blind class can never silently rot back into unnamed o2 deaths.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { rescueBlindness, RESCUE_BLIND_FLOOR_PASSES } from '../../src/lib/drowning.mjs'

test('THE F10 DATUM: the head-wet climb shape reads blind (5 passes, 0 probes, 0 shore hits)', () => {
  // fleet 36566021862 F10: pass 0 o2=3 y=46.0, pass 5 o2=0 y=50.3, pass 10
  // o2=reset(-1) y=53.2 - five pass lines, every one shore=none probes=0.
  assert.equal(rescueBlindness({ passes: 5, probes: 0, shoreHits: 0 }), 'blind')
})

test('THE FLOOR: a rescue earns the blind verdict at RESCUE_BLIND_FLOOR_PASSES passes', () => {
  assert.equal(rescueBlindness({ passes: RESCUE_BLIND_FLOOR_PASSES, probes: 0, shoreHits: 0 }), 'blind')
  assert.equal(rescueBlindness({ passes: RESCUE_BLIND_FLOOR_PASSES - 1, probes: 0, shoreHits: 0 }), null)
  assert.equal(RESCUE_BLIND_FLOOR_PASSES, 3)
})

test('THE SEEN-EXEMPTIONS: any ground truth kills the class (probes>0 or shoreHits>0)', () => {
  // a standing probe ran: the rescue tested for ground - its own lines own it
  assert.equal(rescueBlindness({ passes: 9, probes: 1, shoreHits: 0 }), null)
  // a shore scan returned a bearing: the rescue SAW - its own lines own it
  assert.equal(rescueBlindness({ passes: 9, probes: 0, shoreHits: 1 }), null)
  assert.equal(rescueBlindness({ passes: 9, probes: 2, shoreHits: 3 }), null)
})

test('THE JUNK DISCIPLINE: missing evidence is not blindness (the body-guard law)', () => {
  assert.equal(rescueBlindness({ passes: null, probes: 0, shoreHits: 0 }), null)
  assert.equal(rescueBlindness({ passes: 5, probes: null, shoreHits: 0 }), null)
  assert.equal(rescueBlindness({ passes: 5, probes: 0, shoreHits: null }), null)
  assert.equal(rescueBlindness({ passes: NaN, probes: 0, shoreHits: 0 }), null)
  assert.equal(rescueBlindness({ passes: '5', probes: 0, shoreHits: 0 }), null)
  assert.equal(rescueBlindness({ passes: undefined, probes: undefined, shoreHits: undefined }), null)
  assert.equal(rescueBlindness(null), null)
  assert.equal(rescueBlindness(), null)
  // junk that would coerce to a verdict under Number() (the seventh strike)
  assert.equal(rescueBlindness({ passes: true, probes: false, shoreHits: 0 }), null)
  // negative junk is not a pass count
  assert.equal(rescueBlindness({ passes: -3, probes: 0, shoreHits: 0 }), null)
})

test('THE WIRING PINS: the decode rides the existing end line and the shore ledger', () => {
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  // the import carries the decode pair
  assert.match(minerSrc, /rescueBlindness,\s*RESCUE_BLIND_FLOOR_PASSES/)
  // the ground-truth ledger: shoreHits declared beside standingProbes, fed on every hit
  assert.match(minerSrc, /let shoreHits = 0 \/\/ \(v0\.314\.0\) shore scans that returned a bearing/)
  assert.match(minerSrc, /if \(dir\) shoreHits\+\+/)
  // the bracket rides the existing 'water: rescue' end line - no new filter key
  assert.match(minerSrc, /rescueBlindness\(\{ passes: passNo, probes: standingProbes, shoreHits \}\)/)
  assert.match(minerSrc, /no ground truth ever gathered/)
})

test('THE DOC PIN: the decode names the F10 datum and the pricing it closes', () => {
  const src = fs.readFileSync(new URL('../../src/lib/drowning.mjs', import.meta.url), 'utf8')
  assert.match(src, /v0\.314\.0\) THE BLIND RESCUE DECODE/)
  assert.match(src, /fleet 36566021862/)
  assert.match(src, /pass 0 o2=3 y=46\.0/)
  assert.match(src, /pass 5 o2=0 y=50\.3/)
  assert.match(src, /missing evidence is not blindness/)
})
