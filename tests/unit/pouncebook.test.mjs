import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pounceBook,
  classifySignature,
  POUNCE_SIGNATURE_RE,
  POUNCE_GUARD_RE,
  POUNCE_STALL_RE,
  POUNCE_LANDED_RE,
  POUNCE_PLAN_BACK_TICKS,
  POUNCE_PLAN_JUMP_TICKS
} from '../../src/lib/pouncebook.mjs'
import { climbOutCensus } from '../../src/lib/climbout.mjs'

// The face-42 mini: live rows in the live order (face 42, the stored
// artifact 11210753776) - the classes covered: the support=air
// leftover (oak_leaves step), the honest other (sandstone/sand,
// cobblestone/gravel, birch/birch), the lawn, the floating all-air,
// the stone, the wet-feet guard, the stall.
const FACE42_MINI = [
  'F14 [F14] climb pounce probe: the signature declined (support=air, step=oak_leaves, head=air) - the well census continues',
  'F9 [F9] climb pounce probe: the signature declined (support=sandstone, step=sand, head=air) - the well census continues',
  'F15 [F15] climb pounce probe: the signature declined (support=dirt, step=grass_block, head=air) - the well census continues',
  'F10 [F10] climb pounce probe: the signature declined (support=cobblestone, step=gravel, head=air) - the well census continues',
  'F4 [F4] climb pounce probe: the signature declined (support=dirt, step=grass_block, head=air) - the well census continues',
  'F19 [F19] climb pounce probe: the signature declined (support=dirt, step=grass_block, head=air) - the well census continues',
  'F9 [F9] climb pounce probe: the signature declined (support=air, step=air, head=air) - the well census continues',
  'F13 [F13] climb pounce probe: the signature declined (support=stone, step=stone, head=air) - the well census continues',
  'F16 [F16] climb pounce probe: the guard declined (wet feet) - the ladder owns the level',
  'F11 [F11] climb pounce probe: the signature declined (support=birch_leaves, step=birch_leaves, head=air) - the well census continues',
  'F17 [F17] climb pounce probe: the signature declined (support=air, step=birch_leaves, head=air) - the well census continues',
  'F18 [F18] climb pounce: did not rise (back 4t + jump 24t toward -1,0) - the assist ladder owns it',
  'F12 [F12] climb pounce probe: the signature declined (support=air, step=air, head=air) - the well census continues',
  'F9 [F9] climb pounce probe: the signature declined (support=air, step=air, head=air) - the well census continues'
]

// The face-43 mini: live rows in the live order (face 43, the stored
// artifact 11216019077) - the canopy head-block (leaf_litter under
// oak_leaves), the wet-feet guard FLEET (4 bots), the stalls toward 1,0.
const FACE43_MINI = [
  'F18 [F18] climb pounce: did not rise (back 4t + jump 24t toward 1,0) - the assist ladder owns it',
  'F16 [F16] climb pounce probe: the signature declined (support=air, step=air, head=air) - the well census continues',
  'F8 [F8] climb pounce probe: the signature declined (support=leaf_litter, step=air, head=oak_leaves) - the well census continues',
  'F8 [F8] climb pounce probe: the signature declined (support=dirt, step=grass_block, head=air) - the well census continues',
  'F14 [F14] climb pounce probe: the signature declined (support=stone, step=stone, head=air) - the well census continues',
  'F5 [F5] climb pounce probe: the signature declined (support=leaf_litter, step=air, head=air) - the well census continues',
  'F1 [F1] climb pounce probe: the guard declined (wet feet) - the ladder owns the level',
  'F8 [F8] climb pounce probe: the guard declined (wet feet) - the ladder owns the level',
  'F14 [F14] climb pounce probe: the guard declined (wet feet) - the ladder owns the level',
  'F3 [F3] climb pounce probe: the guard declined (wet feet) - the ladder owns the level',
  'F3 [F3] climb pounce: did not rise (back 4t + jump 24t toward 1,0) - the assist ladder owns it'
]

