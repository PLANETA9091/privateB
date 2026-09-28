// (v0.267.0) THE SEAL DEPTH READ pins - the sealed pocket's decode lead.
// Face 36369215771's census decoded the support dig-down's zero-firing: ALL
// 30 refusals read air=0 below the support - the SEALED POCKET is the world's
// dominant shape (15x sealed + 7x high-and-sealed + the dy 3.0/4.0 timeouts
// sealed too). The single-cell shake buys nothing there and the fence refused
// every candidate HONESTLY. Before any deep-shake variant can be fenced, the
// seal's depth must be measured: a THIN seal (1-2 solid cells then air)
// converts with the deep shake; a THICK one (3+, the probe's cap) leaves only
// the ledge cut. This read instruments the class BEFORE any variant ships.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  sealedColumnDepth, sweepDropRecord, belowResidueRow,
  SUPPORT_DIG_MAX_AIR, SUPPORT_DIG_MAX_DY
} from '../../src/lib/drops.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('sealedColumnDepth: the thin seal reads 1 (the deep shake converts it with one dig)', () => {
  assert.equal(sealedColumnDepth(['solid', 'air', 'solid']), 1)
  assert.equal(sealedColumnDepth(['solid']), 1)
})

test('sealedColumnDepth: the medium seal reads 2 (two digs, the landing still measured)', () => {
  assert.equal(sealedColumnDepth(['solid', 'solid', 'air']), 2)
})

test('sealedColumnDepth: the cap reads 3 - the probe window ends, the deep unknown starts', () => {
  assert.equal(sealedColumnDepth(['solid', 'solid', 'solid']), 3,
    'a full-window seal is the THICK class - the ledge cut is the only cure, the deep shake refuses')
  assert.ok(SUPPORT_DIG_MAX_AIR === 2, 'the fall-window fence stays byte-untouched')
})

test('sealedColumnDepth: the run stops at a fluid (a wet break is never counted past)', () => {
  assert.equal(sealedColumnDepth(['solid', 'fluid', 'solid']), 1,
    'the deep shake would dig into the fluid - the read refuses to count past the break')
})

test('sealedColumnDepth: the junk law - no seal face, no claim', () => {
  assert.equal(sealedColumnDepth(['air', 'solid', 'solid']), null, 'an air face is not a seal')
  assert.equal(sealedColumnDepth(['fluid', 'solid']), null, 'a fluid face is not a seal')
  assert.equal(sealedColumnDepth([null, 'solid', 'solid']), null, 'a junk face claims no depth')
  assert.equal(sealedColumnDepth([]), null, 'no reads, no claim')
  assert.equal(sealedColumnDepth('junk'), null, 'a junk payload claims nothing')
  assert.equal(sealedColumnDepth(undefined), null)
})

test('sealedColumnDepth: the honest partial - a deeper junk cell stops the count, never guesses', () => {
  assert.equal(sealedColumnDepth(['solid', null, 'air']), 1,
    'the measured run is 1 - the count stops at the lost read, a shallower truth, never a deeper guess')
  assert.equal(sealedColumnDepth(['solid', 'solid', null]), 2)
})

test('the ledger row grows the seal histogram at the END (the identity-extends precedent)', () => {
  const row = belowResidueRow([{ sweeps: 2, picked: 5, failed: 4, below: 1, above: 3, deepSkip: 1, lipDig: 0, supportDig: 0, seal1: 2, seal2: 1, seal3: 0 }])
  assert.equal(row, 'sweep drop ledger: sweeps=2 picked=5u failed=4 (below x1, plane x0, above x3) deepSkip=1 lipDig=0 supportDig=0 seal1=2 seal2=1 seal3=0 near=0 far=0 cut=0 nthick=0 nthin=0 ngap=0 step=0 stepcut=0 above1=0 aboveHigh=0')
  assert.ok(row.indexOf('supportDig=0') < row.indexOf('seal1='), 'the legacy tokens keep their positions - the histogram rides the tail')
})

test('the ledger histogram aggregates across records and floors junk at zero', () => {
  const recs = [{ seal1: 2, seal2: 1 }, { seal1: 1, seal3: 4 }, null, { seal2: 'junk' }]
  const recs2 = recs.map(r => sweepDropRecord(r ?? {}))
  const sum = k => recs2.reduce((a, r) => a + r[k], 0)
  assert.equal(sum('seal1'), 3)
  assert.equal(sum('seal2'), 1)
  assert.equal(sum('seal3'), 4)
  assert.equal(recs2[3].seal2, 0, 'a junk depth floors at zero (the fl law)')
})

test('miner wiring: the probe fires ONLY on the sealed class and rides the line tail', () => {
  assert.ok(minerSrc.includes("if (why === 'sealed under the ledge') {"), 'the three-read probe gates on the sealed class alone')
  assert.ok(minerSrc.includes('sealedColumnDepth(verdicts)'), 'the pure read consumes the verdicts')
  assert.ok(minerSrc.includes('`, seal ${sealN ?? \'?\'}`'), 'the line grows the seal token - junk reads ?, a lost read claims no depth')
  assert.ok(minerSrc.includes('(air ${airSupport}, dist ${distXZ.toFixed(1)}${sealTail})'), 'the legacy air/dist tokens keep their positions')
})

test('miner wiring: the histogram counts uncapped (the line stays capped at 2, the ledger does not)', () => {
  const countAt = minerSrc.indexOf("if (sealN === 1) seal1++")
  const capAt = minerSrc.indexOf('if (supportRefusals <= 2)')
  assert.ok(countAt > 0 && capAt > countAt, 'the counters increment BEFORE the line cap - the histogram is the uncapped aggregate')
  assert.ok(minerSrc.includes('sd.seal1 += seal1'), 'the stats aggregate carries the histogram')
  assert.ok(minerSrc.includes('seal1: 0, seal2: 0, seal3: 0, sealNear: 0, sealFar: 0, ledgeCut: 0, sealCutTargets: 0, sealNearThin: 0, sealCutGap: 0, stanceStep: 0, stanceCut: 0 }'), 'the stats init grows the histogram fields')
})

test('the census shape composed: the 30-refusal decode converts into measured classes', () => {
  // face 36369215771: all 30 refusals read air=0 - every one now measures a
  // depth; the variant choice follows the histogram (thin -> the deep shake,
  // thick -> the ledge cut). The fences themselves stay byte-untouched.
  assert.ok(minerSrc.includes('supportDigRefusal(digParams)'), 'the refusal mirror still names the class')
  assert.equal(SUPPORT_DIG_MAX_DY, 3, 'the ledge cap is UNTOUCHED - this fire reads, the next fire cures')
  const thin = sealedColumnDepth(['solid', 'air'])
  const thick = sealedColumnDepth(['solid', 'solid', 'solid'])
  assert.ok(thin === 1 && thick === 3, 'the thin/thick split is the decode lead the next face mines')
})
