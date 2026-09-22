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
  AQUATIC_HOSTILES, WATER_HAZARD_TTL_MS, WATER_HAZARD_RADIUS, WATER_HAZARD_Y_BAND, WATER_HAZARD_CAP,
  OXYGEN_RESET_SENTINEL, oxygenInDomain,
  isWaterName, waterVerdict, airBarTrust, shoreDirection, rescueDone, fleePlan,
  recordWaterHazard, nearWaterHazard, verifyShoreCell, HazardLedger,
  SURFACE_SAFE_DRY_MS, TRANSIT_RESCAN_TICKS, TRANSIT_MAP_RANGE,
  surfaceSafeRelease, transitBearing,
  openWaterRelease, surfaceStability, physicsFrozen, bobbingRelease, transitStalled,
  STANDING_PROBE_BUDGET, STABILITY_WINDOW, STABILITY_MIN_DRY_SHARE, STABILITY_TAIL_DRY,
  RESCUE_READS_CAP, PASS_LOG_INTERVAL_MS, PASS_LOG_MAX_PER_RESCUE,
  FROZEN_WINDOW, FROZEN_EPS, REPEAT_PAGE_WINDOW_MS, REPEAT_PAGE_ALLOW,
  BOB_WINDOW, BOB_MIN_DRY, BOB_RELEASE_O2, TRANSIT_STALL_PASSES, TRANSIT_STALL_MARGIN
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

// ---- v0.59.0: the WATER MEMORY ----
// Fleet 35657683920 (the v0.58.1 tip): 7 of 10 deaths were drownings in ONE
// lake region, and the rescue loop itself reported the disease - F16 completed
// FOUR rescues (2.2-3.4s each) and died in the fifth cycle because the work
// loop re-entered the same flooded column with zero memory. The cure: every
// rescue records its cell; the dig planner refuses live hazards; the flee's
// shore hop re-verifies the cell against the live world (F1's '(0,2 step 1)'
// hop died in place).
test('water memory constants stay sane', () => {
  assert.ok(WATER_HAZARD_TTL_MS >= 60000, 'the window covers the measured 10s re-dive loop with margin')
  assert.ok(WATER_HAZARD_TTL_MS <= 300000, 'and stays bounded - the fleet mines onward')
  assert.ok(WATER_HAZARD_RADIUS >= 3 && WATER_HAZARD_RADIUS <= 8, 'wide enough for the column + banks, narrow enough to keep diggable ground')
  assert.ok(WATER_HAZARD_Y_BAND >= 4 && WATER_HAZARD_Y_BAND <= 16, 'the same column up or down is the same water')
  assert.ok(WATER_HAZARD_CAP >= 8 && WATER_HAZARD_CAP <= 64, 'bounded amnesia like failedTrips')
})

test('recordWaterHazard: appends floored, prunes expired, caps newest-first', () => {
  const t0 = 1000000
  const a = recordWaterHazard([], { x: 1.7, y: 45.2, z: -8.9 }, t0)
  assert.deepEqual(a, [{ x: 1, y: 45, z: -9, at: t0 }], 'the rescue cell is floored to an integer cell')
  // expiry: a record past the TTL is dropped, a fresh one is kept
  const two = [{ x: 0, y: 0, z: 0, at: t0 - WATER_HAZARD_TTL_MS - 1 }, { x: 5, y: 0, z: 5, at: t0 - 1000 }]
  const pruned = recordWaterHazard(two, null, t0) // junk pos: prune only
  assert.equal(pruned.length, 1, 'the expired record dies')
  assert.equal(pruned[0].x, 5, 'the live record survives')
  // cap: the oldest dies first, the newest (the cell we stand in) always survives
  const many = []
  for (let i = 0; i < WATER_HAZARD_CAP + 5; i++) many.push({ x: i, y: 0, z: 0, at: t0 - (WATER_HAZARD_CAP + 5 - i) * 1000 })
  const capped = recordWaterHazard(many, { x: 99, y: 1, z: 99 }, t0)
  assert.equal(capped.length, WATER_HAZARD_CAP, 'the cap holds')
  assert.equal(capped[capped.length - 1].x, 99, 'the newest record is the rescue we just survived')
  assert.equal(capped[0].x, many.length - WATER_HAZARD_CAP + 1, 'the oldest fell off')
  // purity: the input list is not mutated
  const input = [{ x: 1, y: 1, z: 1, at: t0 }]
  recordWaterHazard(input, { x: 2, y: 2, z: 2 }, t0)
  assert.equal(input.length, 1, 'the caller\'s list is untouched (pure)')
})