test('pounce book: the face-42 mini in the live order (the multi-life bot, the classes, the bearings)', () => {
  const g = pounceBook(FACE42_MINI)
  assert.ok(g, 'the book reads the face')

  // F9 is THREE lives in one face (sandstone/sand + two floatings).
  assert.deepEqual(g.bots.F9, {
    signature: 3, floating: 2, headBlocked: 0, supportAir: 0, lawn: 0,
    stone: 0, sigOther: 1, guardWet: 0, guardCap: 0,
    stalls: 0, stallOtherTicks: 0, landed: 0, landedOtherTicks: 0, total: 3
  })
  // F14's support=air leftover (the oak_leaves step is the only thing there).
  assert.equal(g.bots.F14.supportAir, 1)
  assert.equal(g.bots.F14.signature, 1)
  // The wet-feet guard and the stall bot.
  assert.equal(g.bots.F16.guardWet, 1)
  assert.equal(g.bots.F16.total, 1)
  assert.equal(g.bots.F18.stalls, 1)
  assert.equal(g.bots.F18.total, 1)

  // Totals: 12 signature (3 floating, 2 support-air, 3 lawn, 1 stone,
  // 3 other), 1 wet guard, 1 stall.
  assert.deepEqual(g.totals.pairs, {
    'air/oak_leaves': 1,
    'sandstone/sand': 1,
    'dirt/grass_block': 3,
    'cobblestone/gravel': 1,
    'air/air': 3,
    'stone/stone': 1,
    'birch_leaves/birch_leaves': 1,
    'air/birch_leaves': 1
  })
  assert.equal(g.totals.signature, 12)
  assert.equal(g.totals.floating, 3)
  assert.equal(g.totals.supportAir, 2)
  assert.equal(g.totals.lawn, 3)
  assert.equal(g.totals.stone, 1)
  assert.equal(g.totals.sigOther, 3)
  assert.equal(g.totals.headBlocked, 0)
  assert.equal(g.totals.guardWet, 1)
  assert.equal(g.totals.guardCap, 0)
  assert.equal(g.totals.stalls, 1)
  assert.equal(g.totals.landed, 0)
  assert.equal(g.totals.total, 14)
  assert.deepEqual(g.totals.stallBearings, { '-1,0': 1 })
})

test('pounce book: the face-43 mini (the canopy head-block, the wet-feet guard fleet, the 1,0 stalls)', () => {
  const g = pounceBook(FACE43_MINI)
  assert.ok(g)

  // F8 is THREE lives: the canopy read (head=oak_leaves - the ONLY
  // non-air head class at n=2), the lawn, the wet guard.
  assert.deepEqual(g.bots.F8, {
    signature: 2, floating: 0, headBlocked: 1, supportAir: 0, lawn: 1,
    stone: 0, sigOther: 0, guardWet: 1, guardCap: 0,
    stalls: 0, stallOtherTicks: 0, landed: 0, landedOtherTicks: 0, total: 3
  })
  // F14 and F3 are TWO lives each.
  assert.equal(g.bots.F14.stone, 1)
  assert.equal(g.bots.F14.guardWet, 1)
  assert.equal(g.bots.F14.total, 2)
  assert.equal(g.bots.F3.guardWet, 1)
  assert.equal(g.bots.F3.stalls, 1)
  assert.equal(g.bots.F3.total, 2)
  // F5's leaf_litter/air read is NOT support-air (the support holds).
  assert.equal(g.bots.F5.sigOther, 1)

  assert.equal(g.totals.signature, 5)
  assert.equal(g.totals.floating, 1)
  assert.equal(g.totals.headBlocked, 1)
  assert.equal(g.totals.supportAir, 0)
  assert.equal(g.totals.lawn, 1)
  assert.equal(g.totals.stone, 1)
  assert.equal(g.totals.sigOther, 1)
  assert.equal(g.totals.guardWet, 4)
  assert.equal(g.totals.guardCap, 0)
  assert.equal(g.totals.stalls, 2)
  assert.equal(g.totals.total, 11)
  assert.deepEqual(g.totals.pairs, {
    'air/air': 1,
    'leaf_litter/air': 2,
    'dirt/grass_block': 1,
    'stone/stone': 1
  })
  assert.deepEqual(g.totals.stallBearings, { '1,0': 2 })
})

