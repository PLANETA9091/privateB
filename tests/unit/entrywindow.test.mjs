import { test } from 'node:test'
import assert from 'node:assert/strict'
import { o2Gap } from '../../src/lib/o2gap.mjs'
import { entryWindow, saveableDeaths } from '../../src/lib/entrywindow.mjs'
import { BREATH_OWNER_STALE_MS } from '../../src/lib/drowning.mjs'

// Face 43's live shapes verbatim (run 36970605824) - the join-bearing lines
// (the v0.479.0 o2gap test's mini), plus the face's FIFTEEN real rescue
// completes (the lane's cost side, verbatim durations).
const face43Mini = [
  'F13 [F13] water: pass 10 head=dry shore=hit r=1 land=none y=62.7 o2=20 probes=0 at=[-142,63,394]',
  'F13 [F13] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry\'s sight died 25s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 18, head dry/unknown, snapshot 25.3s old)',
  'F13 [F13] death: drown context (o2 reset(-1), feet water, head water, rescue 42s ago, leg fuel commons walk @-145,391, wet 3s@last)',
  'F1 [F1] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry\'s sight died 24s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 16, head WET, snapshot 23.7s old)',
  'F1 [F1] death: drown context (o2 reset(-1), feet water, head water, rescue 166s ago, leg approach segment, wet 26s)'
]

const face43Saves = [
  'F2 [F2] water: rescue complete in 0.0s',
  'F3 [F3] water: rescue complete in 0.0s',
  'F4 [F4] water: rescue complete in 0.0s',
  'F5 [F5] water: rescue complete in 1.2s',
  'F6 [F6] water: rescue complete in 1.3s',
  'F7 [F7] water: rescue complete in 1.8s',
  'F8 [F8] water: rescue complete in 2.0s',
  'F9 [F9] water: rescue complete in 2.1s',
  'F10 [F10] water: rescue complete in 2.2s',
  'F11 [F11] water: rescue complete in 2.8s',
  'F12 [F12] water: rescue complete in 3.7s',
  'F15 [F15] water: rescue complete in 3.9s',
  'F16 [F16] water: rescue complete in 5.0s',
  'F17 [F17] water: rescue complete in 7.8s',
  'F18 [F18] water: rescue complete in 10.1s'
]

test('entryWindow prices face 43 honestly: the REAL window is lead minus the 15s floor, the lane\'s tail rides the edge', () => {
  const o2g = o2Gap(face43Mini)
  const r = entryWindow(o2g, face43Saves)
  // the floor is the mirror's own constant - one truth, imported
  assert.equal(r.floorSec, BREATH_OWNER_STALE_MS / 1000)
  assert.equal(r.floorSec, 15)
  // the lane's cost side (the fifteen verbatim saves)
  assert.equal(r.laneCost.saves, 15)
  assert.equal(r.laneCost.min, 0)
  assert.equal(r.laneCost.median, 2.1)
  assert.equal(r.laneCost.max, 10.1)
  // F13: lead 25 - 15 = 10s effective; F1: 24 - 15 = 9s. Both cover the
  // median (2.1s) but NOT the worst observed save (10.1s) - TIGHT, the
  // tail risk named: the slowest rescue on this face misses by 0.1s
  assert.deepEqual(r.perDeath.F13, { lead: 25, effective: 10, verdict: 'tight' })
  assert.deepEqual(r.perDeath.F1, { lead: 24, effective: 9, verdict: 'tight' })
  assert.deepEqual(r.verdicts, { fits: 0, tight: 2, misses: 0, unpriced: 0 })
})