test('nearWaterHazard: the measured re-dive shape is caught, clean ground is not', () => {
  const now = 5000000
  const hazards = [{ x: -140, y: 45, z: 400, at: now - 1000 }]
  // the F16 shape: back at the rescue column (same cell, any dy inside the band)
  assert.ok(nearWaterHazard(hazards, { x: -140, y: 45, z: 400 }, now), 'same cell is a hazard')
  assert.ok(nearWaterHazard(hazards, { x: -138.5, y: 52, z: 401 }, now), '2.5b XZ + 7 up (inside the band) is a hazard')
  assert.equal(nearWaterHazard(hazards, { x: -140, y: 45 + WATER_HAZARD_Y_BAND + 1, z: 400 }, now), null, 'outside the y-band: a DIFFERENT level is diggable')
  assert.equal(nearWaterHazard(hazards, { x: -140 + WATER_HAZARD_RADIUS + 1, y: 45, z: 400 }, now), null, 'outside the XZ radius: dry ground past the banks')
  assert.equal(nearWaterHazard(hazards, { x: -140, y: 45, z: 400 }, now + WATER_HAZARD_TTL_MS + 1), null, 'expired memory never fires')
  assert.equal(nearWaterHazard(hazards, null, now), null, 'junk position is clean')
  // nearest-of-multiple wins
  const multi = [{ x: -104, y: 45, z: 400, at: now }, { x: -100, y: 45, z: 400, at: now }]
  const hit = nearWaterHazard(multi, { x: -100.5, y: 45, z: 400 }, now)
  assert.equal(hit.hazard.x, -100, 'the nearest live hazard is returned')
})

test('verifyShoreCell: F1\'s imagined shore dies here, a real bank passes', () => {
  const grid = {}
  const put = (x, y, z, name) => { grid[`${x},${y},${z}`] = name }
  // a real step-0 bank: land under the standing cell, two air above
  put(10, 63, 10, 'sand'); put(10, 64, 10, 'air'); put(10, 65, 10, 'air')
  assert.equal(verifyShoreCell((x, y, z) => grid[`${x},${y},${z}`] ?? null, { x: 10, y: 64, z: 10 }), true, 'ground at y-1, air at y and y+1 = a walk-out bank')
  // a real step-1 bank: ground AT y-1 (the standing cell is one above the swim level)
  put(12, 64, 10, 'grass_block'); put(12, 65, 10, 'air'); put(12, 66, 10, 'air')
  assert.equal(verifyShoreCell((x, y, z) => grid[`${x},${y},${z}`] ?? null, { x: 12, y: 65, z: 10 }), true, 'the jump-out bank verifies too')
  // F1's killer shapes:
  put(14, 63, 10, 'water'); put(14, 64, 10, 'air'); put(14, 65, 10, 'air')
  assert.equal(verifyShoreCell((x, y, z) => grid[`${x},${y},${z}`] ?? null, { x: 14, y: 64, z: 10 }), false, 'water ground is not a shore (the scan read the lake surface)')
  put(16, 63, 10, 'sand'); put(16, 64, 10, 'oak_leaves'); put(16, 65, 10, 'air')
  assert.equal(verifyShoreCell((x, y, z) => grid[`${x},${y},${z}`] ?? null, { x: 16, y: 64, z: 10 }), false, 'a canopy over the bank is not climbable while swimming')
  put(18, 63, 10, 'sand'); put(18, 64, 10, 'stone'); put(18, 65, 10, 'air')
  assert.equal(verifyShoreCell((x, y, z) => grid[`${x},${y},${z}`] ?? null, { x: 18, y: 64, z: 10 }), false, 'a wall at eye level is not a shore')
  // unknown (unloaded) cells never verify - the flee falls through to the away-vector
  assert.equal(verifyShoreCell(() => null, { x: 20, y: 64, z: 10 }), false, 'unreadable world is not a verified shore')
  assert.equal(verifyShoreCell(null, { x: 10, y: 64, z: 10 }), false, 'junk sample is false')
  assert.equal(verifyShoreCell((x, y, z) => grid[`${x},${y},${z}`] ?? null, null), false, 'junk cell is false')
})

// -------------------------------------------------------------- HazardLedger (v0.62.0)

