// (v0.431.0) THE GOAL ADMISSION's tests - the drop walk's standability gate
// (drops.mjs) plus the dropwalk lens's sixth why ('admission'). The world
// cases are the geometry the project already hand-derived in its own
// comments: the v0.191.0 sealed-under-floor pocket (the measured x9 timeout
// class), the v0.189.0 above-ledge (the wide goal's cured class - the gate
// must NOT refuse it), the open gallery (the item's own cell admits), the
// hovering shaft drop (no footing anywhere in the ball) and the deep-water
// float (the swim arrival). The honesty laws are pinned: junk goal, junk
// range, a missing reader, a null read and a throwing reader all WALK.
// The emitter form is pinned verbatim with and without the walked tail;
// the junk battery rejects the aggregate ledger row, the smelt sweep
// verdict and prose (one parser per emitter, the v0.409.0 split law); the
// census hand-count pins the pollution law (the admission refusal's walked
// 0.0 stays OUT of the timeouts' walked split).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropGoalAdmission, DROP_ADMISSION_WHY } from '../../src/lib/drops.mjs'
import { DROP_WALK_FAIL_RE, classifyDropFailWhy, parseDropWalkFail, dropWalkCensus } from '../../src/lib/dropwalk.mjs'

const AIR = { name: 'air', boundingBox: 'empty' }
const STONE = { name: 'stone', boundingBox: 'block' }
const WATER = { name: 'water', boundingBox: 'empty' }
const LAVA = { name: 'lava', boundingBox: 'empty' }

/** A blockAt over a sparse "x,y,z" -> block map; every miss reads null (a chunk that is not loaded). */
function world (blocks) {
  const m = new Map(Object.entries(blocks))
  return (c) => m.get(`${c.x},${c.y},${c.z}`) ?? null
}

/** The same, with AIR as the default - an open world (galleries read air, not unloaded chunks). */
function airyWorld (blocks) {
  const m = new Map(Object.entries(blocks))
  return (c) => m.get(`${c.x},${c.y},${c.z}`) ?? AIR
}

test('goal admission: the open gallery admits through the item cell itself', () => {
  // the drop rests in the freed cell: feet air, solid ground below, air head
  const w = world({
    '10,45,20': AIR, '10,44,20': STONE, '10,46,20': AIR,
    '9,45,20': AIR, '9,44,20': STONE, '9,46,20': AIR,
    '11,45,20': AIR, '11,44,20': STONE, '11,46,20': AIR,
    '10,45,19': AIR, '10,44,19': STONE, '10,46,19': AIR,
    '10,45,21': AIR, '10,44,21': STONE, '10,46,21': AIR
  })
  const a = dropGoalAdmission({ x: 10, y: 45.2, z: 20, range: 1, blockAt: w })
  assert.equal(a.walk, true)
  assert.deepEqual(a.cell, { x: 10, y: 45, z: 20 })
})

test('goal admission: the sealed-under-floor pocket refuses (the v0.191.0 class)', () => {
  // the drop rests UNDER the gallery floor: the head cell is the very floor
  // the bot stands on, the ball holds only the pocket cell and solid stone
  const w = world({
    '10,45,20': AIR, '10,44,20': STONE, '10,46,20': STONE, // the pocket + its floor-cover ceiling
    '9,45,20': STONE, '9,44,20': STONE, '9,46,20': STONE,
    '11,45,20': STONE, '11,44,20': STONE, '11,46,20': STONE,
    '10,45,19': STONE, '10,44,19': STONE, '10,46,19': STONE,
    '10,45,21': STONE, '10,44,21': STONE, '10,46,21': STONE
  })
  const a = dropGoalAdmission({ x: 10, y: 45.2, z: 20, range: 1, blockAt: w })
  assert.equal(a.walk, false)
  assert.equal(a.why, DROP_ADMISSION_WHY)
  assert.equal(a.cell, null)
})

