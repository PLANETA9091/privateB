// THE DRAIN'S OWN THIRD BOOK - the drainthird tests (v0.883.0).
//
// The death drops' own u rides the clock's thirds at last: the end-phase
// tax (v0.675.0) priced the final 60s' units, the siege thirds (v0.733.0)
// priced the death COUNTS, the leak clock (v0.472.0) split the leak share,
// the kind join (v0.854.0) priced the kinds - the drops' own u never rode
// a third. Face 145's own fold (run 37947835629, the fire-2340 lens):
// 406u of 566u (72%, 4 of 6 deaths) drained in the late third - the
// deadline's own drain is the u's shape, the bank lane's own lever.
// The verbatim lines below are SYNTHETIC, built from the emitters' own
// templates byte for byte (the v0.875.0 precedent: pre-field tests pin
// the shape, the field face rides the artifact read).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { drainThirdBook, drainThirdConsistent, drainThirdRow } from '../../src/lib/drainthird.mjs'
import { HB_RE, SEAL_DEATH_LOSS_RE, SEAL_DEATH_EMPTY_RE, thirdsVerdict } from '../../src/lib/sealdeath.mjs'

const hb = (n, t) => `b] n=${n} ts=${t}s rss=300M late=5ms mainLate=0ms`
const drop = (bot, u, spot, items) => `${bot} [${bot}] death drop: ~${u}u lost at [${spot}] (${items})`
const emptyDrop = (bot) => `${bot} [${bot}] death drop: pocket read empty at death (0u)`

// face 145's own fold, verbatim (clock end 861s, thirdS 287s): F12 69u at
// 261s (early), F7 91u at 321s (mid), F9 203u at 581s + F13 76u at 601s +
// F18's empty read at 661s + F3 127u at 801s (the late third's own four).
const FACE145 = [
  hb(1, 20),
  hb(8, 261),
  drop('F12', 69, '-151,43,401', 'cobblestone 40, dirt 29'),
  hb(9, 281),
  hb(11, 321),
  drop('F7', 91, '-131,52,408', 'sand 60, gravel 31'),
  hb(14, 581),
  drop('F9', 203, '-141,58,397', 'stone 120, cobblestone 60, sand 23'),
  hb(16, 601),
  drop('F13', 76, '-116,48,392', 'dirt 50, sand 26'),
  hb(19, 661),
  emptyDrop('F18'),
  hb(28, 801),
  drop('F3', 127, '-143,61,387', 'gravel 90, sand 37'),
  hb(30, 861)
]

test('the grammar pin - the emitters\' own lines, whole-anchored', () => {
  const num = SEAL_DEATH_LOSS_RE.exec(drop('F12', 69, '-151,43,401', 'cobblestone 40, dirt 29'))
  assert.ok(num, 'the loss skin rides')
  assert.equal(num[1], 'F12')
  assert.equal(num[2], '69')
  const emp = SEAL_DEATH_EMPTY_RE.exec(emptyDrop('F18'))
  assert.ok(emp, 'the empty skin rides')
  assert.equal(emp[1], 'F18')
  // junk-safe: a caller prefix or a caller suffix never rides
  assert.equal(SEAL_DEATH_LOSS_RE.exec(`x ${drop('F12', 69, '-151,43,401', 'dirt 29')}`), null)
  assert.equal(SEAL_DEATH_LOSS_RE.exec(`${drop('F12', 69, '-151,43,401', 'dirt 29')} y`), null)
  // the heartbeat's own byte is the clock's only skin
  assert.equal(HB_RE.exec(hb(1, 20))[1], '20')
})

test('the thirds edges - the v0.733.0 cut, the boundary rides the later third', () => {
  // clock end 600s -> thirdS 200: 199 rides early, 200 rides mid (t <
  // thirdS strict), 399 mid, 400 late
  const lines = [
    hb(1, 1),
    drop('F1', 10, '0,0,0', 'dirt 10'),
    hb(2, 199),
    drop('F2', 10, '0,0,0', 'dirt 10'),
    hb(3, 200),
    drop('F3', 10, '0,0,0', 'dirt 10'),
    hb(4, 399),
    drop('F4', 10, '0,0,0', 'dirt 10'),
    hb(5, 400),
    drop('F5', 10, '0,0,0', 'dirt 10'),
    hb(6, 600)
  ]
  const b = drainThirdBook(lines)
  assert.ok(b, 'the book folded')
  assert.equal(b.thirdS, 200)
  // the joins: F1@1 early, F2@199 early (the boundary law's own left
  // seat), F3@200 mid (t < thirdS strict - 200 rides the LATER third),
  // F4@399 mid, F5@400 late
  assert.deepEqual([b.thirds.early.u, b.thirds.mid.u, b.thirds.late.u], [20, 20, 10])
  assert.deepEqual([b.thirds.early.n, b.thirds.mid.n, b.thirds.late.n], [2, 2, 1])
})