test('HazardLedger: shared-by-reference record/near/size with an injected clock', () => {
  const clock = { t: 50_000 }
  const ledger = new HazardLedger({ now: () => clock.t })
  assert.equal(ledger.size, 0, 'a fresh ledger holds nothing')
  assert.equal(ledger.near({ x: 10, y: 64, z: 10 }), null, 'an empty ledger never hits')
  assert.equal(ledger.record({ x: 10.7, y: 64.2, z: -3.9 }), 1, 'record returns the live count')
  assert.equal(ledger.size, 1, 'the entry is in')
  const hit = ledger.near({ x: 10, y: 64, z: -4 })
  assert.ok(hit, 'a live hazard hits near the recorded cell')
  assert.equal(hit.hazard.x, 10, 'the cell was floored on the way in')
  // the FLEET property: a second reader (another bot object) sees the same entry
  // through the same instance - the per-bot array of v0.60.0 could never do this
  const sameLedger = ledger
  assert.ok(sameLedger.near({ x: 11, y: 63, z: -4 }), 'a fleet-mate reading the shared ledger hits too')
  // expiry: past the TTL the same query is clean
  clock.t += WATER_HAZARD_TTL_MS + 1
  assert.equal(ledger.near({ x: 10, y: 64, z: -4 }), null, 'an expired hazard never fires')
})

test('HazardLedger: junk positions are ignored, the cap keeps the newest', () => {
  const clock = { t: 1_000 }
  const ledger = new HazardLedger({ now: () => clock.t, cap: 3 })
  assert.equal(ledger.record(null), 0, 'junk position records nothing')
  assert.equal(ledger.record({ x: Number.NaN, y: 1, z: 2 }), 0, 'NaN coordinates record nothing')
  assert.equal(ledger.size, 0)
  for (let i = 0; i < 5; i++) ledger.record({ x: i * 10, y: 64, z: 0 })
  assert.equal(ledger.size, 3, 'the cap bounds the ledger')
  assert.equal(ledger.hazards[0].x, 20, 'the OLDEST entries were dropped first (newest kept)')
  assert.ok(ledger.near({ x: 40, y: 64, z: 0 }), 'the newest entries survive')
})

test('HazardLedger: defaults ride the module constants', () => {
  const ledger = new HazardLedger()
  assert.equal(ledger.ttlMs, WATER_HAZARD_TTL_MS)
  assert.equal(ledger.radius, WATER_HAZARD_RADIUS)
  assert.equal(ledger.yBand, WATER_HAZARD_Y_BAND)
  assert.equal(ledger.cap, WATER_HAZARD_CAP)
  assert.equal(typeof ledger.now(), 'number', 'the default clock is Date.now')
})

// ---------------------------------------------------------------------------
// (v0.64.0) THE OXYGEN RESET SENTINEL. run60 (fleet 35668657935) counted 395
// 'oxygen -1 on dry land' events fleet-wide, every burst arriving within seconds
// of 'rescue complete' / 'died - respawning' (F2 x250+, F16 x101+). The metadata
// reset value is OUTSIDE the 0..20 sensor domain, yet the old read path treated
// it as a FINITE critical reading: waterVerdict saw o2=-1 <= 4 over post-rescue
// wet/unknown reads and paged the rescue again - the re-dive chain mechanic.
// These pins freeze the domain gate: a negative bar is never a real reading.
test('oxygenInDomain: the reset sentinel and every junk value is out of domain', () => {
  assert.equal(OXYGEN_RESET_SENTINEL, -1, 'the measured 26.2 reset value')
  assert.equal(oxygenInDomain(OXYGEN_RESET_SENTINEL), false, '-1 is the sentinel: out')
  assert.equal(oxygenInDomain(-0.001), false, 'any negative is out')
  assert.equal(oxygenInDomain(Number.NaN), false)
  assert.equal(oxygenInDomain(undefined), false)
  assert.equal(oxygenInDomain(null), false)
  assert.equal(oxygenInDomain(Number.POSITIVE_INFINITY), false)
  assert.equal(oxygenInDomain(Number.NEGATIVE_INFINITY), false)
  assert.equal(oxygenInDomain(0), true, 'a real empty bar IS in domain - real drowning')
  assert.equal(oxygenInDomain(4), true, OXYGEN_CRITICAL_LEVEL + ' (critical line) in domain')
  assert.equal(oxygenInDomain(20), true, 'full bar in domain')
  assert.equal(oxygenInDomain(10.5), true, 'fractional real reads are in domain')
})

test('waterVerdict: the -1 reset sentinel never pages a rescue, even over wet reads', () => {
  // the exact run60 F2/F16 shape: rescue complete, bot in the shallows, the
  // metadata resets to -1, feet still wet / head unknown - the old path read
  // this as a critical bar over non-dry contact and re-fired the rescue.
  assert.equal(waterVerdict({ feet: 'water', head: 'air', oxygen: OXYGEN_RESET_SENTINEL }), 'wet', 'sentinel over wet feet: monitor, never rescue')
  assert.equal(waterVerdict({ feet: 'water', head: null, oxygen: OXYGEN_RESET_SENTINEL }), 'wet', 'sentinel over unknown head: still not a page')
  assert.equal(waterVerdict({ feet: null, head: null, oxygen: OXYGEN_RESET_SENTINEL }), 'none', 'sentinel over unknown everything: dry policy')
  assert.equal(waterVerdict({ feet: 'sand', head: 'air', oxygen: OXYGEN_RESET_SENTINEL }), 'none', 'sentinel on dry land: nothing')
  assert.equal(waterVerdict({ feet: 'water', head: 'water', oxygen: OXYGEN_RESET_SENTINEL }), 'wet', 'sentinel with head submerged but ZERO headWetMs: the bar is meaningless, the clock has not run yet')
})

