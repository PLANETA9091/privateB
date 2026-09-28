// (v0.275.0) THE WET WINDOW pins - the trip-drown class's exposure measure.
// Faces 36384223490 (x2) and 36378053182 read 'rescue never' x3 on the trip
// legs - the class is confirmed, but the drown context could not say HOW
// LONG the head had been wet before the drown took the bot. wetWindowLabel
// renders the tracker's wet-start ts as the row tail ', wet Ns' ('wet
// unknown' when the tracker was dry/reset/junk - a reset is not a
// measurement, the -1 sentinel lesson).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { wetWindowLabel, drownContextLine } from '../../src/lib/statcarry.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const statcarrySrc = readFileSync(new URL('../../src/lib/statcarry.mjs', import.meta.url), 'utf8')

test('wetWindowLabel: the wet window renders the exposure seconds (the F16 shape)', () => {
  const now = 200000
  assert.equal(wetWindowLabel(now - 12000, now), 'wet 12s', '12s of head-wet exposure reads off the line')
  assert.equal(wetWindowLabel(now - 12500, now), 'wet 12s', 'the floor keeps the integer seconds honest')
  assert.equal(wetWindowLabel(now - 1000, now), 'wet 1s')
  assert.equal(wetWindowLabel(now - 999, now), 'wet 0s', 'a sub-second exposure reads 0s - the truth, not unknown')
})

test('wetWindowLabel: the junk law - a reset/dry tracker never masquerades as a window', () => {
  for (const junk of [0, null, undefined, NaN, -5, '12', Infinity]) {
    assert.equal(wetWindowLabel(junk, 200000), 'wet unknown', `junk ${String(junk)} reads unknown`)
  }
})

test('wetWindowLabel: a junk or future clock refuses (the junk-clock law)', () => {
  assert.equal(wetWindowLabel(200000, NaN), 'wet unknown')
  assert.equal(wetWindowLabel(200000, 199999), 'wet unknown', 'a future wet-start (clock skew) reads unknown, never negative')
  // an omitted clock is the DEFAULT-NOW contract (drownContextLine's own) - undefined now reads against Date.now()
  assert.ok(/^wet \d+s$/.test(wetWindowLabel(Date.now() - 7000, undefined)), 'the default now renders an integer window')
})

test('drownContextLine: the wet window rides the row tail (the F16 next-column shape)', () => {
  // the trip-drown class's decode line: which leg owned it AND how long the
  // head had been wet - the 2s plunge vs the 30s wade split arms here
  const now = 300000
  const line = drownContextLine({
    tag: 'F16', oxygen: 0, feet: 'water', head: 'water',
    rescueActive: false, lastRescueAt: null, now,
    leg: 'next column', headWetSince: now - 30000
  })
  assert.equal(line, 'F16 death: drown context (o2 0, feet water, head water, rescue never, leg next column, wet 30s)', 'the wade shape: 30s of exposure on the row tail')
  const plunge = drownContextLine({
    tag: 'F7', oxygen: 0, feet: 'water', head: 'water', now,
    leg: 'fuel commons walk', headWetSince: now - 2000
  })
  assert.equal(plunge, 'F7 death: drown context (o2 0, feet water, head water, rescue never, leg fuel commons walk, wet 2s)', 'the plunge shape: 2s')
})

test('drownContextLine: legacy calls (no headWetSince) read the tail honestly', () => {
  const line = drownContextLine({ tag: 'F3', oxygen: 0, feet: 'water', head: 'water' })
  assert.ok(line.endsWith(', leg unknown, wet unknown)'), 'the default tracker state reads unknown, got: ' + line)
})

test('the wet window is wired: the death context passes the bot\'s tracker (v0.275.0)', () => {
  assert.ok(statcarrySrc.includes('export function wetWindowLabel'), 'the renderer is exported beside the drown context')
  assert.ok(minerSrc.includes('headWetSince, // (v0.275.0) the wet window'), 'the drown context passes the bot\'s headWetSince tracker')
  assert.ok(minerSrc.indexOf('headWetSince, // (v0.275.0) the wet window') < minerSrc.indexOf('leg: bot._gotoSafeLabel ?? null'), 'the window precedes the leg in the call options')
})