test('entryWindow verdicts: fits covers the worst save, misses falls below the median', () => {
  const o2g = o2Gap([
    'F4 [F4] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry\'s sight died 30s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 5, head WET, snapshot 29.4s old)',
    'F4 [F4] death: drown context (o2 5, feet water, head water, rescue 9s ago, leg fuel commons walk, wet 11s)',
    'F7 [F7] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry\'s sight died 16s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 9, head WET, snapshot 15.8s old)',
    'F7 [F7] death: drown context (o2 9, feet water, head water, rescue 3s ago, leg approach segment, wet 4s)'
  ])
  const r = entryWindow(o2g, face43Saves)
  // F4: 30 - 15 = 15s >= the worst save (10.1s) -> FITS (headroom)
  assert.deepEqual(r.perDeath.F4, { lead: 30, effective: 15, verdict: 'fits' })
  // F7: 16 - 15 = 1s < the median (2.1s) -> MISSES (the wiring does not close)
  assert.deepEqual(r.perDeath.F7, { lead: 16, effective: 1, verdict: 'misses' })
  assert.deepEqual(r.verdicts, { fits: 1, tight: 0, misses: 1, unpriced: 0 })
})

test('entryWindow reads the blind deaths honestly (no cue, or a cue without the sight-loss prose, is unpriced)', () => {
  const o2g = o2Gap([
    // a blind death: no mirror joined - the sensor gap, nothing to price
    'F8 [F8] death: drown context (o2 ?, feet unknown, head water, rescue never, leg unknown, wet unknown)',
    // a wired-by-head death whose mirror class carries no sight-loss prose:
    // the cue joins (head WET) but sightDiedSecs is null on the no-page note
    'F9 [F9] water: breath mirror [no-page] - no hold and no fresh rescue - the sentry never paged (the last verdict \'shallow\', snapshot 2.0s old) (o2 12, head WET, snapshot 2.0s old)',
    'F9 [F9] death: drown context (o2 12, feet water, head water, rescue never, leg unknown, wet 8s)'
  ])
  const r = entryWindow(o2g, face43Saves)
  assert.deepEqual(r.perDeath.F8, { lead: null, effective: null, verdict: 'unpriced' })
  assert.deepEqual(r.perDeath.F9, { lead: null, effective: null, verdict: 'unpriced' })
  assert.deepEqual(r.verdicts, { fits: 0, tight: 0, misses: 0, unpriced: 2 })
})

test('entryWindow is junk-safe: null on junk o2g, non-array lines, zero deaths (the row stays silent)', () => {
  assert.equal(entryWindow(null, face43Saves), null)
  assert.equal(entryWindow('x', face43Saves), null)
  assert.equal(entryWindow(o2Gap(face43Mini), 'not-an-array'), null)
  // zero deaths -> null (the decompose row never prints)
  const calm = o2Gap(['F2 [F2] water: rescue complete in 1.2s'])
  assert.equal(entryWindow(calm, face43Saves), null)
  // a face with no saves prices unpriced (the honest blind spot)
  const o2g = o2Gap(face43Mini)
  const r = entryWindow(o2g, ['F2 [F2] water: rescue released (surface-safe in 5.7s)', 'F3 [F3] water: rescue timeout (still wet, 14/44 passes, 0 probes) in 25.0s'])
  assert.equal(r.laneCost.saves, 0)
  assert.equal(r.laneCost.max, null)
  assert.deepEqual(r.verdicts, { fits: 0, tight: 0, misses: 0, unpriced: 2 })
  // the scope law: only the SAVED classes price the lane - the release and
  // the timeout above are the lane's other stories, never save costs
})

// (v0.743.0) THE SAVEABLE DEATH - the face 56 byte-verbatim shapes (run
// 37566249493): F6's mirror + death (rescue never, sight died 27s) ride
// the face's four real completes (max 7.6s) - the window fits, the lane
// never flew, the trigger's own gap owned the death.
const face56F6Mirror = 'F6 [F6] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry\'s sight died 27s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 20, head WET, snapshot 27.2s old)'
const face56F6 = [
  face56F6Mirror,
  'F6 [F6] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg deploy, wet 27s)'
]
const face56Saves = [
  'F11 [F11] water: rescue complete in 5.0s',
  'F10 [F10] water: rescue complete in 7.6s',
  'F5 [F5] water: rescue complete in 0.0s',
  'F9 [F9] water: rescue complete in 4.7s'
]