test('goal admission: the above-ledge keeps its wide-goal cure (the v0.189.0 class is NOT refused)', () => {
  // the drop rests on a ledge at head height against the ceiling; the floor
  // lip beside it (dist^2 = 1 + 1 <= 4) is the legal arrival the wide goal
  // was built for - the gate must admit or the cure dies
  const w = world({
    '10,47,20': AIR, '10,46,20': STONE, '10,48,20': STONE, // the drop cell: ground yes, ceiling yes -> not the arrival
    '11,46,20': AIR, '11,45,20': STONE, '11,47,20': AIR, // the floor lip: the standing cell
    '9,46,20': AIR, '9,45,20': STONE, '9,47,20': AIR,
    '10,46,19': AIR, '10,45,19': STONE, '10,47,19': AIR,
    '10,46,21': AIR, '10,45,21': STONE, '10,47,21': AIR,
    '9,47,20': AIR, '9,48,20': STONE, '11,47,20': AIR, '11,48,20': STONE,
    '10,47,19': AIR, '10,48,19': STONE, '10,47,21': AIR, '10,48,21': STONE
  })
  const a = dropGoalAdmission({ x: 10, y: 47.2, z: 20, range: 2, blockAt: w })
  assert.equal(a.walk, true)
  // the ball holds TWO symmetric standable lips (x=9 and x=11 at y=46) - the
  // gate's promise is THAT AN ARRIVAL EXISTS, not which lip the scan order
  // names first; either proves the v0.189.0 class survives the gate
  assert.ok(
    [ { x: 11, y: 46, z: 20 }, { x: 9, y: 46, z: 20 } ].some(c => JSON.stringify(c) === JSON.stringify(a.cell)),
    `the arrival is one of the two standable lips, got ${JSON.stringify(a.cell)}`
  )
})

test('goal admission: the hovering shaft drop refuses (no footing in the ball)', () => {
  // the item hovers mid-shaft: every ball cell is air with air below - the
  // bot cannot stand (no placement) and the A* has no arrival node
  const w = airyWorld({})
  const a = dropGoalAdmission({ x: 10, y: 45.2, z: 20, range: 1, blockAt: w })
  assert.equal(a.walk, false)
  assert.equal(a.why, DROP_ADMISSION_WHY)
  assert.equal(a.cell, null)
})

test('goal admission: the isEnd ball is a SPHERE in cell space, not a cube', () => {
  // range 2: the cell at dx=2 (dist^2 4 <= 4) is IN the ball; a footable
  // cell at dx=2,dy=1 (dist^2 5) sits in the CUBE span but OUT of the ball
  // - the gate must not arrive on it (GoalNear's own rangeSq law)
  const inBall = dropGoalAdmission({
    x: 10, y: 45, z: 20, range: 2,
    blockAt: airyWorld({ '12,44,20': STONE })
  })
  assert.equal(inBall.walk, true)
  assert.deepEqual(inBall.cell, { x: 12, y: 45, z: 20 })

  const outBall = dropGoalAdmission({
    x: 10, y: 45, z: 20, range: 2,
    blockAt: airyWorld({ '12,45,20': STONE }) // the footing of the dx=2,dy=1 cell
  })
  assert.equal(outBall.walk, false)
  assert.equal(outBall.why, DROP_ADMISSION_WHY)
})

test('goal admission: the deep-water float admits on the swim cell', () => {
  // the item floats on deep water: the water cell itself is the arrival the
  // pathfinder nodes at liquidCost - no footing needed
  const w = world({
    '10,45,20': WATER, '10,44,20': WATER, '10,43,20': WATER, '10,46,20': AIR,
    '9,45,20': WATER, '9,44,20': WATER, '9,46,20': AIR,
    '11,45,20': WATER, '11,44,20': WATER, '11,46,20': AIR,
    '10,45,19': WATER, '10,44,19': WATER, '10,46,19': AIR,
    '10,45,21': WATER, '10,44,21': WATER, '10,46,21': AIR
  })
  const a = dropGoalAdmission({ x: 10, y: 45.2, z: 20, range: 1, blockAt: w })
  assert.equal(a.walk, true)
  assert.deepEqual(a.cell, { x: 10, y: 45, z: 20 })
})

test('goal admission: lava is not a swim arrival (the legal-target law)', () => {
  // a drop over a lava pocket under a ceiling: the ball holds only the lava
  // cell (feet bbox empty but the name is excluded) and stone - refuse
  const w = world({
    '10,45,20': LAVA, '10,44,20': STONE, '10,46,20': STONE,
    '9,45,20': STONE, '9,44,20': STONE, '9,46,20': STONE,
    '11,45,20': STONE, '11,44,20': STONE, '11,46,20': STONE,
    '10,45,19': STONE, '10,44,19': STONE, '10,46,19': STONE,
    '10,45,21': STONE, '10,44,21': STONE, '10,46,21': STONE
  })
  const a = dropGoalAdmission({ x: 10, y: 45.2, z: 20, range: 1, blockAt: w })
  assert.equal(a.walk, false)
  assert.equal(a.why, DROP_ADMISSION_WHY)
})

