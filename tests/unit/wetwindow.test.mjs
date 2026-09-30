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

// (v0.279.0) THE LAST-EPISODE FALLBACK: face 36397191054's first field read
// measured 'wet unknown' on BOTH drown deaths (F13 x2) - the drown-timer's
// early returns (the rescue's swimming state, the cooldown gate) freeze the
// live tracker while the bot is IN the water, and the surface-bob reset eats
// the episode at the death tick. The most recent COMPLETED wet episode is
// still a measurement - of the previous wetting - rendered honestly '@last'.
test('wetWindowLabel: a reset tracker with a prior episode renders the last wetting @last (the face 36397191054 cure)', () => {
  const now = 200000
  assert.equal(wetWindowLabel(0, now, 9500), 'wet 9s@last', 'the completed episode\'s floor keeps the seconds honest, the @last label names it previous')
  assert.equal(wetWindowLabel(0, now, 999), 'wet 0s@last', 'a sub-second episode is still an episode')
  assert.equal(wetWindowLabel(null, now, 30000), 'wet 30s@last', 'the null tracker reads the fallback too')
})

test('wetWindowLabel: the live read always wins over the fallback (the @last is never the live window)', () => {
  const now = 200000
  assert.equal(wetWindowLabel(now - 12000, now, 9000), 'wet 12s', 'an armed tracker renders its OWN window - no @last, no fallback')
})

test('wetWindowLabel: the junk law holds for the fallback - junk lastWetMs never walks', () => {
  const now = 200000
  for (const junk of [0, null, undefined, NaN, -5000, '12', Infinity]) {
    assert.equal(wetWindowLabel(0, now, junk), 'wet unknown', `junk last ${String(junk)} reads unknown - no prior measurement exists`)
  }
})

test('wetWindowLabel: the junk-clock law keeps the unknown even with a prior episode (an armed tracker lies only through its clock)', () => {
  assert.equal(wetWindowLabel(200000, NaN, 9000), 'wet unknown', 'a junk clock on an ARMED tracker reads unknown - the fallback is the reset tracker\'s cure only')
  assert.equal(wetWindowLabel(200000, 199999, 9000), 'wet unknown', 'the future-skew refusal stands, the fallback never masquerades as the live window')
})

test('drownContextLine: the @last tail rides the row (the bobbing-drown shape)', () => {
  const line = drownContextLine({
    tag: 'F13', oxygen: 0, feet: 'water', head: 'water',
    rescueActive: false, lastRescueAt: null, now: 300000,
    leg: 'next column', headWetSince: null, lastWetMs: 12000
  })
  assert.equal(line, 'F13 death: drown context (o2 0, feet water, head water, rescue never, leg next column, wet 12s@last)', 'the reset tracker with a prior episode names the previous wetting on the tail')
  const legacy = drownContextLine({ tag: 'F3', oxygen: 0, feet: 'water', head: 'water', lastWetMs: 12000 })
  assert.ok(legacy.endsWith(', leg unknown, wet 12s@last)'), 'a legacy call with only lastWetMs still reads the fallback')
})

test('the last-episode fallback is wired: the tracker capture and the pass-through (v0.279.0)', () => {
  assert.ok(minerSrc.includes('lastWetMs: headWetLastMs, // (v0.279.0) the last-episode fallback'), 'the drown context passes the bot\'s headWetLastMs capture')
  assert.ok(minerSrc.includes('if (headWetSince) { headWetLastMs = now - headWetSince; headWetEndedAt = now } headWetSince = 0'), 'the dry sample ends the episode - its duration survives the reset (re-tailed by the sync law: v0.357.0 stamps headWetEndedAt at the same page)')
  assert.ok(statcarrySrc.includes('lastWetMs = null } = r || {}'), 'the context destructure grows the fallback option')
  assert.ok(statcarrySrc.includes('wetWindowLabel(headWetSince, now, lastWetMs)'), 'the renderer receives the fallback beside the live tracker')
})
