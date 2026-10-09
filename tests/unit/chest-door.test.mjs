import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chestDoorBill, chestDoorBillRow } from '../../src/lib/chestdoor.mjs'

// ---- (v0.852.0) THE CHEST DOOR'S OWN BOT BILL - the choke's WHO+WHERE ----
// The bank's docket (v0.700.0) priced the door leg's aggregates; nobody read
// WHO rode the chest-unreachable verdict and WHICH CHEST refused them.

// ---- the face-127 verbatim block (run 37860800596, the real page) ----

test('THE CHEST DOOR BILL: face 127 rides verbatim (7 rides, F9 x4 + F12 x3, the shared dead chest named)', () => {
  const bill = chestDoorBill([
    'F17 bank trip: dusk budget 152s', // the noise the rides live among
    'F9 [F9] hop: chest at [-155,70,404] d=9 zero: chest unreachable (No path to the goal!)',
    'F9 [F9] hop: chest at [-150,70,406] d=12 zero: chest unreachable (No path to the goal!)',
    'F9 bank: chest unreachable (No path to the goal!) (32 blocks from yard) - walking back',
    'F12 [F12] hop: chest at [-155,70,408] d=21 zero: chest unreachable (No path to the goal!)',
    'F12 [F12] hop: chest at [-150,70,406] d=10 zero: chest unreachable (No path to the goal!)',
    'F12 [F12] hop: chest at [-145,70,402] d=6 zero: chest unreachable (Took to long to decide path to goal!)',
    'F9 [F9] hop: chest at [-135,70,398] d=9 zero: chest unreachable (No path to the goal!)'
  ])
  assert.equal(bill.n, 7)
  assert.equal(bill.hop.n, 6)
  assert.equal(bill.bank.n, 1)
  assert.deepEqual(bill.byBot, { F9: 4, F12: 3 })
  assert.deepEqual(bill.repeats, { F9: 4, F12: 3 })
  assert.equal(bill.distinctChests, 5)
  assert.equal(bill.sharedChests, 1)
  assert.deepEqual(bill.chests['-150,70,406'], { n: 2, bots: { F9: 1, F12: 1 } })
  assert.deepEqual(bill.chests['-155,70,404'], { n: 1, bots: { F9: 1 } })
  assert.deepEqual(bill.verdicts, { noPath: 6, decide: 1, other: 0 })
  const row = chestDoorBillRow(bill)
  assert.match(row, /7 ride\(s\) - hop 6 \/ bank 1/)
  assert.match(row, /bots 2 \(repeats F9=4 F12=3\)/)
  assert.match(row, /chests 5 distinct \(shared 1: \[-150,70,406\] x2 F12\+F9\)/)
  assert.match(row, /verdicts no-path 6 \/ decide 1/)
  assert.match(row, /THE DOOR'S OWN CROWD: the repeats name the riders, the shared column names the dead chest/)
})

test('THE CHEST DOOR BILL: the bank ride carries no WHERE cell (the chest book owns the hop rides only)', () => {
  const bill = chestDoorBill([
    'F9 bank: chest unreachable (No path to the goal!) (32 blocks from yard) - walking back'
  ])
  assert.equal(bill.n, 1)
  assert.equal(bill.hop.n, 0)
  assert.equal(bill.bank.n, 1)
  assert.equal(bill.distinctChests, 0)
  assert.equal(bill.sharedChests, 0)
  assert.deepEqual(bill.byBot, { F9: 1 })
  const row = chestDoorBillRow(bill)
  assert.match(row, /chests none \(the hop rides absent\)/)
  assert.match(row, /bots 1, no repeats/)
})

test('THE CHEST DOOR BILL: the bank byte rides bare (no blocks-from-yard, no walk-back tail)', () => {
  const bill = chestDoorBill([
    'F4 bank: chest unreachable (No path to the goal!)'
  ])
  assert.equal(bill.n, 1)
  assert.equal(bill.bank.n, 1)
  assert.deepEqual(bill.verdicts, { noPath: 1, decide: 0, other: 0 })
})

// ---- the honest silence ----

test('THE CHEST DOOR BILL: a door-clean face reads the honest silence', () => {
  assert.equal(chestDoorBill(null), null)
  assert.equal(chestDoorBill(42), null)
  assert.equal(chestDoorBill([]), null)
  assert.equal(chestDoorBill([
    'F9 bank: +67',
    'F12 [F12] hop: chest at [-150,70,406] d=10 zero: chest unreachable (No path to the goal!) - a suffix the grammar never rides'
  ]), null)
  assert.equal(chestDoorBillRow(null), null)
})

// ---- the verdict split's own law ----

test('THE CHEST DOOR BILL: the verdict rides the message\'s own words (no new grammar)', () => {
  const bill = chestDoorBill([
    'F1 [F1] hop: chest at [1,70,3] d=4 zero: chest unreachable (No path to the goal!)',
    'F2 [F2] hop: chest at [2,70,4] d=5 zero: chest unreachable (Took to long to decide path to goal!)',
    'F3 [F3] hop: chest at [3,70,5] d=6 zero: chest unreachable (the yard\'s own refusal)'
  ])
  assert.deepEqual(bill.verdicts, { noPath: 1, decide: 1, other: 1 })
  const row = chestDoorBillRow(bill)
  assert.match(row, /verdicts no-path 1 \/ decide 1 \/ other 1/)
})

// ---- the consistency fence (the house law) ----

test('THE CHEST DOOR BILL: the fence never renders a self-inconsistent shape', () => {
  const good = chestDoorBill([
    'F9 [F9] hop: chest at [-150,70,406] d=12 zero: chest unreachable (No path to the goal!)',
    'F9 bank: chest unreachable (No path to the goal!) - walking back'
  ])
  assert.equal(chestDoorBillRow(good) !== null, true)
  // the lanes' sum broken
  assert.equal(chestDoorBillRow({ ...good, hop: { n: 2 }, bank: { n: 1 } }), null)
  // the byBot sum broken
  assert.equal(chestDoorBillRow({ ...good, byBot: { F9: 5 } }), null)
  // the verdict sum broken
  assert.equal(chestDoorBillRow({ ...good, verdicts: { noPath: 9, decide: 0, other: 0 } }), null)
  // the chest book broken (a chest's bots disagree with the chest's own n)
  assert.equal(chestDoorBillRow({ ...good, chests: { '-150,70,406': { n: 2, bots: { F9: 1 } } } }), null)
  // the chest sum vs the hop rides broken
  assert.equal(chestDoorBillRow({ ...good, chests: { '-150,70,406': { n: 3, bots: { F9: 3 } } } }), null)
  // junk shapes
  assert.equal(chestDoorBillRow('junk'), null)
  assert.equal(chestDoorBillRow({ n: 0 }), null)
})

// ---- WIRING ----

test('WIRING: the decompose prints the chest door\'s own bot bill beside the bank docket', () => {
  const src = fs.readFileSync(new URL('../../scripts/fleet-mining/decompose.mjs', import.meta.url), 'utf8')
  assert.match(src, /import \{ chestDoorBill, chestDoorBillRow \} from '\.\.\/\.\.\/src\/lib\/chestdoor\.mjs'/, 'the lens rides the import band')
  assert.match(src, /const cdb = chestDoorBill\(lines\)/, 'the lens folds the face\'s own lines')
  assert.match(src, /if \(cdbRow\) console\.log\(`  \$\{cdbRow\}`\)/, "the door's own crowd prints beside the docket's own door rows")
  const lib = fs.readFileSync(new URL('../../src/lib/chestdoor.mjs', import.meta.url), 'utf8')
  assert.match(lib, /the chest door's own bot bill \(v0\.852\.0\)/, "the row's own byte lives in the lib")
})