test('the face-145 fold verbatim - 406u of 566u drained in the late third', () => {
  const b = drainThirdBook(FACE145)
  assert.ok(b, 'the book folded')
  assert.equal(b.drops, 5)
  assert.equal(b.emptyReads, 1)
  assert.equal(b.lostTotal, 566)
  assert.equal(b.clockEnd, 861)
  assert.equal(b.thirdS, 287)
  assert.deepEqual(b.thirds.early, { u: 69, n: 1 })
  assert.deepEqual(b.thirds.mid, { u: 91, n: 1 })
  assert.deepEqual(b.thirds.late, { u: 406, n: 4 })
  assert.deepEqual(b.unplaced, { u: 0, n: 0 })
  assert.equal(b.lateUShare, 72)
  assert.ok(b.seat, 'the seat rides')
  assert.equal(b.seat.cls, 'late')
  assert.equal(b.seat.total, 566)
  assert.equal(drainThirdConsistent(b), true)
})

test('the row byte verbatim - face 145\'s own read', () => {
  const b = drainThirdBook(FACE145)
  assert.equal(
    drainThirdRow(b),
    'the drain\'s own third book (v0.883.0): ~566u lost at 6 death(s) (1 empty read(s)) - early 69u (1) / mid 91u (1) / late 406u (4) - the late third owns 72% - THE DEADLINE\'S OWN DRAIN: the drops\' own u rides the storm third - the bank lane\'s own lever prices here (bank before the third turns)'
  )
})

test('the join law - the last hb wins, the pre-clock drop rides unplaced honest', () => {
  // two hbs before one drop: the latest ts joins (ts=50; clockEnd 90 ->
  // thirdS 30: 50 < 30 false, 50 < 60 true - the drop rides MID)
  const lines = [hb(1, 10), hb(2, 50), drop('F1', 30, '0,0,0', 'dirt 30'), hb(3, 90)]
  const b = drainThirdBook(lines)
  assert.equal(b.thirds.mid.u, 30, 'the last hb before the drop joins (ts=50, mid)')
  assert.equal(b.thirds.late.u, 0)
  assert.equal(b.thirds.early.u, 0)
  // a drop before the first hb: unplaced, the u honest in the totals,
  // outside the seat
  const lines2 = [
    drop('F9', 100, '0,0,0', 'stone 100'),
    hb(1, 300),
    drop('F2', 60, '0,0,0', 'dirt 60'),
    hb(2, 900)
  ]
  const b2 = drainThirdBook(lines2)
  assert.ok(b2, 'the book folded')
  assert.deepEqual(b2.unplaced, { u: 100, n: 1 })
  assert.equal(b2.lostTotal, 160)
  assert.equal(b2.thirds.mid.u, 60, 'F2 joins ts=300 (thirdS 300: 300 < 300 false) - mid')
  assert.equal(b2.thirds.late.u, 0)
  assert.equal(b2.seat.total, 60, 'the seat prices the placed u only')
  assert.equal(drainThirdConsistent(b2), true)
})