test('waterVerdict: the headWetMs clock pages through the sentinel without any bar', () => {
  // the safety net the sentinel fix leans on: a genuinely submerged bot pages
  // on the CLOCK, no bar needed - the sentinel cannot mask a real drowning.
  assert.equal(
    waterVerdict({ feet: 'water', head: 'water', oxygen: OXYGEN_RESET_SENTINEL, headWetMs: HEAD_SUBMERGED_RESCUE_MS }),
    'drowning', 'submerged past HEAD_SUBMERGED_RESCUE_MS with a reset bar: rescue NOW'
  )
  assert.equal(
    waterVerdict({ feet: null, head: 'water', oxygen: OXYGEN_RESET_SENTINEL, headWetMs: HEAD_SUBMERGED_RESCUE_MS + 1 }),
    'drowning', 'even unknown feet cannot block the clock page'
  )
  assert.equal(
    waterVerdict({ feet: 'water', head: 'water', oxygen: OXYGEN_RESET_SENTINEL, headWetMs: HEAD_SUBMERGED_RESCUE_MS - 1 }),
    'wet', 'one tick under the clock line: still only wet'
  )
})

test('waterVerdict: in-domain critical bars keep the v0.16.0 behavior unchanged', () => {
  // the sentinel gate must not desensitize REAL readings
  assert.equal(waterVerdict({ feet: 'water', head: null, oxygen: 2 }), 'drowning', 'real critical bar over unknown head: act')
  assert.equal(waterVerdict({ feet: 'stone', head: null, oxygen: 0 }), 'drowning', 'real 0 over definite-dry is the counted glitch class - still a verdict (telemetry gate lives in the sentry)')
  assert.equal(waterVerdict({ feet: 'water', head: 'water', oxygen: OXYGEN_CRITICAL_LEVEL }), 'drowning', 'the line itself fires for real bars')
})

// ---- v0.80.0: THE OPEN-WATER TRANSIT (run74: 79 starts, 56 timeouts, F7 x23 / F10 x18) ----

test('surfaceSafeRelease: the run74 treadmill shape - healthy air, head dry, NO shore in scan', () => {
  assert.equal(SURFACE_SAFE_DRY_MS, 1500, 'pinned: 1.5s of continuous dry air')
  assert.equal(surfaceSafeRelease({ headDryMs: 1500, oxygen: 15, shore: null }), true,
    'the F7/F10 state (oxygen 12-20 at every start, head at surface, lake wider than 12) = release')
  assert.equal(surfaceSafeRelease({ headDryMs: 2000, oxygen: OXYGEN_RESCUE_LEVEL, shore: null }), true,
    'exactly at the rescue line with air recovered = release')
})

test('surfaceSafeRelease: a drowning bot NEVER releases', () => {
  assert.equal(surfaceSafeRelease({ headDryMs: 9999, oxygen: 4, shore: null }), false,
    'below the rescue line: the rescue keeps the bot')
  assert.equal(surfaceSafeRelease({ headDryMs: 9999, oxygen: 9, shore: null }), false,
    'just under the line: keep swimming')
  assert.equal(surfaceSafeRelease({ headDryMs: 9999, oxygen: 15, shore: { dx: 2, dz: 0, step: 0 } }), false,
    'a shore plan exists: keep swimming to it')
  assert.equal(surfaceSafeRelease({ headDryMs: 100, oxygen: 20, shore: null }), false,
    'head not dry long enough: the bob window must pass first')
})

test('surfaceSafeRelease: junk-safe - the clock and the bar cannot lie the release open', () => {
  assert.equal(surfaceSafeRelease({ headDryMs: NaN, oxygen: 20, shore: null }), false)
  assert.equal(surfaceSafeRelease({ headDryMs: 'junk', oxygen: 20, shore: null }), false)
  assert.equal(surfaceSafeRelease({ headDryMs: -1, oxygen: 20, shore: null }), false)
  assert.equal(surfaceSafeRelease({ headDryMs: 9999, oxygen: OXYGEN_RESET_SENTINEL, shore: null }), true,
    'the -1 reset sentinel reads FULL (the run60 lesson) - the clock carries the decision')
  assert.equal(surfaceSafeRelease({ headDryMs: 9999, oxygen: NaN, shore: null }), true,
    'a missing bar reads full: the headWetMs clock still pages a real re-submersion')
  assert.equal(surfaceSafeRelease({}), false, 'no dry clock = no release')
})

