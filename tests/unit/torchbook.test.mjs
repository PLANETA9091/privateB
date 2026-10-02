import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  torchBook,
  TORCH_COAL_SKIP_RE,
  TORCH_STICK_SKIP_RE,
  TORCH_TERMINAL_RE,
  TORCH_STREAK_RE,
  TORCH_NOLAND_RE
} from '../../src/lib/torchbook.mjs'
import { armoryCensus } from '../../src/lib/armorycensus.mjs'

// The face-42 mini: live rows in the live order (face 42, the stored
// artifact 11210753776) - the plank rung, the coal floor, the logs
// rung, the streak, the metal-keep terminals, the stick floor.
const FACE42_MINI = [
  'F9 [F9] craft torches: stick-dry but 10 planks held - one stick batch first',
  'F9 [F9] craft torches: skip (no coal: sticks 4 coals 0)',
  'F2 [F2] craft torches: stick-dry with logs held - one plank conversion first',
  'F2 [F2] craft torches: stick-dry but 6 planks held - one stick batch first',
  'F2 [F2] craft torches: skip (no coal: sticks 4 coals 0)',
  'F15 [F15] torch: the placement did not land (dry) x1 - the streak names itself once, a landing re-arms it',
  'F9 [F9] torch: the placement did not land (dry) x1 - the streak names itself once, a landing re-arms it',
  'F3 [F3] craft torches: 1 batch(es) -> 4 torches (sticks 3 coals 16, the metal reserve keeps 3)',
  'F9 [F9] craft torches: 1 batch(es) -> 4 torches (sticks 3 coals 9)',
  'F3 [F3] craft torches: 4 batch(es) -> 16 torches (sticks 2 coals 15, the metal reserve keeps 3)',
  'F1 [F1] craft torches: 2 batch(es) -> 8 torches (sticks 4 coals 3, the metal reserve keeps 1)',
  'F1 [F1] craft torches: skip (no spare sticks: sticks 0 coals 1)'
]

// The face-43 mini: live rows in the live order (face 43, the stored
// artifact 11216019077) - the resupply ask and the zero-coal stick
// floor.
const FACE43_MINI = [
  'F2 [F2] craft torches: stick-dry but 14 planks held - one stick batch first',
  'F2 [F2] craft torches: skip (no coal: sticks 4 coals 0)',
  'F2 [F2] craft torches: pocket coal dry (sticks 1) - the torch-coal resupply asks the commons (2 coal)',
  'F15 [F15] craft torches: skip (no spare sticks: sticks 0 coals 0)',
  'F12 [F12] torch: the placement did not land (dry) x1 - the streak names itself once, a landing re-arms it'
]

test('torch ledger: the face-42 mini in the live order (the rungs, the floors, the metal-keep terminals)', () => {
  const g = torchBook(FACE42_MINI)
  assert.ok(g, 'the book reads the face')

  // F9 is FOUR lives: the plank rung, the coal floor, the plain
  // terminal, the placement streak.
  assert.deepEqual(g.bots.F9, {
    coalSkips: 1, coalSkipSticks: 4, coalSkipCoals: 0,
    stickSkips: 0, stickSkipSticks: 0, stickSkipCoals: 0,
    capDeclines: 0, reserveDeclines: 0, reserveCoal: 0,
    logsRungs: 0, plankRungs: 1, plankRungPlanks: 10,
    resupplyAsks: 0, resupplyAskCoal: 0,
    terminals: 1, terminalBatches: 1, terminalTorches: 4, terminalMetalKept: 0,
    noLands: 0, noLandHeld: 0, errors: 0,
    streaks: 1, streakX: 1, total: 4
  })
  // F3's TWO metal-keep terminals: 5 batches, 20 torches, 6 coal kept.
  assert.equal(g.bots.F3.terminals, 2)
  assert.equal(g.bots.F3.terminalBatches, 5)
  assert.equal(g.bots.F3.terminalTorches, 20)
  assert.equal(g.bots.F3.terminalMetalKept, 6)
  // F2 is the logs rung + the plank rung + the coal floor.
  assert.equal(g.bots.F2.logsRungs, 1)
  assert.equal(g.bots.F2.plankRungs, 1)
  assert.equal(g.bots.F2.plankRungPlanks, 6)
  // F1: the metal-keep terminal + the stick floor (coal in pocket,
  // zero sticks - the inverse famine).
  assert.equal(g.bots.F1.stickSkips, 1)
  assert.equal(g.bots.F1.stickSkipCoals, 1)
  assert.equal(g.bots.F1.terminalMetalKept, 1)

  assert.equal(g.totals.coalSkips, 2)
  assert.equal(g.totals.coalSkipSticks, 8)
  assert.equal(g.totals.coalSkipCoals, 0)
  assert.equal(g.totals.stickSkips, 1)
  assert.equal(g.totals.logsRungs, 1)
  assert.equal(g.totals.plankRungs, 2)
  assert.equal(g.totals.plankRungPlanks, 16)
  assert.equal(g.totals.resupplyAsks, 0)
  assert.equal(g.totals.terminals, 4)
  assert.equal(g.totals.terminalBatches, 8)
  assert.equal(g.totals.terminalTorches, 32)
  assert.equal(g.totals.terminalMetalKept, 7)
  assert.equal(g.totals.streaks, 2)
  assert.equal(g.totals.total, 12)
})

