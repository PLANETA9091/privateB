// (v0.421.0) THE SEAL WATCH - the seal death cure's two legs, pinned on pure
// states. The fixtures are the field's own words: face 26 (36864564525) F14's
// sentry-blind drown at [-125,53,372] - 'death drop: ~118u lost ... (cobblestone
// 64, cobblestone 25, dirt 6, oak_planks 5, stick 5, +9 more)' - the 100u seal
// stake (89 cobble + 6 dirt + 5 planks) that died unnamed; face 26 F4's
// skeleton kill ('dirt 8, oak_planks 5, oak_log 4' -> 17u seal); face 27
// (36870593766) F14's fall with 'pocket read empty at death (0u)' - the
// empty-stake shape. The bound rides the ring's own constant (shelter.mjs
// RING_BLOCKS_NEEDED) - never a re-literalised 8.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEAL_PRIORITY, RING_BLOCKS_NEEDED, shelterDue } from '../../src/lib/shelter.mjs'
import { sealSnapshot, sealDeclareLine, sealRespawnLine } from '../../src/lib/sealwatch.mjs'

// F14's face-26 death pocket, verbatim stacks (the death-drop line's own list,
// the cobblestone carried TWICE - the sum is the snapshot's job).
const F14_DROP = [
  { name: 'cobblestone', count: 64 },
  { name: 'cobblestone', count: 25 },
  { name: 'dirt', count: 6 },
  { name: 'oak_planks', count: 5 },
  { name: 'stick', count: 5 },
  { name: 'raw_copper', count: 2 },
  { name: 'coal', count: 1 },
  { name: 'stone_pickaxe', count: 1 },
  { name: 'torch', count: 4 },
  { name: 'gravel', count: 3 },
  { name: 'flint', count: 1 },
  { name: 'oak_sapling', count: 1 },
  { name: 'bone_meal', count: 1 },
  { name: 'leaf_litter', count: 2 }
]

test('sealSnapshot: F14 face-26 death stake - cobblestone summed across two stacks, junk names excluded', () => {
  const s = sealSnapshot(F14_DROP)
  assert.ok(s, 'a real pocket reads')
  assert.equal(s.total, 100) // 64 + 25 cobble + 6 dirt + 5 oak_planks
  assert.equal(s.bound, RING_BLOCKS_NEEDED, 'the bound is the ring constant, not a literal')
  assert.equal(s.bound, 8)
  assert.equal(s.met, true)
  assert.equal(s.shortfall, 0)
  assert.deepEqual(s.byItem, { cobblestone: 89, dirt: 6, oak_planks: 5 })
  assert.deepEqual(s.top, { name: 'cobblestone', count: 89 })
})

test('sealSnapshot: the honest empty pocket is a VALID zero, not a null', () => {
  const s = sealSnapshot([])
  assert.ok(s)
  assert.equal(s.total, 0)
  assert.equal(s.met, false)
  assert.equal(s.shortfall, 8)
  assert.deepEqual(s.byItem, {})
  assert.equal(s.top, null)
})

test('sealSnapshot: junk-safe - a non-array reads null, junk entries just do not count', () => {
  assert.equal(sealSnapshot(null), null)
  assert.equal(sealSnapshot(undefined), null)
  assert.equal(sealSnapshot('cobblestone 64'), null)
  assert.equal(sealSnapshot(42), null)
  const junky = [{ name: 'cobblestone', count: 10 }, null, {}, { count: 5 }, { name: 'dirt', count: -3 }, { name: 'dirt', count: NaN }, { name: 'dirt', count: 2.9 }]
  const s = sealSnapshot(junky)
  assert.equal(s.total, 12) // 10 cobble + 2 dirt (2.9 floored); the junk names/counts never count
  assert.deepEqual(s.byItem, { cobblestone: 10, dirt: 2 })
})