test('pounce book: both faces aggregated (the cross-face name-merge law - F16 is BOTH lives)', () => {
  const g = pounceBook([...FACE42_MINI, ...FACE43_MINI])
  assert.ok(g)

  // The fire-2330 lesson: the same name across faces is ONE bot entry.
  assert.equal(g.bots.F16.signature, 1)
  assert.equal(g.bots.F16.guardWet, 1)
  assert.equal(g.bots.F16.total, 2)
  // F18 is ALSO both lives: one stall per face.
  assert.equal(g.bots.F18.stalls, 2)
  assert.equal(g.bots.F18.total, 2)

  assert.equal(g.totals.signature, 17)
  assert.equal(g.totals.floating, 4)
  assert.equal(g.totals.headBlocked, 1)
  assert.equal(g.totals.supportAir, 2)
  assert.equal(g.totals.lawn, 4)
  assert.equal(g.totals.stone, 2)
  assert.equal(g.totals.sigOther, 4)
  assert.equal(g.totals.guardWet, 5)
  assert.equal(g.totals.guardCap, 0)
  assert.equal(g.totals.stalls, 3)
  assert.equal(g.totals.landed, 0)
  assert.equal(g.totals.total, 25)
  // 8 face-42 pair keys + the leaf_litter/air key = 9.
  assert.equal(Object.keys(g.totals.pairs).length, 9)
  assert.equal(g.totals.pairs['leaf_litter/air'], 2)
  // The stall bearings merge: -1,0 x1 + 1,0 x2.
  assert.deepEqual(g.totals.stallBearings, { '-1,0': 1, '1,0': 2 })
})

test('pounce book: the scope pins (the cap-spent class, the landed voice, the off-plan ticks, the ownership both ways)', () => {
  // The cap-spent guard: ZERO field rows at n=2 - the class parses.
  {
    const g = pounceBook(['F5 [F5] climb pounce probe: the guard declined (the cap spent) - the ladder owns the level'])
    assert.equal(g.totals.guardCap, 1)
    assert.equal(g.totals.guardWet, 0)
    assert.equal(g.totals.total, 1)
  }
  // The landed voice: zero field rows at n=2 - the class parses with
  // the bearing captured.
  {
    const g = pounceBook(['F18 [F18] climb pounce: landed y=71 (back 4t + jump 24t toward 1,0) - the well geometry broken'])
    assert.equal(g.totals.landed, 1)
    assert.deepEqual(g.totals.landedBearings, { '1,0': 1 })
    assert.equal(g.totals.total, 1)
  }
  // The off-plan ticks (a hand-called override) land in the honest
  // other-ticks bucket - the book prices the field, not the constants.
  {
    const g = pounceBook(['F7 [F7] climb pounce: did not rise (back 3t + jump 24t toward 0,-1) - the assist ladder owns it'])
    assert.equal(g.totals.stalls, 0)
    assert.equal(g.totals.stallOtherTicks, 1)
    assert.equal(g.totals.total, 1)
    assert.equal(g.bots.F7.stallOtherTicks, 1)
  }
  // The plan constants held on the faces.
  assert.equal(POUNCE_PLAN_BACK_TICKS, 4)
  assert.equal(POUNCE_PLAN_JUMP_TICKS, 24)
  // The ownership both ways: the climb-out census (fleet19's own
  // emitter) NEVER reads the pounce lines, and the pounce book NEVER
  // reads the climb-out lines - climbout's own comment scopes these
  // out ('a DIFFERENT emitter, one parser per emitter').
  {
    const co = climbOutCensus(FACE42_MINI)
    const coTotal = (co && (co.total ?? co.totals?.total)) ?? 0
    assert.equal(coTotal, 0)
    const pb = pounceBook([
      'F9 climb out: gave up (stalled) after 12s - the shaft refuses',
      'F9 climb out (wet): gave up (timeout) after 9s - the shaft refuses'
    ])
    assert.equal(pb.totals.total, 0)
    assert.deepEqual(pb.bots, {})
  }
  // The well-signature diag lines ('climb: walkable surface...') and
  // the rise-assist lines are DIFFERENT emitters' voices - not read.
  {
    const g = pounceBook([
      'F1 [F1] climb: walkable surface at y=71 (+28 levels, dug=73) - the walk takes over (blocked step)',
      'F9 [F9] climb rise assist: repositioned to -150,63,401 - the loop re-judges',
      'F9 [F9] climb pounce: landed y=70 (back 4t + jump 24t toward 0,1) - the well geometry broken'
    ])
    assert.equal(g.totals.signature, 0)
    assert.equal(g.totals.landed, 1)
    assert.equal(g.totals.total, 1)
  }
})

