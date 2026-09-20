// Tests for the drowning policy in src/lib/drowning.mjs.
// The measured death pattern this module closes: fleet 900 s run lost F1 and
// F3 to drowning - bots walk into water (liquidCost=1 made lake crossings
// free), sink with no swim-up, and drown while the work loop keeps issuing
// pathfinder goals that fight every manual control state. These tests pin the
// verdict matrix and the shore scan so the rescue wiring cannot silently rot.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  WATER_NAMES, AIR_NAMES, SHAFT_FLUID_NAMES,
  OXYGEN_RESCUE_LEVEL, OXYGEN_CRITICAL_LEVEL, HEAD_SUBMERGED_RESCUE_MS,
  RESCUE_MAX_MS, RESCUE_COOLDOWN_MS, SHORE_MAX_RADIUS,
  isWaterName, waterVerdict, shoreDirection
} from '../../src/lib/drowning.mjs'

test('waterVerdict: the dry and the merely wet never page the rescue', () => {
  assert.equal(waterVerdict({}), 'none', 'no reads at all = dry')
  assert.equal(waterVerdict({ feet: 'sand', head: 'air', oxygen: 20 }), 'none')
  assert.equal(waterVerdict({ feet: 'water', head: 'air', oxygen: 20 }), 'wet', 'feet-only contact is survivable - walk out')
  assert.equal(waterVerdict({ feet: 'water', head: null, oxygen: 15 }), 'wet', 'unloaded head cell is not water')
  assert.equal(waterVerdict({ feet: 'water', head: 'air', oxygen: 11 }), 'wet', 'one tick above the rescue line: still wet')
})

test('waterVerdict: the measured death pattern reads as drowning', () => {
  // the exact F1/F3 shape: head under, air going
  assert.equal(waterVerdict({ feet: 'water', head: 'water', oxygen: 9 }), 'drowning')
  assert.equal(waterVerdict({ feet: null, head: 'water', oxygen: OXYGEN_RESCUE_LEVEL }), 'drowning', 'the line itself fires (<=)')
  // kelp over the eyes reads as water too (water-content blocks)
  assert.equal(waterVerdict({ feet: 'water', head: 'kelp', oxygen: 20 }), 'wet', 'kelp head with full air is wet only')
  assert.equal(waterVerdict({ feet: 'water', head: 'kelp_plant', oxygen: 8 }), 'drowning')
  assert.equal(waterVerdict({ feet: 'water', head: 'seagrass', oxygen: 3 }), 'drowning')
})

test('waterVerdict: the air bar and the clock override stale block reads', () => {
  assert.equal(waterVerdict({ feet: 'sand', head: 'air', oxygen: 2 }), 'drowning', 'critical air with dry reads: believe the bar')
  assert.equal(waterVerdict({ feet: 'water', head: null, oxygen: 2 }), 'drowning', 'critical air, unreadable head: act')
  assert.equal(
    waterVerdict({ feet: 'water', head: 'water', oxygen: 20, headWetMs: HEAD_SUBMERGED_RESCUE_MS }),
    'drowning',
    'head under for the clock limit drowns even if metadata never updates'
  )
  assert.equal(
    waterVerdict({ feet: 'water', head: 'water', oxygen: 20, headWetMs: HEAD_SUBMERGED_RESCUE_MS - 1 }),
    'wet',
    'just under the clock limit: keep monitoring'
  )
})

test('waterVerdict: junk oxygen is treated as a full bar (never a false 0)', () => {
  assert.equal(waterVerdict({ feet: 'water', head: 'air', oxygen: NaN }), 'wet', 'NaN air must NOT read as critical')
  assert.equal(waterVerdict({ feet: 'water', head: 'air', oxygen: undefined }), 'wet')
  assert.equal(waterVerdict({ feet: 'water', head: 'water', oxygen: '9' }), 'drowning', 'numeric strings still cross the line')
})

test('shoreDirection: finds the nearest walk-out shore', () => {
  // lake with a BOUNDED beach: shore on the east edge (x=8), z strips |z|<=3
  // only - keeps the ring tie-break out of the assertion (the answer is unique)
  const world = (x, y, z) => {
    if (y < 3) return (x >= 8 && Math.abs(z) <= 3) ? 'sand' : 'water' // ground under the beach
    if (y === 3) return (x >= 8 && Math.abs(z) <= 3) ? 'sand' : 'water' // water surface at y=3, beach top east
    return 'air'
  }
  const dir = shoreDirection(world, { x: 4, y: 3, z: 2 })
  assert.ok(dir, 'a shore exists within 4 blocks')
  assert.equal(dir.dx, 4, 'due east')
  assert.equal(dir.dz, 0)
  assert.equal(dir.step, 1, 'the beach top is one above the swim level')
  assert.equal(dir.dist, 4)
})