test('torch ledger: the face-43 mini (the resupply ask, the zero-coal stick floor)', () => {
  const g = torchBook(FACE43_MINI)
  assert.ok(g)

  // F2 is THREE lives: the plank rung (14 held), the coal floor, the
  // resupply ask (2 coal).
  assert.deepEqual(g.bots.F2, {
    coalSkips: 1, coalSkipSticks: 4, coalSkipCoals: 0,
    stickSkips: 0, stickSkipSticks: 0, stickSkipCoals: 0,
    capDeclines: 0, reserveDeclines: 0, reserveCoal: 0,
    logsRungs: 0, plankRungs: 1, plankRungPlanks: 14,
    resupplyAsks: 1, resupplyAskCoal: 2,
    terminals: 0, terminalBatches: 0, terminalTorches: 0, terminalMetalKept: 0,
    noLands: 0, noLandHeld: 0, errors: 0,
    streaks: 0, streakX: 0, total: 3
  })
  // F15's stick floor with ZERO coals - the full famine row.
  assert.equal(g.bots.F15.stickSkips, 1)
  assert.equal(g.bots.F15.stickSkipSticks, 0)
  assert.equal(g.bots.F15.stickSkipCoals, 0)
  assert.equal(g.bots.F12.streaks, 1)

  assert.equal(g.totals.coalSkips, 1)
  assert.equal(g.totals.plankRungs, 1)
  assert.equal(g.totals.plankRungPlanks, 14)
  assert.equal(g.totals.resupplyAsks, 1)
  assert.equal(g.totals.resupplyAskCoal, 2)
  assert.equal(g.totals.stickSkips, 1)
  assert.equal(g.totals.terminals, 0)
  assert.equal(g.totals.streaks, 1)
  assert.equal(g.totals.total, 5)
})

test('torch ledger: both faces aggregated (the cross-face name-merge law - F2 is BOTH lives)', () => {
  const g = torchBook([...FACE42_MINI, ...FACE43_MINI])
  assert.ok(g)

  // The fire-2330 lesson: the same name across faces is ONE bot entry.
  // F2: face-42 (logs rung + plank rung 6 + coal floor) + face-43
  // (plank rung 14 + coal floor + the ask).
  assert.equal(g.bots.F2.logsRungs, 1)
  assert.equal(g.bots.F2.plankRungs, 2)
  assert.equal(g.bots.F2.plankRungPlanks, 20)
  assert.equal(g.bots.F2.coalSkips, 2)
  assert.equal(g.bots.F2.resupplyAsks, 1)
  assert.equal(g.bots.F2.total, 6)
  // F15 and F12 are single lives (streaks only).
  assert.equal(g.bots.F15.streaks, 1)
  assert.equal(g.bots.F12.streaks, 1)

  assert.equal(g.totals.coalSkips, 3)
  assert.equal(g.totals.coalSkipSticks, 12)
  assert.equal(g.totals.stickSkips, 2)
  assert.equal(g.totals.logsRungs, 1)
  assert.equal(g.totals.plankRungs, 3)
  assert.equal(g.totals.plankRungPlanks, 30)
  assert.equal(g.totals.resupplyAsks, 1)
  assert.equal(g.totals.resupplyAskCoal, 2)
  assert.equal(g.totals.terminals, 4)
  assert.equal(g.totals.terminalTorches, 32)
  assert.equal(g.totals.terminalMetalKept, 7)
  assert.equal(g.totals.streaks, 3)
  assert.equal(g.totals.total, 17)
  // The histogram: F9=4, F2=6, F15=2 (BOTH lives: face-42 streak +
  // face-43 stick floor), F3=2, F1=2, F12=1.
  assert.equal(g.totals.torchBots[6], 1)
  assert.equal(g.totals.torchBots[4], 1)
  assert.equal(g.totals.torchBots[2], 3)
  assert.equal(g.totals.torchBots[1], 1)
})