test('goal admission: the honesty laws - junk goal, junk range, missing reader', () => {
  const w = world({})
  for (const bad of [
    { x: NaN, y: 45, z: 20 },
    { x: 10, y: Infinity, z: 20 },
    { x: '10', y: 45, z: 20 },
    { x: 10, y: 45, z: undefined }
  ]) {
    assert.equal(dropGoalAdmission({ ...bad, range: 1, blockAt: w }).walk, true, `junk goal walks: ${JSON.stringify(bad)}`)
  }
  for (const badRange of [0, -1, NaN, '2', null]) {
    assert.equal(dropGoalAdmission({ x: 10, y: 45, z: 20, range: badRange, blockAt: w }).walk, true, `junk range walks: ${String(badRange)}`)
  }
  assert.equal(dropGoalAdmission({ x: 10, y: 45, z: 20, range: 1, blockAt: null }).walk, true)
  assert.equal(dropGoalAdmission({ x: 10, y: 45, z: 20, range: 1, blockAt: 'nope' }).walk, true)
  assert.equal(dropGoalAdmission({}).walk, true)
})

test('goal admission: the honesty laws - a null read and a throwing reader never refuse', () => {
  // an unloaded chunk: the FIRST feet read is null -> walk (the walk keeps
  // its legacy burn and its walked evidence instead of a false refusal)
  assert.equal(dropGoalAdmission({ x: 10, y: 45, z: 20, range: 1, blockAt: world({}) }).walk, true)
  // a ground read nulling mid-ball is the same law
  const half = (c) => (c.y === 44 ? null : AIR)
  assert.equal(dropGoalAdmission({ x: 10, y: 45, z: 20, range: 1, blockAt: half }).walk, true)
  // a throwing reader never refuses
  const boom = () => { throw new Error('chunk gone') }
  assert.equal(dropGoalAdmission({ x: 10, y: 45, z: 20, range: 1, blockAt: boom }).walk, true)
})

test('goal admission: the verdict is deterministic on the same world', () => {
  const w = world({
    '10,45,20': AIR, '10,44,20': STONE, '10,46,20': STONE,
    '9,45,20': AIR, '9,44,20': STONE, '9,46,20': AIR,
    '11,45,20': STONE, '11,44,20': STONE, '11,46,20': STONE,
    '10,45,19': STONE, '10,44,19': STONE, '10,46,19': STONE,
    '10,45,21': STONE, '10,44,21': STONE, '10,46,21': STONE
  })
  const a = dropGoalAdmission({ x: 10, y: 45, z: 20, range: 1, blockAt: w })
  const b = dropGoalAdmission({ x: 10, y: 45, z: 20, range: 1, blockAt: w })
  assert.deepEqual(a, b)
})

test('drop-walk: the admission fail line parses verbatim (with and without the walked tail)', () => {
  // the emitter form: the catch's fail line with the walked instrument's
  // tail (the refusal fired before the goto - the displacement reads 0.0)
  const a = parseDropWalkFail("F3 [F3] vein sweep: the drop walk to [-120,45,407] failed - goal admission: no standable cell in the goal's arrival sphere - sweep drops refused (dy 0.0, range 1, walked 0.0)")
  assert.equal(a.bot, 'F3')
  assert.deepEqual([a.x, a.y, a.z], [-120, 45, 407])
  assert.equal(a.why, 'admission')
  assert.equal(a.dy, 0.0)
  assert.equal(a.range, 1)
  assert.equal(a.walked, 0.0)

  // the legacy two-field tail parses byte-identically (walked null)
  const b = parseDropWalkFail("F3 [F3] vein sweep: the drop walk to [-120,45,407] failed - goal admission: no standable cell in the goal's arrival sphere - sweep drops refused (dy 0.0, range 1)")
  assert.equal(b.why, 'admission')
  assert.equal(b.walked, null)
})

test('drop-walk: the lib-emitter-parser contract - DROP_ADMISSION_WHY classifies as admission', () => {
  // the whole feature rides one string: the lib's why IS the emitter's
  // message IS the parser's RE - pin the identity end to end
  assert.ok(DROP_WALK_FAIL_RE.test(`F3 [F3] vein sweep: the drop walk to [-120,45,407] failed - ${DROP_ADMISSION_WHY} (dy 0.0, range 1)`), 'the why rides the fail-line shape')
  assert.equal(classifyDropFailWhy(DROP_ADMISSION_WHY).why, 'admission')
  // the near-misses stay honest as other (a mutated why never reads admission)
  assert.equal(classifyDropFailWhy("goal admission: no standable cell in the goal's arrival sphere - sweep drops REFUSED").why, 'other')
  assert.equal(classifyDropFailWhy('goal admission: no standable cell in the arrival sphere - sweep drops refused').why, 'other')
  assert.equal(classifyDropFailWhy('sweep drops: timeout after 8000ms').why, 'timeout')
})