test('transitBearing: one unit bearing toward known land, junk stays null', () => {
  const t = transitBearing({ hx: 0, hz: 0, lx: 30, lz: 40 })
  assert.ok(t && Math.abs(t.dx - 0.6) < 1e-9 && Math.abs(t.dz - 0.8) < 1e-9 && Math.abs(t.dist - 50) < 1e-9,
    '3-4-5 lake: the unit bearing and the distance come out exact')
  assert.equal(transitBearing({ hx: 10, hz: 10, lx: 10, lz: 11 }), null,
    'closer than 2 blocks: the shore scan owns the last meters')
  assert.equal(transitBearing({ hx: 10, hz: 10, lx: 10, lz: 12 })?.dist, 2,
    'exactly 2 blocks: a real (tiny) transit step is still returned')
  assert.equal(transitBearing({ hx: NaN, hz: 0, lx: 30, lz: 40 }), null, 'junk bot x')
  assert.equal(transitBearing({ hx: 0, hz: 0, lx: undefined, lz: 40 }), null, 'junk land x')
  assert.equal(transitBearing({}), null, 'empty params')
})

test('REGRESSION PIN: the run74 wiring shape - the release reopens the walk gate the budget died behind', () => {
  // F11: bank trip budget 14s, six 25s rescue locks before it - the yard walk
  // never got a turn. The release must fire for the exact state F7/F10 tread in:
  // surface (head dry), healthy air, no shore, no map land. The SAME state with
  // a shore hit keeps the proven shore-swim; the same state drowning keeps the rescue.
  const treading = { headDryMs: 2000, oxygen: 14, shore: null }
  assert.equal(surfaceSafeRelease(treading), true, 'the treadmill state releases')
  assert.equal(surfaceSafeRelease({ ...treading, oxygen: 3 }), false, 'low air never releases')
  assert.equal(surfaceSafeRelease({ ...treading, shore: { dx: -1, dz: 0, step: 1 } }), false, 'a beach keeps the swim')
  // the transit bearing the map feeds: a log 40 blocks NE
  const b = transitBearing({ hx: -120, hz: 400, lx: -92, lz: undefined })
  assert.equal(b, null, 'junk in the land read -> null (the release policy decides, no guess)')
  const b2 = transitBearing({ hx: -120, hz: 400, lx: -92, lz: 428 })
  assert.ok(b2 && Math.abs(Math.hypot(b2.dx, b2.dz) - 1) < 1e-9, 'a real land hit gives a UNIT bearing')
  assert.equal(TRANSIT_RESCAN_TICKS, 8, 'pinned: the transit re-scans every 8 ticks')
  assert.equal(TRANSIT_MAP_RANGE, 128, 'pinned: the map lookup range')
})

// ---- v0.81.0: THE SURFACE-STABILITY RELEASE + THE BLACKBOX CONSTANTS ----
// Run75 (35740810293) measured the v0.80.0 release UNREACHABLE: 23 timeouts,
// zero releases - the loop's own standing probe sank the bot and reset the
// continuous dry clock every pass. The windowed verdict is the cure.

test('surfaceStability: the bobbing window releases where the continuous clock starves', () => {
  // THE run75 treadmill shape: the probe-sink cycle wets the head roughly
  // every fourth pass while the bot bobs at the surface. 6 dry of 8 with a
  // dry tail is a surface bot with a recovering air bar - release it.
  const treadmill = [
    { wet: true, atMs: 0 }, { wet: false, atMs: 400 }, { wet: false, atMs: 800 },
    { wet: false, atMs: 1200 }, { wet: true, atMs: 1600 }, { wet: false, atMs: 2000 },
    { wet: false, atMs: 2400 }, { wet: false, atMs: 2800 }
  ]
  assert.equal(surfaceStability({ reads: treadmill }), true,
    '6/8 dry with the tail dry - the bobbing surface bot is release-eligible')
  assert.equal(surfaceStability({ reads: treadmill.slice(0, STABILITY_WINDOW - 1) }), false,
    'a short window is unproven, never a guess')
  // dragged under: the share HOLDS (6/8) but the TAIL is wet - mid-drag, locked
  const dragged = [...treadmill.slice(0, 7), { wet: true, atMs: 2800 }]
  assert.equal(surfaceStability({ reads: dragged }), false, 'a wet tail never releases')
  // share starved: 5/8 dry is below the 0.75 line even with a dry tail
  const starved = [{ wet: true, atMs: 0 }, { wet: true, atMs: 400 }, { wet: false, atMs: 800 },
    { wet: false, atMs: 1200 }, { wet: true, atMs: 1600 }, { wet: false, atMs: 2000 },
    { wet: false, atMs: 2400 }, { wet: false, atMs: 2800 }]
  assert.equal(surfaceStability({ reads: starved }), false, 'mostly-wet water stays locked')
  assert.equal(surfaceStability({ reads: treadmill.map(r => ({ wet: true, atMs: r.atMs })) }), false,
    'all-wet is the deep cell, never a release')
})

