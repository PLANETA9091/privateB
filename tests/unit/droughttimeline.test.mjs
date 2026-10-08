//
// droughttimeline.test.mjs - THE PUMP'S OWN TIMELINE (v0.738.0) unit
// tests. The lines are byte-verbatim from the stored faces (face 52 =
// run 37549177806: the pump never spoke; face 53 = run 37553652417:
// the pump banked 24 coal and the yard still read dry), hand-traced
// first, then pinned. The join law: each dry read's line index joins
// against the banks' first index - the reads before it are the
// pump's silence's own, the reads after it are the delivery's own
// break. One parser per shape: the sealed banked line rides
// sealcensus's own SEAL_BANKED_RE, the located dry read rides
// commonsledger's own COMMONS_EMPTY_RE - this lib creates no new RE.
//
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { droughtTimeline, droughtTimelineRow, titheAnswerSize, titheAnswerSizeRow } from '../../src/lib/droughttimeline.mjs'

// Face 53's own shape, verbatim lines and in the live order: the
// early drought (the dry reads ride), F19's 21-coal bank mid-face,
// the dry reads KEEP riding (the stock sat), F4's 3-coal bank late.
const FACE53_MINI = [
  'F2 fuel commons: chest holds no fuel at [-121,71,404]', // 0 - the early drought
  'F11 fuel commons: chest holds no fuel at [-116,71,411]', // 1
  'F2 [F2] craft torches: pocket coal dry (sticks 4) - the torch-coal resupply asks the commons (2 coal)', // the ask - transparent
  'F2 fuel commons: chest holds no fuel', // 3 - the BARE form: no location, no join (the old faces' shape)
  'F19 fuel commons: chest holds no fuel at [-121,71,402]', // 4
  'F19 [F19] fuel tithe: banked 21 x coal (pocket keeps 6)', // 5 - THE FIRST BANK
  'F15 fuel commons: chest holds no fuel at [-126,71,402]', // 6 - AFTER the pump primed
  'F8 [F8] fuel tithe: more firings ride the banked total', // the rider - no units, not a stock event
  'F4 [F4] fuel tithe: banked 3 x coal (pocket keeps 6)', // 8 - the second bank
  'F7 [F7] cobble tithe: banked 47 x cobblestone (pocket keeps 14)', // another family - transparent
  'F1 [F1] smelt tithe: banked 5 x raw_iron (pocket keeps 3)' // another family - transparent
]

test('droughtTimeline: face-53 mini - the pump primed and the yard still read dry', () => {
  const t = droughtTimeline(FACE53_MINI)
  assert.ok(t, 'reads the face')
  assert.equal(t.banks.length, 2, 'the two stock events')
  assert.equal(t.units, 24)
  assert.equal(t.banks[0].bot, 'F19')
  assert.equal(t.banks[0].units, 21)
  assert.equal(t.banks[1].bot, 'F4')
  assert.equal(t.banks[1].units, 3)
  assert.equal(t.dryReads, 4, 'the located form only - the bare form and the rider never join')
  assert.equal(t.firstBankIdx, 5)
  assert.equal(t.prePrime, 3, 'the reads before the first bank: the pump\'s silence\'s own')
  assert.equal(t.postPrime, 1, 'the read after the first bank: the delivery\'s own break')
  assert.equal(t.totalLines, FACE53_MINI.length)
  assert.deepEqual(t.bankShapes.map(s => s.split(' ')[0]), ['F19', 'F4'])
})

test('droughtTimelineRow: the 53rd\'s own verdict - the delivery\'s own break', () => {
  const row = droughtTimelineRow(droughtTimeline(FACE53_MINI))
  assert.ok(row)
  assert.ok(row.includes('the tithe banked 24 coal in 2 firing(s)'), 'the pump\'s own head')
  assert.ok(row.includes('the dry reads 4 (the raw stream\'s own population)'))
  assert.ok(row.includes('before the first bank 3, after it 1'))
  assert.ok(row.includes('the pump primed and the yard still read dry - the delivery\'s own break (the stock sat while the sweeps starved)'))
})

// Face 52's own class, verbatim: the fuel tithe never spoke - the
// drought is the inflow's own.
const FACE52_MINI = [
  'F2 fuel commons: chest holds no fuel at [-136,71,401]',
  'F1 fuel commons: chest holds no fuel at [-116,71,411]',
  'F1 fuel commons: chest holds no fuel at [-116,71,409]'
]

test('droughtTimeline: face-52 mini - the pump never spoke', () => {
  const t = droughtTimeline(FACE52_MINI)
  assert.equal(t.banks.length, 0)
  assert.equal(t.units, 0)
  assert.equal(t.dryReads, 3)
  assert.equal(t.firstBankIdx, -1)
  assert.equal(t.prePrime, 3, 'with no bank, every read is the silence\'s own')
  assert.equal(t.postPrime, 0)
  const row = droughtTimelineRow(t)
  assert.ok(row.includes('the tithe never spoke this face (0 banked firing(s))'))
  assert.ok(row.includes('the dry reads 3 (the raw stream\'s own population)'))
  assert.ok(row.includes('the drought is the inflow\'s own (the pump\'s silence owns it)'))
})

