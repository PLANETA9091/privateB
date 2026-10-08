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
import { droughtTimeline, droughtTimelineRow, titheAnswerSize, titheAnswerSizeRow, titheFamilyCensus, titheFamilySeat, titheFamilySeatRow } from '../../src/lib/droughttimeline.mjs'

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

// (v0.827.0) THE TITHE FAMILY'S OWN VOICE - WHICH lane owns the
// deposit family's own firings. Face 102's own shape (run
// 37756117031, the v0.825.0 runtime's debut): the cobble tithe fired
// 9 time(s) and the smelt tithe 5 while the fuel tithe held 0 - the
// deposit system's own lanes banked everything else while the yard's
// fuel inflow starved.
test('titheFamily: face 102 shape verbatim - the cobble owns the voice, the fuel lane silent', () => {
  const lines = [
    'F14 [F14] cobble tithe: banked 31 x cobblestone (pocket keeps 14)',
    'F15 [F15] cobble tithe: banked 22 x cobblestone (pocket keeps 14)',
    'F3 [F3] cobble tithe: banked 46 x cobblestone (pocket keeps 14)',
    'F9 [F9] smelt tithe: banked 1 x sand (pocket keeps 8)',
    'F8 [F8] smelt tithe: banked 12 x sand (pocket keeps 8)',
    'F8 [F8] cobble tithe: more firings ride the banked total' // the emitter's summary - NOT a firing (the strict grammar drops it)
  ]
  const fam = titheFamilyCensus(lines)
  assert.equal(fam.total, 5)
  assert.equal(fam.lanes['cobble tithe'].firings, 3)
  assert.equal(fam.lanes['cobble tithe'].units, 99)
  assert.equal(fam.lanes['smelt tithe'].firings, 2)
  assert.equal(fam.lanes['fuel tithe'], undefined)
  const seat = titheFamilySeat(fam)
  assert.deepEqual(seat, { total: 5, owner: 'cobble tithe', firings: 3, share: 0.6, fuelFirings: 0 })
  const row = titheFamilySeatRow(seat)
  assert.equal(row, "the cobble tithe owns 3 of 5 family firing(s) (60.0%) - THE TITHE FAMILY'S OWN VOICE: one lane's own voice owns the family's book - the fuel tithe 0 firing(s) beside the family's own voice - the drought's inflow gap is the fuel lane's own trigger")
})

test('titheFamily: face 100 shape - the fuel lane\'s own whisper rides the count rider', () => {
  const lines = [
    'F19 [F19] fuel tithe: banked 9 x coal (pocket keeps 6)',
    'F5 [F5] cobble tithe: banked 18 x cobblestone (pocket keeps 14)',
    'F3 [F3] cobble tithe: banked 46 x cobblestone (pocket keeps 14)',
    'F8 [F8] cobble tithe: banked 64 x cobblestone (pocket keeps 14)',
    'F9 [F9] smelt tithe: banked 1 x sand (pocket keeps 8)'
  ]
  const fam = titheFamilyCensus(lines)
  assert.equal(fam.total, 5)
  const seat = titheFamilySeat(fam)
  assert.equal(seat.owner, 'cobble tithe')
  assert.equal(seat.fuelFirings, 1)
  const row = titheFamilySeatRow(seat)
  assert.equal(row, "the cobble tithe owns 3 of 5 family firing(s) (60.0%) - THE TITHE FAMILY'S OWN VOICE: one lane's own voice owns the family's book - the fuel tithe 1 of 5 firing(s) (20.0%) beside the family's own voice")
})

test('titheFamily: the tie owns nothing and the solo fuel face owns its own voice', () => {
  const tie = titheFamilySeatRow(titheFamilySeat(titheFamilyCensus([
    'F5 [F5] cobble tithe: banked 18 x cobblestone (pocket keeps 14)',
    'F19 [F19] fuel tithe: banked 9 x coal (pocket keeps 6)'
  ])))
  assert.equal(tie, "no solo lane owns the family's voice (the tie owns nothing) - the fuel tithe 1 of 2 firing(s) (50.0%) beside the family's own voice")
  const solo = titheFamilySeatRow(titheFamilySeat(titheFamilyCensus([
    'F19 [F19] fuel tithe: banked 9 x coal (pocket keeps 6)'
  ])))
  assert.equal(solo, "the fuel tithe owns 1 of 1 family firing(s) (100.0%) - THE TITHE FAMILY'S OWN VOICE: one lane's own voice owns the family's book - the fuel tithe 1 of 1 firing(s) (100.0%) beside the family's own voice")
})