test('torch ledger: the scope pins (the zero-row classes, the armory ownership both ways, the anchors)', () => {
  // The honest zero-row classes parse (format-true synthetics from
  // the emitter's own template strings - the field never spoke them
  // at n=2, the classes kept).
  {
    const g = torchBook([
      'F4 [F4] craft torches: skip (the pocket torch cap: held 12 of 12 - sticks 3 coals 9)',
      'F3 [F3] craft torches: the metal fuel reserve holds all 4 coal for the furnace (18 raw metal held)',
      'F9 [F9] craft torches: craft did not land (held 0 torch(es))',
      'F2 [F2] craft torches: failed: craft requires a crafting table nearby'
    ])
    assert.equal(g.totals.capDeclines, 1)
    assert.equal(g.totals.reserveDeclines, 1)
    assert.equal(g.totals.reserveCoal, 4)
    assert.equal(g.totals.noLands, 1)
    assert.equal(g.totals.noLandHeld, 0)
    assert.equal(g.totals.errors, 1)
    assert.equal(g.totals.total, 4)
  }
  // The ownership both ways: the 'craft did not land' rows the FACES
  // actually carry are the ARMORY's skins (sword/spare pick) - the
  // armory census owns them and the torch book NEVER reads them; the
  // torch book's own no-land skin ('craft torches: craft did not
  // land') is a different line the armory never reads.
  {
    const armoryRows = [
      'F18 sword: craft did not land (wooden_sword, holds 0)',
      'F13 spare pick: craft did not land (stone_pickaxe, holds 1)'
    ]
    const tb = torchBook(armoryRows)
    assert.equal(tb.totals.total, 0)
    assert.deepEqual(tb.bots, {})
    const ac = armoryCensus([
      'F9 [F9] craft torches: craft did not land (held 0 torch(es))',
      'F9 [F9] craft torches: 1 batch(es) -> 4 torches (sticks 3 coals 9)'
    ])
    const acTotal = (ac && (ac.total ?? ac.totals?.total)) ?? 0
    assert.equal(acTotal, 0)
  }
  // The generic skip with an UNKNOWN plan reason does not match the
  // coal or stick floors (the anchors are exact) - it falls to the
  // honest nothing, never a mis-classified floor row.
  assert.equal(TORCH_COAL_SKIP_RE.test('F1 [F1] craft torches: skip (no tables: sticks 0 coals 0)'), false)
  assert.equal(TORCH_STICK_SKIP_RE.test('F1 [F1] craft torches: skip (no coal: sticks 0 coals 0)'), false)
  // The streak's class capture: the emitter's own torchLedger
  // vocabulary (dry / cell / wall / place) - 'wet' or anything else
  // is NOT a class the emitter can speak.
  assert.equal(TORCH_STREAK_RE.test('F1 [F1] torch: the placement did not land (wall) x2 - the streak names itself once, a landing re-arms it'), true)
  assert.equal(TORCH_STREAK_RE.test('F1 [F1] torch: the placement did not land (underwater) x2 - the streak names itself once, a landing re-arms it'), false)
  // The terminal's plain vs metal-keep skins: the keeps capture is
  // optional, the counts land in the same terminal row.
  {
    const m1 = TORCH_TERMINAL_RE.exec('F9 [F9] craft torches: 1 batch(es) -> 4 torches (sticks 3 coals 9)')
    assert.equal(m1[6], undefined)
    const m2 = TORCH_TERMINAL_RE.exec('F3 [F3] craft torches: 1 batch(es) -> 4 torches (sticks 3 coals 16, the metal reserve keeps 3)')
    assert.equal(m2[6], '3')
  }
  // The no-land anchor needs the held count.
  assert.equal(TORCH_NOLAND_RE.test('F9 [F9] craft torches: craft did not land (held torch(es))'), false)
})

test('torch ledger: the junk battery and the honest zeros', () => {
  assert.equal(torchBook(null), null)
  assert.equal(torchBook(undefined), null)
  assert.equal(torchBook('not an array'), null)
  assert.equal(torchBook(42), null)

  const empty = torchBook([])
  assert.ok(empty)
  assert.deepEqual(empty.bots, {})
  assert.equal(empty.totals.total, 0)

  const junk = torchBook([42, null, {}, [], 'garbage line', '', '  F1 [F1] craft torches: skip (no coal: sticks 4 coals 0)'])
  assert.equal(junk.totals.total, 0)
  assert.deepEqual(junk.bots, {})

  // A blob line and a prefixed line do not match (full-line anchors).
  const blob = torchBook([
    'x'.repeat(300) + ' craft torches: skip (no coal: sticks 4 coals 0)',
    '  F1 [F1] craft torches: skip (no coal: sticks 4 coals 0)'
  ])
  assert.equal(blob.totals.total, 0)

  // The mismatched bracket (the prefix pins the name via the
  // backreference) does not match.
  assert.equal(TORCH_COAL_SKIP_RE.test('F1 [F2] craft torches: skip (no coal: sticks 4 coals 0)'), false)
  // The malformed anatomy (missing the coals read) does not match.
  assert.equal(TORCH_COAL_SKIP_RE.test('F1 [F1] craft torches: skip (no coal: sticks 4)'), false)
  assert.equal(TORCH_TERMINAL_RE.test('F1 [F1] craft torches: batch(es) -> 4 torches (sticks 3 coals 9)'), false)
  assert.equal(TORCH_STREAK_RE.test('F1 [F1] torch: the placement did not land (dry) - the streak names itself once, a landing re-arms it'), false)
})