test('the empty-pocket honesty - a death is a death, the u stays 0', () => {
  const lines = [hb(1, 300), emptyDrop('F1'), emptyDrop('F2'), hb(2, 900)]
  const b = drainThirdBook(lines)
  assert.ok(b, 'the all-empty face folds')
  assert.equal(b.drops, 0)
  assert.equal(b.emptyReads, 2)
  assert.equal(b.lostTotal, 0)
  assert.equal(b.lateUShare, null, 'the honest zero never divides')
  assert.equal(b.seat.cls, 'none')
  assert.match(drainThirdRow(b), /THE DRAIN'S SILENCE: no u rode the clock - the drops rode empty pockets/)
})

test('the junk battery - the honest nulls and the skipped skins', () => {
  assert.equal(drainThirdBook(null), null, 'junk input reads null')
  assert.equal(drainThirdBook(42), null, 'a number reads null')
  assert.equal(drainThirdBook([hb(1, 100)]), null, 'a clock with no deaths prices nothing (the v0.379.0 precedent)')
  assert.equal(drainThirdBook([drop('F1', 10, '0,0,0', 'dirt 10')]), null, 'no clock end - the honest silence')
  // non-string lines are skipped; the string lines still price
  const dirty = [null, 42, hb(1, 100), undefined, drop('F1', 10, '0,0,0', 'dirt 10'), hb(2, 900)]
  const b = drainThirdBook(dirty)
  assert.ok(b, 'the junk skins skip, the honest lines ride')
  assert.equal(b.lostTotal, 10)
  // a raw blob splits like the census convention
  const blob = FACE145.join('\n')
  const bb = drainThirdBook(blob)
  assert.ok(bb, 'a string blob splits and folds')
  assert.equal(bb.lostTotal, 566)
})

test('the fence battery - a book that cannot prove itself prices nothing', () => {
  const good = drainThirdBook(FACE145)
  assert.equal(drainThirdConsistent(good), true)
  const lie = (patch) => drainThirdConsistent({ ...good, ...patch })
  assert.equal(lie({ lostTotal: 999 }), false, 'the u sums must agree')
  assert.equal(lie({ drops: 99 }), false, 'the death counts must agree')
  assert.equal(lie({ thirds: { ...good.thirds, late: { u: 1, n: 4 } } }), false, 'a thirds u lie prices nothing')
  assert.equal(lie({ thirds: { ...good.thirds, late: { u: 406, n: 9 } } }), false, 'a thirds n lie prices nothing')
  assert.equal(lie({ seat: { ...good.seat, total: 999 } }), false, 'the seat prices the placed u')
  assert.equal(lie({ lateUShare: 50 }), false, 'the late share prices against the lost total')
  assert.equal(lie({ clockEnd: 0 }), false, 'a zero clock prices nothing')
  assert.equal(lie({ drops: -1 }), false, 'a negative death census prices nothing')
  assert.equal(drainThirdRow(null), null, 'the row reads null on the absent book')
  assert.equal(drainThirdRow(lie({ lostTotal: 999 })), null, 'the row reads null on the lying book')
})

test('the verdict reuse - thirdsVerdict\'s own classes ride, never forked', () => {
  // a mid-dominant drain reads the middle's own byte (clockEnd 900 ->
  // thirdS 300: F1@1 early 30, F2@350 + F3@400 mid 180 - 180 >= 140 dominant)
  const midFace = [
    hb(1, 1),
    drop('F1', 30, '0,0,0', 'dirt 30'),
    hb(2, 350),
    drop('F2', 90, '0,0,0', 'dirt 90'),
    hb(3, 400),
    drop('F3', 90, '0,0,0', 'dirt 90'),
    hb(4, 900)
  ]
  const bm = drainThirdBook(midFace)
  assert.equal(bm.seat.cls, 'mid')
  assert.match(drainThirdRow(bm), /THE MIDDLE'S OWN DRAIN/)
  // a spread drain reads the spread byte (50/40/30 - a unique max below
  // the 2/3 bar)
  const spreadFace = [
    hb(1, 1),
    drop('F1', 50, '0,0,0', 'dirt 50'),
    hb(2, 350),
    drop('F2', 40, '0,0,0', 'dirt 40'),
    hb(3, 800),
    drop('F3', 30, '0,0,0', 'dirt 30'),
    hb(4, 900)
  ]
  const bs = drainThirdBook(spreadFace)
  assert.equal(bs.seat.cls, 'spread')
  assert.match(drainThirdRow(bs), /THE DRAIN SPREADS/)
  // the seat rides the SAME verdict law sealdeath's thirds ride
  assert.equal(thirdsVerdict({ early: 0, mid: 270, late: 0 }, 270).cls, 'mid', 'the verdict law reads mid - one law, never forked')
})

test('the decompose WIRING pins - the import band, the print site beside the tax\'s own, the lib bytes', () => {
  const dec = readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.ok(dec.includes("import { drainThirdBook, drainThirdConsistent, drainThirdRow } from '../../src/lib/drainthird.mjs'"), 'the import band grew')
  const site = dec.indexOf('const drainThird = drainThirdBook(lines)')
  const tax = dec.indexOf("console.log(`  end-phase tax:")
  assert.ok(site > 0, 'the print site rides')
  assert.ok(tax > 0 && site > tax, 'the drain book prints beside the end-phase tax\'s own (after it)')
  const lib = readFileSync(new URL('../../src/lib/drainthird.mjs', import.meta.url), 'utf8')
  for (const byte of ['drainThirdBook', 'drainThirdConsistent', 'drainThirdRow', 'thirdsVerdict', 'HB_RE', 'SEAL_DEATH_LOSS_RE', 'SEAL_DEATH_EMPTY_RE']) {
    assert.ok(lib.includes(byte), `the lib byte ${byte} rides`)
  }
})