test('surfaceStability: junk reads are LOST readings, not dry ones (the three-strike lesson)', () => {
  const good = { wet: false, atMs: 0 }
  assert.equal(surfaceStability({ reads: null }), false, 'no reads -> no release')
  assert.equal(surfaceStability({ reads: [] }), false)
  assert.equal(surfaceStability({ reads: Array(8).fill(good).concat([null]) }), false,
    'a null record poisons the window (Number(null)=0 earned this gate three times)')
  assert.equal(surfaceStability({ reads: [...Array(7).fill(good), { wet: undefined, atMs: 1 }] }), false,
    'a non-boolean wet flag is junk - unproven, never counted dry')
  assert.equal(surfaceStability({ reads: [...Array(7).fill(good), 'wet'] }), false,
    'a string record is junk')
  assert.equal(surfaceStability({ reads: [...Array(7).fill(good), { atMs: 1 }] }), false,
    'a missing wet flag is junk')
})

test('openWaterRelease: the continuous clock OR the stability window, both behind the drowning gate', () => {
  const bobbingWindow = [
    { wet: true, atMs: 0 }, { wet: false, atMs: 400 }, { wet: false, atMs: 800 },
    { wet: false, atMs: 1200 }, { wet: true, atMs: 1600 }, { wet: false, atMs: 2000 },
    { wet: false, atMs: 2400 }, { wet: false, atMs: 2800 }
  ]
  // the v0.80.0 path alone (run74's shape: a real continuous stretch exists)
  assert.equal(openWaterRelease({ headDryMs: 2000, oxygen: 16, shore: null }), true,
    'the continuous clock still releases on its own')
  // the v0.81.0 path alone (run75's shape: the clock keeps resetting, the window decides)
  assert.equal(openWaterRelease({ headDryMs: 0, oxygen: 16, shore: null, reads: bobbingWindow }), true,
    'the stability window releases where the continuous clock cannot accumulate')
  // both starved: no release
  assert.equal(openWaterRelease({ headDryMs: 0, oxygen: 16, shore: null, reads: null }), false,
    'neither path proven -> the rescue keeps the bot')
  // the gates hold on BOTH paths
  assert.equal(openWaterRelease({ headDryMs: 99999, oxygen: 5, shore: null }), false,
    'a drowning bot never releases via the clock')
  assert.equal(openWaterRelease({ headDryMs: 0, oxygen: 5, shore: null, reads: bobbingWindow }), false,
    'a drowning bot never releases via the window either')
  assert.equal(openWaterRelease({ headDryMs: 99999, oxygen: 16, shore: { dx: 1, dz: 0 } }), false,
    'a shore plan owns the bot (the swim is the exit)')
  // junk air reads as full - the clocks carry the decision (the v0.16.0 doctrine)
  assert.equal(openWaterRelease({ headDryMs: 2000, oxygen: 'junk', shore: null }), true,
    'junk oxygen -> full -> the clock decides')
  assert.equal(openWaterRelease({ headDryMs: 0, oxygen: undefined, shore: null, reads: bobbingWindow }), true,
    'junk oxygen -> full -> the window decides')
})

test('REGRESSION PIN: the run75 blackbox constants - the wiring cannot silently rot', () => {
  assert.equal(STANDING_PROBE_BUDGET, 3, 'three standing probes, then hold the surface')
  assert.equal(STABILITY_WINDOW, 8, 'the window reads 8 passes')
  assert.equal(STABILITY_MIN_DRY_SHARE, 0.75, 'mostly dry means 6 of 8')
  assert.equal(STABILITY_TAIL_DRY, 3, 'the tail must be dry now')
  assert.equal(RESCUE_READS_CAP, 24, 'the record buffer caps at 24')
  assert.equal(PASS_LOG_INTERVAL_MS, 2000, 'the pass line prints at most every 2s')
  assert.equal(PASS_LOG_MAX_PER_RESCUE, 10, 'at most 10 pass lines per rescue (19 bots share the log)')
})