test('sealSnapshot: the priority walk - stone family before planks, the list order is the only order', () => {
  const s = sealSnapshot([{ name: 'oak_log', count: 4 }, { name: 'stone', count: 9 }])
  assert.deepEqual(s.top, { name: 'stone', count: 9 }) // count wins, not the list order
  const tie = sealSnapshot([{ name: 'spruce_log', count: 3 }, { name: 'dirt', count: 3 }])
  assert.deepEqual(tie.top, { name: 'dirt', count: 3 }) // count tie -> name asc
  assert.ok(SEAL_PRIORITY.includes('dirt') && SEAL_PRIORITY.includes('spruce_log'))
})

test('sealDeclareLine: the risk gate is the shelter gate - no risk, no line', () => {
  // healthy armed bot in daylight, no threat close: the shelter refuses, the declare stays silent
  assert.equal(sealDeclareLine({ tag: 'F14', items: F14_DROP, hp: 20, threatDist: 6, night: false, armed: true, attackers: 1 }), null)
  assert.equal(sealDeclareLine({ tag: 'F14', items: F14_DROP, hp: 20, threatDist: 13, night: true, armed: true, attackers: 1 }), null)
  assert.equal(sealDeclareLine({ tag: 'F14', items: F14_DROP, threatDist: Infinity }), null)
  // the gate re-reads the SAME boundaries: whatever shelterDue refuses, the declare refuses
  assert.equal(shelterDue({ night: true, armed: true, threatDist: 6, hp: 20, attackers: 1 }), false)
  assert.equal(sealDeclareLine({ tag: 'F14', items: F14_DROP, hp: 20, threatDist: 6, night: true, armed: true, attackers: 1 }), null)
})

test('sealDeclareLine: the three honest shapes at a confirmed risk', () => {
  // met: F14's face-26 stake on the founding risk class - the NAKED bot at a
  // night threat (armed=false, the shelter gate's own unlock); an ARMED
  // healthy bot is not a risk the shelter reads, and the declare agrees.
  assert.equal(
    sealDeclareLine({ tag: 'F14', items: F14_DROP, hp: 20, threatDist: 5, night: true, armed: false, attackers: 1 }),
    'F14 seal declare: 100u seal held (cobblestone 89) - the floor is met, the stake rides the risk'
  )
  // the losing-fight path (hp below the floor, day, engaged) declares too
  assert.equal(
    sealDeclareLine({ tag: 'F4', items: [{ name: 'dirt', count: 8 }, { name: 'oak_planks', count: 5 }, { name: 'oak_log', count: 4 }], hp: 6, threatDist: 2, night: false, armed: false, attackers: 1 }),
    'F4 seal declare: 17u seal held (dirt 8) - the floor is met, the stake rides the risk'
  )
  // partial: 5 of 8, short 3 - the erase warning
  assert.equal(
    sealDeclareLine({ tag: 'F5', items: [{ name: 'dirt', count: 5 }], hp: 20, threatDist: 5, night: true, armed: false, attackers: 1 }),
    'F5 seal declare: 5u seal held (dirt 5), floor short 3 - a death here erases the floor'
  )
  // empty: the honest zero - the total-seal-loss warning
  assert.equal(
    sealDeclareLine({ tag: 'F14', items: [], hp: 20, threatDist: 5, night: true, armed: false, attackers: 1 }),
    'F14 seal declare: 0u seal held - the floor is empty, a death here is a total seal loss'
  )
})

test('sealDeclareLine: junk-safe - no tag, unread pocket, junk risk inputs print nothing', () => {
  assert.equal(sealDeclareLine({ tag: '', items: F14_DROP, hp: 6, threatDist: 2 }), null)
  assert.equal(sealDeclareLine({ tag: 'F14', items: null, hp: 6, threatDist: 2 }), null, 'an unread pocket invents no stake')
  assert.equal(sealDeclareLine({ tag: 'F14', items: 'junk', hp: 6, threatDist: 2 }), null)
})