test('droughtTimeline: the pump holds - the drought ended at the first bank', () => {
  const lines = [
    'F9 fuel commons: chest holds no fuel at [-130,71,401]',
    'F9 [F9] fuel tithe: banked 4 x coal (pocket keeps 4)',
    'F9 fuel commons: took 2 units (2 x coal) from a yard chest' // the delivery the field never shows - the grammar owns it
  ]
  const t = droughtTimeline(lines)
  assert.equal(t.banks.length, 1)
  assert.equal(t.units, 4)
  assert.equal(t.dryReads, 1)
  assert.equal(t.prePrime, 1)
  assert.equal(t.postPrime, 0, 'no dry read after the first bank - the pump holds')
  const row = droughtTimelineRow(t)
  assert.ok(row.includes('before the first bank 1, after it 0 - the pump primed and the drought ended at the first bank'))
})

test('droughtTimeline: the honest zero and the junk battery', () => {
  assert.equal(droughtTimeline(null), null)
  assert.equal(droughtTimeline(undefined), null)
  assert.equal(droughtTimeline(42), null)
  const t = droughtTimeline([])
  assert.ok(t)
  assert.deepEqual(t.banks, [])
  assert.equal(t.dryReads, 0)
  assert.equal(droughtTimelineRow(t), null, 'the none form is the honest silence - no row')
  const junk = droughtTimeline([
    42, null, '',
    'b] n=1 ts=21s rss=255M late=6ms mainLate=0ms',
    'F1 [F1] fuel tithe: banked 30 x coal (pocket keeps 4) - the in-loop line landed', // a suffix - the strict grammar drops it
    'F2 [F2] fuel tithe: banked 30 x coal (pocket keeps 4 seal units)', // the seal-reserve keeps clause - still matches (the sealed shape)
    't-0s alive=19/19 mined=1971 map=897p/17ch banked=0 smelted=5 pocket=1693u/226s'
  ])
  assert.equal(junk.banks.length, 1, 'the seal-units clause reads; the suffixed line does not (the strict grammar)')
  assert.equal(junk.units, 30)
  assert.equal(junk.dryReads, 0)
})

// (v0.824.0) THE ANSWER'S OWN SIZE - the tithe's banked units against
// the asks' own hunger. Face 100's own arithmetic (run 37749215341,
// the v0.822.0 tree): asks 39 (78 coal asked), still-dry 39 - every
// ask's answer read zero - while the tithe banked 9 coal in ONE
// firing: the answer is 11.5% of the hunger.
test('titheAnswerSize: face 100 verbatim - 9u banked against 78u asked is 11.5%', () => {
  const r = titheAnswerSize(78, 9)
  assert.deepEqual(r, { asked: 78, banked: 9, share: 0.115 })
  const row = titheAnswerSizeRow(r)
  assert.equal(row, "9u banked against 78u asked (11.5%) - THE ANSWER'S OWN SIZE: the tithe's answer is a fraction of the ask's hunger - the inflow's own size is the drought's own arithmetic")
})

test('titheAnswerSize: the met hunger, the exact meet and the answer\'s own zero', () => {
  const met = titheAnswerSizeRow(titheAnswerSize(50, 60))
  assert.equal(met, "60u banked against 50u asked (120.0%) - THE ANSWER'S OWN SIZE: the tithe met the ask's hunger this face (the drought is not the size)")
  const exact = titheAnswerSizeRow(titheAnswerSize(9, 9))
  assert.equal(exact, "9u banked against 9u asked (100.0%) - THE ANSWER'S OWN SIZE: the tithe met the ask's hunger this face (the drought is not the size)", 'the share exactly 1.0 rides the met branch (>= law)')
  const zero = titheAnswerSizeRow(titheAnswerSize(78, 0))
  assert.equal(zero, "0u banked against 78u asked (0.0%) - THE ANSWER'S OWN SIZE: the firing answered nothing the asks rode (the answer's own zero)")
})

test('titheAnswerSize: the honest silences and the junk battery', () => {
  assert.equal(titheAnswerSize(0, 9), null, 'a hungerless face has no size to price')
  assert.equal(titheAnswerSize(-5, 9), null)
  assert.equal(titheAnswerSize(78, -1), null)
  assert.equal(titheAnswerSize(NaN, 9), null)
  assert.equal(titheAnswerSize(78, NaN), null)
  assert.equal(titheAnswerSize('78', 9).asked, 78, 'the numeric string reads (the Number() coercion)')
  assert.equal(titheAnswerSizeRow(null), null)
  assert.equal(titheAnswerSizeRow(undefined), null)
  assert.equal(titheAnswerSizeRow(42), null)
  assert.equal(titheAnswerSizeRow([]), null, 'the array reads junk')
  assert.equal(titheAnswerSizeRow({ asked: 0, banked: 9, share: 9 }), null)
  assert.equal(titheAnswerSizeRow({ asked: 78, banked: -1, share: 0 }), null)
  assert.equal(titheAnswerSizeRow({ asked: 78, banked: 9, share: NaN }), null)
})

test('titheAnswerSize: the timeline\'s own cells feed the read through the real droughtTimeline', () => {
  // the lib's own join: the timeline's units cell prices against the
  // asks' hunger cell - the FACE53_MINI's own banks (21 + 3 = 24u)
  // against its own ask (2 coal)
  const t = droughtTimeline(FACE53_MINI)
  assert.equal(t.units, 24)
  const r = titheAnswerSize(2, t.units)
  assert.deepEqual(r, { asked: 2, banked: 24, share: 12 })
  const row = titheAnswerSizeRow(r)
  assert.ok(row.includes('(1200.0%) - THE ANSWER\'S OWN SIZE: the tithe met the ask\'s hunger this face'))
})