test('titheFamily: the honest silences and the junk battery', () => {
  assert.equal(titheFamilyCensus(null), null)
  assert.equal(titheFamilyCensus(undefined), null)
  assert.equal(titheFamilyCensus(42), null)
  assert.equal(titheFamilyCensus([]), null, 'no tithes - the honest silence')
  assert.equal(titheFamilyCensus([42, null, '', 'F9 fuel commons: chest holds no fuel at [-117,71,415]']), null)
  assert.equal(titheFamilyCensus([
    'F14 [F14] cobble tithe: banked 31 x cobblestone (pocket keeps 14 seal units) - the suffix the strict grammar drops'
  ]), null, 'the suffixed line is not a firing')
  assert.equal(titheFamilySeat(null), null)
  assert.equal(titheFamilySeat({}), null)
  assert.equal(titheFamilySeat({ lanes: { 'cobble tithe': { firings: 0, units: 0 } }, total: 0 }), null, 'the zero-firing lane picks nothing')
  assert.equal(titheFamilySeat({ lanes: [], total: 3 }), null, 'the array lanes read junk')
  assert.equal(titheFamilySeatRow(null), null)
  assert.equal(titheFamilySeatRow(42), null)
  assert.equal(titheFamilySeatRow([]), null)
  assert.equal(titheFamilySeatRow({ total: 0, owner: 'cobble tithe', firings: 0, share: 0, fuelFirings: 0 }), null)
  assert.equal(titheFamilySeatRow({ total: 5, owner: '', firings: 3, share: 0.6, fuelFirings: 0 }), null, 'the empty owner reads junk')
  assert.equal(titheFamilySeatRow({ total: 5, owner: 'cobble tithe', firings: 0, share: 0, fuelFirings: 0 }), null)
})

// (v0.831.0) THE YARD'S OWN TWO MOUTHS - the receipt's own seat. The
// lines are byte-verbatim from the stored faces (face 103 = run
// 37759188855: F8's 14u fuel firing carried a trip receipt at
// (-123, 82, 414) while the ask's own chest sat at [-113,82,414] -
// d=10.0 inside one yard chest row; F7's firing carried NO receipt;
// face 104 = run 37762508948: three fuel firings, zero receipts - the
// accounting's own blind).
import { titheReceipts, titheReceiptSeat, titheReceiptSeatRow, BANK_LANDED_RE } from '../../src/lib/droughttimeline.mjs'