test('saveableDeaths reads the 56th byte-verbatim: F6\'s window fit (12s >= 7.6s) and the lane never flew - the trigger\'s own gap owned the death', () => {
  const o2g = o2Gap(face56F6)
  const ew = entryWindow(o2g, face56Saves)
  assert.equal(ew.perDeath.F6.verdict, 'fits')
  assert.equal(ew.perDeath.F6.effective, 12)
  // the maiden read: fits + never - the window was there, the trigger was not
  assert.deepEqual(saveableDeaths(ew, o2g), [{ bot: 'F6', effective: 12, laneWorst: 7.6 }])
})

test('the saveable fences: live is the sensor\'s class, stale the re-entry, tight/misses the window\'s own price, no saves no class', () => {
  // live: the lane WAS flying (the sensor's class - v0.379.0's row owns it)
  const liveO2g = o2Gap([
    face56F6Mirror,
    'F6 [F6] death: drown context (o2 reset(-1), feet water, head water, rescue active, leg deploy, wet 27s)'
  ])
  const liveEw = entryWindow(liveO2g, face56Saves)
  assert.equal(liveEw.perDeath.F6.verdict, 'fits')
  assert.deepEqual(saveableDeaths(liveEw, liveO2g), [])
  // stale: the lane completed, the bot re-drowned (the re-entry class - v0.477.0's row owns it)
  const staleO2g = o2Gap([
    face56F6Mirror,
    'F6 [F6] death: drown context (o2 reset(-1), feet water, head water, rescue 8s ago, leg deploy, wet 27s)'
  ])
  assert.deepEqual(saveableDeaths(entryWindow(staleO2g, face56Saves), staleO2g), [])
  // tight: the window covers the MEDIAN save but not the worst (lead 20 -> effective 5 >= 4.85, < 7.6)
  const tightO2g = o2Gap([
    face56F6Mirror.replace('sight died 27s before death', 'sight died 20s before death'),
    'F6 [F6] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg deploy, wet 27s)'
  ])
  const tightEw = entryWindow(tightO2g, face56Saves)
  assert.equal(tightEw.perDeath.F6.verdict, 'tight')
  assert.deepEqual(saveableDeaths(tightEw, tightO2g), [])
  // misses: below the median (lead 16 -> effective 1 < 4.85)
  const missO2g = o2Gap([
    face56F6Mirror.replace('sight died 27s before death', 'sight died 16s before death'),
    'F6 [F6] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg deploy, wet 27s)'
  ])
  const missEw = entryWindow(missO2g, face56Saves)
  assert.equal(missEw.perDeath.F6.verdict, 'misses')
  assert.deepEqual(saveableDeaths(missEw, missO2g), [])
  // no lane saves in the face: the fits bar has no cost ground (all unpriced) - no class
  const dryO2g = o2Gap(face56F6)
  const dryEw = entryWindow(dryO2g, ['F2 [F2] water: rescue released (surface-safe in 5.7s)'])
  assert.equal(dryEw.perDeath.F6.verdict, 'unpriced')
  assert.deepEqual(saveableDeaths(dryEw, dryO2g), [])
})

test('saveableDeaths is junk-safe: empty rows on null/junk inputs (the zero shape, the v0.379.0 precedent)', () => {
  const o2g = o2Gap(face56F6)
  const ew = entryWindow(o2g, face56Saves)
  assert.deepEqual(saveableDeaths(null, o2g), [])
  assert.deepEqual(saveableDeaths(ew, null), [])
  assert.deepEqual(saveableDeaths('x', 'y'), [])
  assert.deepEqual(saveableDeaths(ew, {}), [])
  assert.deepEqual(saveableDeaths({}, o2g), [])
})