test('pounce book: the junk battery and the honest zeros', () => {
  assert.equal(pounceBook(null), null)
  assert.equal(pounceBook(undefined), null)
  assert.equal(pounceBook('not an array'), null)
  assert.equal(pounceBook(42), null)

  const empty = pounceBook([])
  assert.ok(empty)
  assert.deepEqual(empty.bots, {})
  assert.equal(empty.totals.total, 0)

  const junk = pounceBook([42, null, {}, [], 'garbage line', '', 'F1 climb pounce probe: the signature declined (support=dirt, step=grass_block, head=air) - the well census continues'])
  assert.equal(junk.totals.total, 0)
  assert.deepEqual(junk.bots, {})

  // A blob line does not match; a prefixed line does not match (the
  // anchors are full-line).
  const blob = pounceBook([
    'x'.repeat(300) + ' climb pounce probe: the signature declined (support=air, step=air, head=air) - the well census continues',
    '  F1 [F1] climb pounce probe: the guard declined (wet feet) - the ladder owns the level'
  ])
  assert.equal(blob.totals.total, 0)

  // A malformed anatomy (missing head) does not match.
  assert.equal(POUNCE_SIGNATURE_RE.test('F1 [F1] climb pounce probe: the signature declined (support=dirt, step=grass_block) - the well census continues'), false)
  assert.equal(POUNCE_GUARD_RE.test('F1 [F1] climb pounce probe: the guard declined (hungry) - the ladder owns the level'), false)
  assert.equal(POUNCE_STALL_RE.test('F1 [F1] climb pounce: did not rise (back 4t + jump 24t) - the assist ladder owns it'), false)
  assert.equal(POUNCE_LANDED_RE.test('F1 [F1] climb pounce: landed (back 4t + jump 24t toward 1,0) - the well geometry broken'), false)

  // The classifier's order law: floating beats the head read, the
  // head block beats the support read, support-air beats the lawn,
  // the lawn and the stone are exact pairs.
  assert.equal(classifySignature('air', 'air', 'air'), 'floating')
  assert.equal(classifySignature('leaf_litter', 'air', 'oak_leaves'), 'head-blocked')
  assert.equal(classifySignature('air', 'birch_leaves', 'air'), 'support-air')
  assert.equal(classifySignature('dirt', 'grass_block', 'air'), 'lawn')
  assert.equal(classifySignature('stone', 'stone', 'air'), 'stone')
  assert.equal(classifySignature('dirt', 'grass_block', 'oak_leaves'), 'head-blocked')
  assert.equal(classifySignature('sandstone', 'sand', 'air'), 'other')
  assert.equal(classifySignature('null', 'air', 'air'), 'other')
})