test('titheReceipts: the face-103 two-mouths shape verbatim + the byte-exact wiring row', () => {
  const lines = [
    'F3 fuel commons: chest holds no fuel at [-113,82,414]',
    'F19 fuel commons: chest holds no fuel at [-117,71,415]',
    'F8 [F8] fuel tithe: banked 14 x coal (pocket keeps 6)',
    'F8 [F8] banked 43 items at (-123, 82, 414) (direct=2 fallback=0 mirror=true kept: wooden_pickaxe, stick, torch, oak_sapling)',
    'F8 [F8] banked 12 items at (-128, 82, 414) (direct=3 fallback=0 mirror=true kept: wooden_pickaxe, stick, torch, oak_sapling)',
    'F7 [F7] cobble tithe: banked 40 x cobblestone (pocket keeps 14)',
    'F7 [F7] fuel tithe: banked 2 x coal (pocket keeps 6)',
    'F7 [F7] end-bank budget spent - smelt skipped'
  ]
  const read = titheReceipts(lines)
  assert.equal(read.firings, 2)
  assert.equal(read.receipted, 1)
  assert.equal(read.blind, 1)
  assert.equal(read.beyond, 1)
  assert.equal(read.withinBody, 0)
  assert.equal(read.minDist, 10, 'the receipt chest (-123,82,414) vs the ask chest [-113,82,414]: dx=10 - the square metric')
  assert.equal(read.dryLocs, 2)
  assert.equal(read.receipts[0].receipt.chest.join(','), '-123,82,414', 'the first same-bot receipt after the firing binds')
  assert.equal(read.receipts[0].receipt.items, 43, 'the trip receipt carries the TRIP mass, the firing rides its own units')
  assert.equal(read.receipts[1].receipt, null, 'F7\'s firing carries no receipt - the trip\'s report never closed')
  const seat = titheReceiptSeat(read)
  assert.equal(seat.owner, 'wiring')
  assert.equal(seat.receipted, 1)
  assert.equal(seat.minDist, 10)
  assert.equal(titheReceiptSeatRow(seat), "1 of 2 fuel firing(s) carry a trip receipt - the nearest receipt landed d=10.0 from the ask's own dry chest - THE YARD'S OWN TWO MOUTHS: the deposit's chest and the ask's chest are different chests - the walk between them is the delivery's own break, not the arrival's own clock")
  // the non-consumption law: two firings of one trip share the trip's one receipt
  const shared = titheReceipts([
    'F2 fuel commons: chest holds no fuel at [-113,82,414]',
    'F7 [F7] fuel tithe: banked 2 x coal (pocket keeps 6)',
    'F7 [F7] fuel tithe: banked 3 x coal (pocket keeps 6)',
    'F7 [F7] banked 9 items at (-113, 82, 414) (direct=1 fallback=0 mirror=true kept: stick)'
  ])
  assert.equal(shared.receipted, 2, 'both firings bind the same receipt - NOT consumed')
  assert.equal(shared.minDist, 0, 'the receipt at the ask\'s own chest reads d=0')
  assert.equal(shared.withinBody, 2)
})

test('titheReceipts: the arrival seat, the split tie, the blind book, the edge rides', () => {
  // the arrival shape: the receipt lands at the ask's own chest (d=0)
  const arrival = titheReceiptSeat(titheReceipts([
    'F2 fuel commons: chest holds no fuel at [-113,82,414]',
    'F8 [F8] fuel tithe: banked 5 x coal (pocket keeps 6)',
    'F8 [F8] banked 5 items at (-113, 82, 414) (direct=1 fallback=0 mirror=true kept: stick)'
  ]))
  assert.equal(arrival.owner, 'arrival')
  assert.equal(arrival.minDist, 0)
  assert.equal(titheReceiptSeatRow(arrival), "1 of 1 fuel firing(s) carry a trip receipt - the receipt met the ask's own read (d=0.0) - THE ARRIVAL'S OWN CLOCK: the stock reached the chest the ask reads - the break is the arrival's own timing, not the yard's own geography")
  // the double chest's own body: d=1 rides within (the join would rather miss a break than invent one)
  const body = titheReceiptSeat(titheReceipts([
    'F2 fuel commons: chest holds no fuel at [-113,82,414]',
    'F8 [F8] fuel tithe: banked 5 x coal (pocket keeps 6)',
    'F8 [F8] banked 5 items at (-113, 82, 415) (direct=1 fallback=0 mirror=true kept: stick)'
  ]))
  assert.equal(body.owner, 'arrival', 'd=1 is the double chest\'s own body - the edge rides')
  // the split tie: one within, one beyond - a tie owns nothing
  const split = titheReceiptSeat(titheReceipts([
    'F2 fuel commons: chest holds no fuel at [-113,82,414]',
    'F8 [F8] fuel tithe: banked 5 x coal (pocket keeps 6)',
    'F8 [F8] banked 5 items at (-113, 82, 414) (direct=1 fallback=0 mirror=true kept: stick)',
    'F1 [F1] fuel tithe: banked 7 x coal (pocket keeps 6)',
    'F1 [F1] banked 7 items at (-103, 82, 414) (direct=1 fallback=0 mirror=true kept: stick)'
  ]))
  assert.equal(split.owner, null, 'the tie owns nothing')
  assert.equal(titheReceiptSeatRow(split), "2 of 2 fuel firing(s) carry a trip receipt (1 within the ask's own chest, 1 beyond) - THE RECEIPT'S OWN SPLIT: the break rides both shapes, no solo shape owns the book")
  // the blind book: the face-104 shape - three firings, zero receipts
  const blind = titheReceiptSeat(titheReceipts([
    'F2 fuel commons: chest holds no fuel at [-113,82,414]',
    'F7 [F7] fuel tithe: banked 11 x coal (pocket keeps 6)',
    'F1 [F1] fuel tithe: banked 24 x coal (pocket keeps 6)',
    'F18 [F18] fuel tithe: banked 17 x coal (pocket keeps 6)'
  ]))
  assert.equal(blind.owner, 'blind')
  assert.equal(blind.receipted, 0)
  assert.equal(blind.minDist, null)
  assert.equal(titheReceiptSeatRow(blind), "0 of 3 fuel firing(s) carry a trip receipt - the trip's own report never closed - THE ACCOUNTING'S OWN BLIND: no receipt is not no delivery, but the mass the receipt never named rides uncounted")
})