test('sealRespawnLine: the face-26 F14 arc - 100u stake, vanilla-empty respawn, the full floor gone', () => {
  const stake = sealSnapshot(F14_DROP)
  assert.equal(
    sealRespawnLine({ tag: 'F14', death: stake, items: [] }),
    'F14 seal after respawn: pocket 0u seal, 100u of the 100u stake is gone - the floor must re-earn'
  )
  // a partial carry still prices the honest floor (carried may be re-gathered, never a recovery credit)
  assert.equal(
    sealRespawnLine({ tag: 'F14', death: stake, items: [{ name: 'cobblestone', count: 3 }] }),
    'F14 seal after respawn: pocket 3u seal (cobblestone 3), 97u of the 100u stake is gone - the floor must re-earn'
  )
  // the stake outlived the death (a reloot walk landed): the floor holds
  assert.equal(
    sealRespawnLine({ tag: 'F14', death: stake, items: [{ name: 'cobblestone', count: 12 }] }),
    'F14 seal after respawn: pocket 12u seal (cobblestone 12) - the floor holds against the 100u stake'
  )
})

test('sealRespawnLine: the face-27 F14 shape - the empty stake is its own honest read', () => {
  const empty = sealSnapshot([])
  assert.equal(
    sealRespawnLine({ tag: 'F14', death: empty, items: [] }),
    'F14 seal after respawn: pocket 0u seal - the death stake was empty, the floor starts from zero'
  )
  assert.equal(
    sealRespawnLine({ tag: 'F14', death: empty, items: [{ name: 'dirt', count: 2 }] }),
    'F14 seal after respawn: pocket 2u seal (dirt 2) - the death stake was empty, the floor starts from zero'
  )
})

test('sealRespawnLine: the unread halves stay honest - unread stake, unread pocket, the stake that survived', () => {
  assert.equal(
    sealRespawnLine({ tag: 'F10', death: null, items: [{ name: 'cobblestone', count: 3 }] }),
    'F10 seal after respawn: pocket 3u seal (cobblestone 3) - the death stake unread, the loss unpriced'
  )
  assert.equal(
    sealRespawnLine({ tag: 'F10', death: { total: NaN }, items: [{ name: 'cobblestone', count: 3 }] }),
    'F10 seal after respawn: pocket 3u seal (cobblestone 3) - the death stake unread, the loss unpriced'
  )
  assert.equal(
    sealRespawnLine({ tag: 'F5', death: sealSnapshot(F14_DROP), items: null }),
    'F5 seal after respawn: pocket unread - the death stake is unaccounted'
  )
  assert.equal(
    sealRespawnLine({ tag: 'F5', death: sealSnapshot(F14_DROP), items: 'junk' }),
    'F5 seal after respawn: pocket unread - the death stake is unaccounted'
  )
  // the whole stake carried through (carried >= stake, still short of the floor)
  assert.equal(
    sealRespawnLine({ tag: 'F6', death: sealSnapshot([{ name: 'dirt', count: 5 }]), items: [{ name: 'dirt', count: 5 }] }),
    'F6 seal after respawn: pocket 5u seal (dirt 5) - the 5u stake survived the death, floor short 3'
  )
})

test('sealRespawnLine: junk-safe - no tag prints nothing', () => {
  assert.equal(sealRespawnLine({ tag: '', death: null, items: [] }), null)
})

test('the seal family law: one list, four arithmetics - the watch spends the SAME SEAL_PRIORITY', () => {
  // a junk-battery pocket: every SEAL_PRIORITY name counts, nothing else does
  const items = SEAL_PRIORITY.map(name => ({ name, count: 1 })).concat([{ name: 'raw_copper', count: 50 }, { name: 'stick', count: 9 }, { name: 'coal', count: 7 }])
  const s = sealSnapshot(items)
  assert.equal(s.total, SEAL_PRIORITY.length)
  assert.equal(Object.keys(s.byItem).length, SEAL_PRIORITY.length)
})
