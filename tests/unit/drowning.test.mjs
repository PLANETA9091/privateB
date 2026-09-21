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
  RESCUE_MAX_MS, RESCUE_COOLDOWN_MS, SHORE_MAX_RADIUS, AIR_GLITCH_LOG_MS,
  AQUATIC_HOSTILES,
  isWaterName, waterVerdict, airBarTrust, shoreDirection, rescueDone, fleePlan
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

test('waterVerdict: the air bar and the clock override UNKNOWN and WET reads', () => {
  assert.equal(waterVerdict({ feet: 'water', head: null, oxygen: 2 }), 'drowning', 'critical air, unreadable head: act')
  assert.equal(waterVerdict({ feet: 'stone', head: null, oxygen: 2 }), 'drowning', 'critical air, unreadable head over stone feet: still act')
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

test('waterVerdict: DEFINITE dry reads out-vote a glitching air bar (fleet #120: 140 fake rescues)', () => {
  // fleet #120 measured 140 rescue starts on bone-dry bots: on 26.2 the oxygen
  // metadata can read ~0 on land, and the old "believe the bar" policy turned
  // every such tick into a rescue that cancelled the walk goal just issued
  assert.equal(waterVerdict({ feet: 'sand', head: 'air', oxygen: 2 }), 'none', 'critical air with two dry reads: sensor glitch, do not swim')
  assert.equal(waterVerdict({ feet: 'stone', head: 'air', oxygen: 0 }), 'none', 'oxygen 0 on definite dry land is the glitch, not drowning')
  assert.equal(waterVerdict({ feet: 'deepslate', head: 'cave_air', oxygen: OXYGEN_CRITICAL_LEVEL }), 'none', 'the line itself is gated too (<=)')
  // wet contact still believes the bar - the F1/F3 sinking shape keeps its rescue
  assert.equal(waterVerdict({ feet: 'water', head: 'air', oxygen: 2 }), 'drowning', 'feet in water + critical bar: real')
  assert.equal(waterVerdict({ feet: 'kelp', head: 'air', oxygen: 2 }), 'drowning', 'water-content feet count as wet contact')
  assert.equal(waterVerdict({ feet: null, head: null, oxygen: 2 }), 'drowning', 'unreadable world + critical bar: act (the old fallback)')
  assert.equal(waterVerdict({ feet: 'stone', head: null, oxygen: 2 }), 'drowning', 'one unknown read leaves the bar in charge')
})

test('airBarTrust: the contact classifier behind the air-bar gate', () => {
  assert.equal(airBarTrust({ feet: 'sand', head: 'air' }), 'dry', 'two definite non-water reads are dry')
  assert.equal(airBarTrust({ feet: 'stone', head: 'cave_air' }), 'dry', 'cave air is air-family, reads dry')
  assert.equal(airBarTrust({ feet: 'water', head: 'air' }), 'wet', 'feet-only contact is wet')
  assert.equal(airBarTrust({ feet: 'air', head: 'kelp' }), 'wet', 'water-content blocks read wet')
  assert.equal(airBarTrust({ feet: 'bubble_column', head: 'air' }), 'wet', 'bubble column is water contact')
  assert.equal(airBarTrust({ feet: null, head: 'air' }), 'unknown', 'one missing read is unknown, never dry')
  assert.equal(airBarTrust({ feet: 'stone', head: null }), 'unknown')
  assert.equal(airBarTrust({}), 'unknown', 'no reads at all: unknown')
  assert.equal(airBarTrust(), 'unknown', 'no argument: unknown')
  assert.equal(airBarTrust({ feet: 'water', head: 'water' }), 'wet')
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

test('rescueDone: the swim rescue keeps the bot while drowning is possible', () => {
  // head wet = the F1/F3 sinking shape: never hand over, whatever else reads
  assert.equal(rescueDone({ headWet: true, shore: null, onGround: true }), false, 'head wet: keep swimming')
  assert.equal(rescueDone({ headWet: true, shore: { dx: 1, dz: 0 }, onGround: true }), false, 'head wet + shore: keep swimming')
  assert.equal(rescueDone({ headWet: true, shore: null, onGround: false }), false)
  // a shore plan exists: the swim phase owns the bot until it lands
  assert.equal(rescueDone({ headWet: false, shore: { dx: 3, dz: 0, step: 0 }, onGround: false }), false, 'shore in sight: swim on')
  // floating in open water, no shore: tread (the old behaviour, still safe)
  assert.equal(rescueDone({ headWet: false, shore: null, onGround: false }), false, 'floating deep: keep treading')
})

test('rescueDone: standing in shallow water without a shore ends the rescue (CI 35511474490)', () => {
  // the measured poisoned case: flooded 1x1 shaft, feet in water, head dry,
  // shoreDirection null (walls, not beaches) - the old loop treaded the FULL
  // RESCUE_MAX_MS holding the fleet walk-gate while the bot was safe
  assert.equal(rescueDone({ headWet: false, shore: null, onGround: true }), true, 'standing wet: hand the bot back NOW')
  // junk inputs stay conservative: no reads -> never a hand-back
  assert.equal(rescueDone({}), false, 'no information: keep the rescue')
  assert.equal(rescueDone(), false, 'no argument: keep the rescue')
  assert.equal(rescueDone({ headWet: 1, shore: 0, onGround: 'yes' }), false, 'junk truthy headWet keeps the swim')
  assert.equal(rescueDone({ headWet: null, shore: null, onGround: 1 }), true, 'numeric onGround is a stand')
})

test('policy constants stay sane', () => {
  assert.ok(OXYGEN_CRITICAL_LEVEL < OXYGEN_RESCUE_LEVEL, 'critical fires before the rescue line')
  assert.ok(OXYGEN_RESCUE_LEVEL <= 10, 'rescue leaves real drowning margin (vanilla: 15 s of air)')
  assert.ok(RESCUE_MAX_MS >= 10000, 'a rescue has time to cross a small lake')
  assert.ok(RESCUE_COOLDOWN_MS > 0 && RESCUE_COOLDOWN_MS < 10000, 'cooldown prevents spin without blinding the sentry')
  assert.ok(HEAD_SUBMERGED_RESCUE_MS >= 3000, 'the metadata fallback is slower than a surface bob')
  assert.ok(AIR_GLITCH_LOG_MS >= 5000, 'the glitch log is rate-limited enough not to spam the fleet log')
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

// ---- v0.51.0: the WATER-FLEE cure ----
// Fleet 35610870878 measured F13 dying to a drowned flee-chase at hp 4.0 - the
// raw away-vector ran DEEPER into the water the drowned owns. The cure: an
// aquatic threat + wet feet + a known shore = flee TOWARD THE SHORE; a land
// threat keeps the away-vector (the shore may be behind the zombie).
test('fleePlan: an aquatic threat in water flees to the shore, not deeper', () => {
  const shore = { dx: 3, dz: -2, dist: 4, step: 0 }
  assert.deepEqual(fleePlan({ threatName: 'drowned', feetWet: true, shore }), { kind: 'shore', dx: 3, dz: -2, step: 0 }, 'the measured F13 cell: drowned chase while wet')
  assert.equal(fleePlan({ threatName: 'guardian', feetWet: true, shore }).kind, 'shore', 'monument mobs own the water too')
  assert.equal(fleePlan({ threatName: 'elder_guardian', feetWet: true, shore }).kind, 'shore')
  assert.equal(AQUATIC_HOSTILES.has('drowned'), true, 'the drowned is pinned in the aquatic set')
})

test('fleePlan: a land threat never pulls the bot onto a shore behind it', () => {
  const shore = { dx: 3, dz: -2, dist: 4, step: 1 }
  assert.deepEqual(fleePlan({ threatName: 'zombie', feetWet: true, shore }), { kind: 'away' }, 'the zombie owns the land - the away-vector stays')
  assert.deepEqual(fleePlan({ threatName: 'skeleton', feetWet: true, shore }), { kind: 'away' })
  assert.deepEqual(fleePlan({ threatName: 'creeper', feetWet: false, shore }), { kind: 'away' }, 'dry feet never shore-flee')
  assert.deepEqual(fleePlan({ threatName: null, feetWet: true, shore }), { kind: 'away' }, 'junk threat names keep the historical flee')
  assert.deepEqual(fleePlan({ threatName: 'drowned', feetWet: true, shore: null }), { kind: 'away' }, 'no known shore = no shore hop (deep lake center)')
})

test('fleePlan: a submerged head forces the shore for ANY threat, step preserved', () => {
  const shore1 = { dx: -2, dz: 5, dist: 5, step: 1 }
  assert.deepEqual(fleePlan({ threatName: 'zombie', headWet: true, feetWet: true, shore: shore1 }), { kind: 'shore', dx: -2, dz: 5, step: 1 }, 'drowning beats outflanking - seconds from death')
  const shore0 = { dx: 1, dz: 1, dist: 1, step: 0 }
  assert.deepEqual(fleePlan({ threatName: 'spider', headWet: true, shore: shore0 }).step, 0, 'step 0 -> walk out, no jump needed')
  assert.equal(fleePlan({ threatName: 'zombie', headWet: true, feetWet: false, shore: null }).kind, 'away', 'head wet but no shore known: the rescue sentry owns it')
})