test('physicsFrozen: run76 F17\'s flatline condemns the physics (the frozen client)', () => {
  // the measured shape: [-100,42.2,377] held for 90+ passes with jump held -
  // y drifts 42.0 -> 42.2 (a stale read jitter) while nothing else moves
  const flat = []
  for (let i = 0; i < FROZEN_WINDOW; i++) flat.push({ x: -100 + (i % 2) * 0.1, y: 42.0 + (i % 3) * 0.1, z: 377 })
  assert.equal(physicsFrozen({ points: flat }), true,
    'a flat position across the window = the physics are not ticking')
  // a REAL bob (run76 F9): y 48.2-50.2, the shaft walls wiggle x/z
  const bob = []
  for (let i = 0; i < FROZEN_WINDOW; i++) bob.push({ x: -114.5 + (i % 2) * 0.6, y: 48.2 + (i % 3) * 1.0, z: 392.5 + (i % 2) * 0.8 })
  assert.equal(physicsFrozen({ points: bob }), false,
    'a bobbing bot moves between passes - the rescue owns living water')
  // a walking bot covers ground
  const walker = Array.from({ length: FROZEN_WINDOW }, (_, i) => ({ x: i * 2.0, y: 62, z: 0 }))
  assert.equal(physicsFrozen({ points: walker }), false, 'a walking bot is never frozen')
  // drift exactly at the eps boundary: the flatline holds, one hair more does not
  const edge = Array.from({ length: FROZEN_WINDOW }, (_, i) => ({ x: 0, y: 42 + (i / (FROZEN_WINDOW - 1)) * FROZEN_EPS, z: 0 }))
  assert.equal(physicsFrozen({ points: edge }), true, 'drift <= eps stays within the flatline')
  const over = Array.from({ length: FROZEN_WINDOW }, (_, i) => ({ x: 0, y: 42 + (i / (FROZEN_WINDOW - 1)) * (FROZEN_EPS * 2), z: 0 }))
  assert.equal(physicsFrozen({ points: over }), false, 'drift beyond eps is alive')
  // junk never condemns: short window, lost readings, NaN, missing coords
  assert.equal(physicsFrozen({ points: flat.slice(0, FROZEN_WINDOW - 1) }), false, 'a short window cannot condemn')
  assert.equal(physicsFrozen({ points: null }), false)
  assert.equal(physicsFrozen({ points: [] }), false)
  assert.equal(physicsFrozen({ points: [...flat.slice(0, 9), null] }), false, 'a null reading is a LOST reading, not a frozen one')
  assert.equal(physicsFrozen({ points: [...flat.slice(0, 9), { x: NaN, y: 42, z: 0 }] }), false, 'NaN is junk')
  assert.equal(physicsFrozen({ points: [...flat.slice(0, 9), { x: -100, y: 42 }] }), false, 'a missing coordinate must not Number(null) into the origin (the fifth strike)')
  assert.equal(physicsFrozen({ points: [...flat.slice(0, 9), 'junk'] }), false)
})

test('bobbingRelease: the oxygen-gated tier releases where the window tail starves (run76 F9)', () => {
  // F9\'s measured pattern: dry/wet oscillation (tail dry/wet/wet) with o2 12-20 -
  // the v0.81.0 window (last-3-dry + 75% share) can NEVER fill for a bobber
  const bobTail = [
    { wet: true, atMs: 1 }, { wet: true, atMs: 2 }, { wet: false, atMs: 3 },
    { wet: true, atMs: 4 }, { wet: false, atMs: 5 }, { wet: false, atMs: 6 },
    { wet: true, atMs: 7 }, { wet: true, atMs: 8 }, { wet: true, atMs: 9 }
  ]
  assert.equal(surfaceStability({ reads: bobTail }), false, 'the pre-condition: the window starves for a bobber')
  assert.equal(bobbingRelease({ reads: bobTail, oxygen: 20 }), true,
    'the head demonstrably reaches air + healthy bar = surface-safe')
  assert.equal(bobbingRelease({ reads: bobTail, oxygen: 12 }), false,
    'below the healthy floor the bot keeps the full rescue')
  // one dry read is not proven (a single splash-dry moment)
  assert.equal(bobbingRelease({ reads: [{ wet: true }, { wet: false }], oxygen: 20 }), false,
    'BOB_MIN_DRY=2: one dry read is a splash, not a breathing pattern')
  // the window: dry reads older than the window do not count
  const stale = [{ wet: false, atMs: 1 }]
  for (let i = 0; i < BOB_WINDOW; i++) stale.push({ wet: true, atMs: i + 2 })
  assert.equal(bobbingRelease({ reads: stale, oxygen: 20 }), false,
    'the stale dry read outside the window cannot release')
  // junk discipline
  assert.equal(bobbingRelease({ reads: null, oxygen: 20 }), false)
  assert.equal(bobbingRelease({ reads: [], oxygen: 20 }), false)
  assert.equal(bobbingRelease({ reads: [{ wet: 'x' }, { wet: null }], oxygen: 20 }), false,
    'junk wet flags are LOST readings, not dry ones')
  assert.equal(bobbingRelease({ reads: [{ wet: false }, { wet: false }], oxygen: NaN }), true,
    'junk oxygen reads as full (the repo convention - the gates decide)')
  assert.equal(bobbingRelease({ reads: [{ wet: false }, { wet: false }], oxygen: -1 }), true,
    'the -1 reset sentinel maps to full (the repo convention - same as NaN)')
})