test('shoreDirection: same-level shore (step 0) beats nothing here but exists', () => {
  // water surface at y=3, land top at y=3 -> ground at y-1=2 east, air above
  const world = (x, y, z) => {
    if (y === 2) return (x >= 6 && Math.abs(z) <= 2) ? 'grass_block' : 'water'
    if (y === 3) return (x >= 6 && Math.abs(z) <= 2) ? 'air' : 'water'
    return 'air'
  }
  const dir = shoreDirection(world, { x: 3, y: 3, z: 0 })
  assert.ok(dir, 'walk-out shore found')
  assert.equal(dir.step, 0, 'ground is one below the swim level: walk out')
  assert.equal(dir.dx, 3)
})

test('shoreDirection: water columns and overhangs never count as land', () => {
  // kelp forest to the east at scan level, real shore north behind the radius
  const world = (x, y, z) => {
    if (y === 2) return x >= 5 ? 'sand' : 'gravel' // floor everywhere (under water)
    if (y === 3) return x >= 5 ? 'kelp' : 'water'
    return 'air'
  }
  const dir = shoreDirection(world, { x: 2, y: 3, z: 0 }, { maxRadius: 6 })
  assert.equal(dir, null, 'kelp columns are water, floor sand is below water - no shore at swim level')
})

test('shoreDirection: unknown and air-below columns are skipped honestly', () => {
  // east reads null (unloaded), south has air below at scan level (overhang)
  const world = (x, y, z) => {
    if (y === 2) return z > 2 ? 'air' : 'water'
    if (y === 3) return x >= 5 ? null : 'water'
    return 'air'
  }
  const dir = shoreDirection(world, { x: 2, y: 3, z: 0 }, { maxRadius: 4 })
  assert.equal(dir, null, 'null reads and air-below columns are not land')
})

test('shoreDirection: junk inputs return null (tread water instead of swimming at ghosts)', () => {
  assert.equal(shoreDirection(null, { x: 0, y: 3, z: 0 }), null)
  assert.equal(shoreDirection(() => 'air', null), null)
  const allWater = () => 'water'
  assert.equal(shoreDirection(allWater, { x: 0, y: 3, z: 0 }), null, 'open ocean: no shore within radius')
  assert.equal(shoreDirection(() => null, { x: 0, y: 3, z: 0 }), null, 'all-unknown: no direction')
})

test('policy constants stay sane', () => {
  assert.ok(OXYGEN_CRITICAL_LEVEL < OXYGEN_RESCUE_LEVEL, 'critical fires before the rescue line')
  assert.ok(OXYGEN_RESCUE_LEVEL <= 10, 'rescue leaves real drowning margin (vanilla: 15 s of air)')
  assert.ok(RESCUE_MAX_MS >= 10000, 'a rescue has time to cross a small lake')
  assert.ok(RESCUE_COOLDOWN_MS > 0 && RESCUE_COOLDOWN_MS < 10000, 'cooldown prevents spin without blinding the sentry')
  assert.ok(HEAD_SUBMERGED_RESCUE_MS >= 3000, 'the metadata fallback is slower than a surface bob')
  assert.ok(SHORE_MAX_RADIUS >= 8, 'the scan reaches a shore a swimming bot can cross in the budget')
  assert.equal(WATER_NAMES.has('water'), true, 'water is water')
  assert.equal(WATER_NAMES.has('kelp'), true, 'water-content blocks count as water')
  assert.equal(WATER_NAMES.has('lava'), false, 'lava is NOT water (different death, different policy)')
  assert.equal(AIR_NAMES.has('air'), true, 'air family pinned')
  for (const f of ['lava', 'flowing_lava', 'water', 'bubble_column']) {
    assert.equal(SHAFT_FLUID_NAMES.has(f), true, `shaft fluid scan covers ${f}`)
  }
})

test('isWaterName: junk names are not water', () => {
  assert.equal(isWaterName('water'), true)
  assert.equal(isWaterName('bubble_column'), true)
  assert.equal(isWaterName(null), false)
  assert.equal(isWaterName(undefined), false)
  assert.equal(isWaterName(''), false)
  assert.equal(isWaterName('waterlogged_mystery'), false, 'no substring matches - exact names only')
  assert.equal(isWaterName(42), false)
})