test('drop-walk: the junk battery - the other lanes and prose never parse', () => {
  // the aggregate ledger row is drops.mjs's own counter (not this lens)
  assert.equal(parseDropWalkFail('sweep drop ledger: sweeps=14 picked=66u failed=29 (below x12, plane x4, above x13) deepSkip=16 lipDig=0 supportDig=0 seal1=0 seal2=0 seal3=6 near=2 far=4 cut=0 nthick=0 nthin=0 ngap=2 step=0 stepcut=0 above1=5 aboveHigh=8'), null)
  // the smelt sweep verdict is walkfail.mjs's lane
  assert.equal(parseDropWalkFail('F7 [F7] sweep: 0 collected - the drops sat beyond the magnet'), null)
  // prose and junk
  assert.equal(parseDropWalkFail('F7 [F7] vein sweep: the drop walk failed'), null)
  assert.equal(parseDropWalkFail(null), null)
  assert.equal(parseDropWalkFail(42), null)
})

test('drop-walk: the escape hatch - a broken tail counts unparsed, never silently dropped', () => {
  const broken = "F3 [F3] vein sweep: the drop walk to [-120,45,407] failed - goal admission: no standable cell in the goal's arrival sphere - sweep drops refused"
  assert.equal(parseDropWalkFail(broken), null)
  const c = dropWalkCensus([broken])
  assert.equal(c.unparsed, 1)
  assert.equal(c.fails, 0)
})

test('drop-walk: the census hand-count - the admission family with the pollution law', () => {
  const lines = [
    'F7 [F7] vein sweep: the drop walk to [-136,46,414] failed - sweep drops: timeout after 8000ms (dy 3.0, range 2, walked 0.4)',
    'F2 [F2] vein sweep: the drop walk to [-125,45,411] failed - sweep drops: timeout after 8000ms (dy -1.0, range 2, walked 2.0)',
    "F3 [F3] vein sweep: the drop walk to [-120,45,407] failed - goal admission: no standable cell in the goal's arrival sphere - sweep drops refused (dy 0.0, range 1, walked 0.0)",
    'F9 [F9] vein sweep: the drop walk to [-142,56,420] failed - doomed goal (ledgered 44s ago at [-143,56,419]) - sweep drops refused (dy -2.0, range 2)'
  ]
  const c = dropWalkCensus(lines)
  assert.equal(c.fails, 4)
  assert.equal(c.byWhy.timeout, 2)
  assert.equal(c.byWhy.admission, 1)
  assert.equal(c.byWhy.doomed, 1)
  assert.equal(c.admission.n, 1)
  // THE POLLUTION LAW: the admission refusal's walked 0.0 stays OUT of the
  // timeouts' split (the bot never had a chance to move - the v0.418.0 law)
  assert.equal(c.timeouts.n, 2)
  assert.equal(c.timeouts.walked0, 1)
  assert.equal(c.timeouts.moved1, 1)
  assert.equal(c.timeouts.walkedNull, 0)
  // the dy families ride every parsed fail (the admission line included)
  assert.equal(c.dy.below, 2)
  assert.equal(c.dy.plane, 1)
  assert.equal(c.dy.above, 1)
  // the clock: all four fails rode no heartbeat - untimed, honest
  assert.equal(c.clock.timed, 0)
  assert.equal(c.clock.untimed, 4)
})

test('drop-walk: the honest zeros - a junk-only feed reads all zeros', () => {
  const c = dropWalkCensus(['hello world', 'F1 [F1] tick: moving'])
  assert.equal(c.fails, 0)
  assert.equal(c.unparsed, 0)
  assert.equal(c.admission.n, 0)
  assert.equal(c.timeouts.n, 0)
  assert.equal(c.timeouts.walked0, 0)
  assert.equal(c.timeouts.moved1, 0)
  assert.equal(c.timeouts.maxWalked, null)
  assert.equal(c.dy.below, 0)
  assert.equal(c.dy.plane, 0)
  assert.equal(c.dy.above, 0)
})
