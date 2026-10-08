import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chestCloseSeat, chestCloseSeatRow } from '../../src/lib/commonsledger.mjs'

// The chest anatomy's own five cells (v0.502.0), priced by the seat law
// (v0.815.0): WHICH chest-side close owns the sweep's chest book. The
// held faces' own shapes - face 94 (run 37729795006): empty 16 /
// open-fail 1 / vertical doom 2 / vanished 0 / cover stand-downs 1;
// face 92 (run 37724826492): empty 52 / open-fail 2 / vertical doom 7 /
// vanished 0 / cover stand-downs 2; face 91 (run 37722166847):
// empty 0 / open-fail 1 / vertical doom 3 / vanished 0 / cover
// stand-downs 1; face 90 (run 37719546916): empty 0 / open-fail 3 /
// vertical doom 5 / vanished 0 / cover stand-downs 3. The cells are the
// tally's own fold - zero re-parsing, the v0.802.0 seat law; the
// strict-majority law (topUnits * 2 > total), no solo majority reads
// the honest mix row.

test('v0.815.0: the face-94 shape byte-exact - empty owns the yard\'s own drought front', () => {
  const cells = { emptyChest: 16, openFail: 1, verticalDoom: 2, blockVanished: 0, coverStandDown: 1 }
  const seat = chestCloseSeat(cells)
  assert.equal(seat.total, 20, 'the book is the cells\' own sum (16+1+2+0+1)')
  assert.equal(seat.owner, 'empty')
  assert.equal(seat.units, 16)
  assert.equal(seat.share, 0.8)
  assert.equal(seat.bad, 0)
  assert.equal(chestCloseSeatRow(seat), 'empty owns 16 of 20 chest close(s) (80.0%) - THE CHEST\'S OWN CLOSE: the yard\'s own drought arrived first - the sweep reached the chest and the stock wasn\'t there (the inflow is the front)')
})

test('v0.815.0: the face-92 and face-91 shapes byte-exact - the empty law\'s 2nd face and the vertical\'s own front', () => {
  const f92 = chestCloseSeatRow(chestCloseSeat({ emptyChest: 52, openFail: 2, verticalDoom: 7, blockVanished: 0, coverStandDown: 2 }))
  assert.equal(f92, 'empty owns 52 of 63 chest close(s) (82.5%) - THE CHEST\'S OWN CLOSE: the yard\'s own drought arrived first - the sweep reached the chest and the stock wasn\'t there (the inflow is the front)')
  const f91 = chestCloseSeatRow(chestCloseSeat({ emptyChest: 0, openFail: 1, verticalDoom: 3, blockVanished: 0, coverStandDown: 1 }))
  assert.equal(f91, 'vertical doom owns 3 of 5 chest close(s) (60.0%) - THE CHEST\'S OWN CLOSE: the reach\'s own geometry - the chest sat beyond the climb (the vertical\'s own front)')
  // the zero cells ride silent - the book is the counted cells' own sum
  assert.equal(chestCloseSeat({ emptyChest: 0, openFail: 1, verticalDoom: 3, blockVanished: 0, coverStandDown: 1 }).total, 5)
})

test('v0.815.0: the strict-majority fence - the face-90 mix reads the honest no-owner row, exactly-at-half owns nothing', () => {
  // face 90: vertical 5 / open-fail 3 / cover 3 - 10 of 11 refuses the seat
  assert.equal(chestCloseSeatRow(chestCloseSeat({ emptyChest: 0, openFail: 3, verticalDoom: 5, blockVanished: 0, coverStandDown: 3 })), 'no solo class owns the chest book (the mix owns nothing)')
  const s90 = chestCloseSeat({ openFail: 3, verticalDoom: 5, coverStandDown: 3 })
  assert.equal(s90.owner, null)
  assert.equal(s90.units, 0)
  assert.equal(s90.word, null)
  assert.equal(s90.total, 11)
  // exactly-at-half: 3 of 6 is no majority (the law: topUnits * 2 > total)
  assert.equal(chestCloseSeat({ openFail: 3, coverStandDown: 3 }).owner, null)
  // one past the fence: 4 of 7 seats
  const over = chestCloseSeat({ openFail: 4, coverStandDown: 3 })
  assert.equal(over.owner, 'open-fail')
  assert.equal(chestCloseSeatRow(over), 'open-fail owns 4 of 7 chest close(s) (57.1%) - THE CHEST\'S OWN CLOSE: the hand\'s own front - the chest refused the open (the lid\'s own price)')
  // a two-cell tie rides the ranked byte order but still owns nothing (2 of 2)
  assert.equal(chestCloseSeat({ openFail: 1, coverStandDown: 1 }).owner, null)
  // the single-class book reads its own 100%
  const solo = chestCloseSeat({ blockVanished: 4 })
  assert.equal(chestCloseSeatRow(solo), 'vanished owns 4 of 4 chest close(s) (100.0%) - THE CHEST\'S OWN CLOSE: the world\'s own shift - the chest\'s own block left (the ground\'s own churn)')
})

test('v0.815.0: the junk battery + the row guards + the honest silence end to end', () => {
  // junk never invents a close - skipped and counted, the real cells still tally
  const j = chestCloseSeat({ emptyChest: Number.NaN, openFail: -2, verticalDoom: 2, coverStandDown: 'junk' })
  assert.equal(j.total, 2)
  assert.equal(j.owner, 'vertical doom')
  assert.equal(j.bad, 3, 'the nan + the negative + the string counted, never priced')
  // the honest silences
  assert.equal(chestCloseSeat(null), null)
  assert.equal(chestCloseSeat('junk'), null)
  assert.equal(chestCloseSeat([]), null, 'an array is no cells book')
  assert.equal(chestCloseSeat({}), null, 'an absent book reads silence')
  assert.equal(chestCloseSeat({ emptyChest: 0, openFail: 0, verticalDoom: 0, blockVanished: 0, coverStandDown: 0 }), null, 'a zero book reads silence')
  assert.equal(chestCloseSeat({ emptyChest: -1 }), null, 'a negative-only book reads silence (bad counted)')
  // the row guards: junk seats never print
  assert.equal(chestCloseSeatRow(null), null, 'no seat - no row')
  assert.equal(chestCloseSeatRow({ total: 0, owner: 'empty', units: 0, share: 0, word: 'x' }), null, 'a zero total never prints')
  assert.equal(chestCloseSeatRow({ total: 5, owner: 'ghost class', units: 3, share: 0.6, word: 'x' }), null, 'an unknown label never prints')
  assert.equal(chestCloseSeatRow({ total: 5, owner: 'empty', units: 9, share: 1.8, word: 'x' }), null, 'units beyond the book never print')
  assert.equal(chestCloseSeatRow({ total: 5, owner: 'empty', units: 3, share: 0.6, word: '' }), null, 'a wordless seat never prints')
  // the WIRING one-truth fold: the seat's book is the tally's own sum
  const t = { emptyChest: 16, openFail: 1, verticalDoom: 2, blockVanished: 0, coverStandDown: 1 }
  assert.equal(chestCloseSeat(t).total, t.emptyChest + t.openFail + t.verticalDoom + t.blockVanished + t.coverStandDown)
})