test('titheReceipts: the honest silences and the junk battery', () => {
  assert.equal(titheReceipts(null), null)
  assert.equal(titheReceipts(undefined), null)
  assert.equal(titheReceipts(42), null)
  assert.equal(titheReceipts([]), null, 'a fuel-silent face reads the honest silence')
  assert.equal(titheReceipts([42, null, '', 'F8 [F8] banked 43 items at (-123, 82, 414) (direct=2 fallback=0)']), null, 'a receipt with no firing binds nothing')
  assert.equal(titheReceipts([
    'F2 fuel commons: chest holds no fuel at [-113,82,414]',
    'F8 [F8] cobble tithe: banked 40 x cobblestone (pocket keeps 14)'
  ]), null, 'the cobble lane is not the fuel lane - the silence holds')
  assert.equal(titheReceiptSeat(null), null)
  assert.equal(titheReceiptSeat({}), null)
  assert.equal(titheReceiptSeat({ firings: 2, receipted: 1, withinBody: 0, beyond: 0, minDist: 10, dryLocs: 0 }), null, 'a droughtless yard reads the silence')
  assert.equal(titheReceiptSeat({ firings: 2, receipted: 1, withinBody: 0, beyond: 0, minDist: 10, dryLocs: 3 }), null, 'the cells must carry the book - junk never invents a split')
  assert.equal(titheReceiptSeatRow(null), null)
  assert.equal(titheReceiptSeatRow(42), null)
  assert.equal(titheReceiptSeatRow([]), null)
  assert.equal(titheReceiptSeatRow({ owner: 'wiring', firings: 1, receipted: 1, withinBody: 0, beyond: 1, minDist: null }), null, 'the wiring word needs its distance')
  assert.equal(titheReceiptSeatRow({ owner: 'wiring', firings: 1, receipted: 0, withinBody: 0, beyond: 0, minDist: 10 }), null)
  // the junk line battery: malformed shapes never invent a read
  const junk = titheReceipts([
    'F8 [F8] fuel tithe: banked 14 x coal (pocket keeps 6)',
    'F8 [F8] banked 43 items at (-123, 82) (direct=2)', // the two-part loc is not a chest
    'F8 [F8] banked many items at (-123, 82, 414)', // the non-numeric mass
    'F9 [F9] banked 4 items at (a, b, c)', // the non-numeric loc
    'the banked 12 items at (-128, 82, 414) (no bot tag)', // the untagged head
    'F2 fuel commons: chest holds no fuel at [a,b,c]', // the junk dry loc never invents
    'F2 fuel commons: chest holds no fuel', // the bare form carries no position
    'F2 fuel commons: chest holds no fuel at [-113,82,414]'
  ])
  assert.equal(junk.receipted, 0, 'the malformed receipts all drop - the blind is honest')
  assert.equal(junk.dryLocs, 1, 'only the well-formed dry loc counts')
  assert.equal(titheReceiptSeat(junk).owner, 'blind')
  // the RE's own identity: the head anchors, the tail rides
  assert.ok(BANK_LANDED_RE.test('F8 [F8] banked 43 items at (-123, 82, 414) (direct=2 fallback=0 mirror=true kept: wooden_pickaxe)'))
  assert.ok(!BANK_LANDED_RE.test('F8 [F8] banked 43 items at (-123, 82, 414)'.replace(/^/, 'x ')))
})