test('transitStalled: the progress latch condemns the walls-own-the-swim plan (run76 F9 d=7 forever)', () => {
  // the measured shape: transit steered at an oak_log d=7-8 for 60+ passes, d never shrank
  assert.equal(transitStalled({ d0: 8, d: 7, passes: TRANSIT_STALL_PASSES }), true,
    '15 passes without closing the margin = the walls own this swim')
  assert.equal(transitStalled({ d0: 8, d: 4, passes: TRANSIT_STALL_PASSES }), false,
    'closing 4 blocks is progress - the transit keeps steering')
  assert.equal(transitStalled({ d0: 8, d: 7, passes: TRANSIT_STALL_PASSES - 1 }), false,
    'patience first: a short stall gets the full budget')
  // the margin: progress must close >= TRANSIT_STALL_MARGIN
  assert.equal(transitStalled({ d0: 8, d: 8 - TRANSIT_STALL_MARGIN + 0.5, passes: 99 }), true,
    '0.5 blocks of progress over 99 passes is still a wall')
  assert.equal(transitStalled({ d0: 8, d: 8 - TRANSIT_STALL_MARGIN, passes: 99 }), false,
    'closing exactly the margin counts as progress')
  // the Number(null) hole (fifth strike): a missing distance never condemns
  assert.equal(transitStalled({ d0: null, d: 7, passes: 99 }), false)
  assert.equal(transitStalled({ d0: 8, d: null, passes: 99 }), false)
  assert.equal(transitStalled({ d0: undefined, d: undefined, passes: 99 }), false, 'undefined defaults must not Number(null) into 0')
  assert.equal(transitStalled({ d0: 'junk', d: 7, passes: 99 }), false)
  assert.equal(transitStalled({ d0: 8, d: NaN, passes: 99 }), false)
  assert.equal(transitStalled({ d0: 8, d: 7, passes: 'junk' }), false)
})

test('openWaterRelease: the bobbing tier fires through the combined gate (run76 F9 wiring)', () => {
  const bobWindow = []
  for (let i = 0; i < 9; i++) bobWindow.push({ wet: i % 3 === 2, atMs: i })
  // the v0.82.0 path alone (run76\'s shape: the clock resets, the window tail starves)
  assert.equal(openWaterRelease({ headDryMs: 0, oxygen: 20, shore: null, reads: bobWindow }), true,
    'the bobbing tier releases where both older tiers starve')
  // the gates hold on ALL three paths
  assert.equal(openWaterRelease({ headDryMs: 0, oxygen: 9, shore: null, reads: bobWindow }), false,
    'a drowning bot never releases via the bobbing tier')
  assert.equal(openWaterRelease({ headDryMs: 0, oxygen: 20, shore: { dx: 1, dz: 0 }, reads: bobWindow }), false,
    'a shore plan owns the bot')
  assert.equal(openWaterRelease({ headDryMs: 0, oxygen: 20, shore: null, reads: [{ wet: true }] }), false,
    'no dry evidence -> no release')
})

test('REGRESSION PIN: the run76 stand-down constants - the wiring cannot silently rot', () => {
  assert.equal(FROZEN_WINDOW, 10, 'ten flat passes condemn the physics')
  assert.equal(FROZEN_EPS, 0.5, 'half a block of drift is the flatline floor')
  assert.equal(REPEAT_PAGE_WINDOW_MS, 90000, 'a repeat page lives 90s after the still-wet end')
  assert.equal(REPEAT_PAGE_ALLOW, 1, 'one full retry, then the stand-down owns the page')
  assert.equal(BOB_WINDOW, 10, 'the bobbing window reads 10 records')
  assert.equal(BOB_MIN_DRY, 2, 'two dry reads prove the head reaches air')
  assert.equal(BOB_RELEASE_O2, 15, 'the healthy band run76 measured as 12-20')
  assert.equal(TRANSIT_STALL_PASSES, 15, 'the transit gets 15 passes of patience')
  assert.equal(TRANSIT_STALL_MARGIN, 2, 'progress means closing two blocks')
})
