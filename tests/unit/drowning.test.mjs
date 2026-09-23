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
  historyAdmissible, O2_HISTORY_CAP,
  isWaterName, waterVerdict, airBarTrust, shoreDirection, rescueDone, fleePlan,
  airBarFalling, AIR_FALL_MIN_DROP, AIR_FALL_MIN_READS,
  recordWaterHazard, nearWaterHazard, verifyShoreCell, HazardLedger,
  SURFACE_SAFE_DRY_MS, TRANSIT_RESCAN_TICKS, TRANSIT_MAP_RANGE,
  surfaceSafeRelease, transitBearing,
  openWaterRelease, surfaceStability, physicsFrozen, bobbingRelease, transitStalled,
  STANDING_PROBE_BUDGET, STABILITY_WINDOW, STABILITY_MIN_DRY_SHARE, STABILITY_TAIL_DRY,
  RESCUE_READS_CAP, PASS_LOG_INTERVAL_MS, PASS_LOG_MAX_PER_RESCUE,
  FROZEN_WINDOW, FROZEN_EPS, REPEAT_PAGE_WINDOW_MS, REPEAT_PAGE_ALLOW,
  BOB_WINDOW, BOB_MIN_DRY, BOB_RELEASE_O2, TRANSIT_STALL_PASSES, TRANSIT_STALL_MARGIN,
  HAZARD_ZONE_MERGE_DIST, HAZARD_ZONE_MIN_COUNT, HAZARD_ZONE_MARGIN, HAZARD_ZONE_Y_BAND,
  hazardZones, frozenRelogDecision, FROZEN_RELOG_AFTER,
  rotateBearingXZ, fleeTargetBlocked, vettedFleeTargetAbs, fleePathBlocked,
  AIR_GLITCH_STREAK_CAP, dryLandProof, DRY_PROOF_MAX_MS, DRY_PROOF_BACKOFF_MS,
  glitchStreakCap, GLITCH_LADDER_STEP, GLITCH_LADDER_MAX,
  frozenReturnGate, frozenReturnBypass, FROZEN_RETURN_GATE_BASE_MS, FROZEN_RETURN_GATE_MAX_MS,
  ascendStalled, ceilingCell, ASCEND_STALL_PASSES, ASCEND_STALL_EPS, ASCEND_DIG_BUDGET
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

// ---- v0.84.0: THE HAZARD ZONE (run77: >= 8 fall/env deaths in ONE flooded quarry) ----

test('hazardZones: scattered singletons stay invisible, a pair clusters (run77 quarry shape)', () => {
  const t = 1000
  // a lone pocket is a point hazard: the point tier already covers it
  const lone = [{ x: 100, y: 48, z: 200, at: t }]
  assert.deepEqual(hazardZones(lone, t), [], 'one record is not a zone')
  // two records 6 blocks apart = the same quarry: a zone with an envelope
  const pair = [
    { x: -115, y: 48, z: 392, at: t },
    { x: -121, y: 49, z: 394, at: t }
  ]
  const zones = hazardZones(pair, t)
  assert.equal(zones.length, 1, 'two records within mergeDist join one cluster')
  assert.equal(zones[0].count, 2)
  assert.ok(zones[0].r >= HAZARD_ZONE_MARGIN, 'the envelope at least covers the margin')
  // the centroid sits between the members
  assert.equal(zones[0].x, -118)
  assert.equal(zones[0].z, 393)
  // the envelope radius reaches past the outermost member
  assert.ok(zones[0].r >= Math.max(
    Math.hypot(-115 - -118, 392 - 393),
    Math.hypot(-121 - -118, 394 - 393)
  ) + HAZARD_ZONE_MARGIN - 1e-9, 'r = max member distance + margin')
})

test('hazardZones: distant records stay separate, expired and junk prune silently', () => {
  const t = 1000
  // two clusters far apart -> two zones (a 50x43 quarry vs an unrelated lake)
  const two = [
    { x: -115, y: 48, z: 392, at: t },
    { x: -120, y: 47, z: 396, at: t },
    { x: 300, y: 60, z: 300, at: t },
    { x: 306, y: 61, z: 298, at: t }
  ]
  const zones = hazardZones(two, t)
  assert.equal(zones.length, 2, 'clusters beyond mergeDist never merge')
  // an expired record is invisible to clustering
  const stale = [
    { x: 0, y: 50, z: 0, at: t - WATER_HAZARD_TTL_MS - 1 },
    { x: 1, y: 50, z: 1, at: t }
  ]
  assert.deepEqual(hazardZones(stale, t), [], 'the expired member never clusters')
  // junk shapes prune (the Number(null) lesson, sixth strike, pinned here too)
  assert.deepEqual(hazardZones(null, t), [])
  assert.deepEqual(hazardZones([{ x: NaN, y: 50, z: 0, at: t }, { x: 1, y: 50, z: 1, at: t }], t), [])
  assert.deepEqual(hazardZones([{ x: 0, y: 50, z: 0 }, { x: 1, y: 50, z: 1, at: t }], t), [], 'a record without `at` is junk')
})

test('nearWaterHazard: the run77 rim walk dies at the zone tier, not at the point tier', () => {
  const t = 1000
  // run77's exact geometry: records at the flooded bottom (y 42-53), the
  // candidate on the rim (y 56-61) - outside EVERY point record's radius AND band
  const quarry = [
    { x: -115, y: 48, z: 392, at: t },
    { x: -121, y: 49, z: 394, at: t },
    { x: -110, y: 47, z: 390, at: t }
  ]
  const rim = { x: -114, y: 58, z: 391 }
  // WITHOUT zones: every member is clean (the hole the fall/env deaths walked through)
  assert.equal(nearWaterHazard(quarry, rim, t), null,
    'the point tier alone misses the rim - that is the run77 bug')
  // WITH zones: the envelope owns the whole mouth (zoneYBand 16 covers 58 vs ~48)
  const zones = hazardZones(quarry, t)
  const hit = nearWaterHazard(quarry, rim, t, { zones })
  assert.ok(hit, 'the zone tier vetoes the rim walk')
  assert.equal(hit.zone, true, 'the hit names its tier (the log stays honest)')
  // depth still matters: a candidate far BELOW or ABOVE the zone band is clean
  assert.equal(nearWaterHazard(quarry, { x: -114, y: 48 + HAZARD_ZONE_Y_BAND + 2, z: 391 }, t, { zones }), null,
    'a candidate outside the zone y-band stays clean')
  // clean ground far from any cluster stays clean
  assert.equal(nearWaterHazard(quarry, { x: 500, y: 50, z: 500 }, t, { zones }), null)
})

test('nearWaterHazard: junk zones are skipped before arithmetic (Number(null) = 0 is FINITE)', () => {
  const t = 1000
  const pos = { x: 0, y: 50, z: 0 }
  const poison = [
    null,
    { x: 0, y: 50, z: 0, r: null },        // Number(null)=0 - a null r must NOT swallow the map
    { x: 0, y: 50, z: 0, r: NaN },
    { x: NaN, y: 50, z: 0, r: 30 },
    { x: 0, y: 50, z: 0, r: -5 }           // a non-positive radius is junk
  ]
  assert.equal(nearWaterHazard([], pos, t, { zones: poison }), null,
    'junk zones never veto clean ground')
  // a REAL zone still fires beside the junk
  const mixed = [...poison, { x: 2, y: 50, z: 2, r: 10, count: 2 }]
  assert.ok(nearWaterHazard([], pos, t, { zones: mixed }), 'the healthy zone fires beside junk')
})

test('HazardLedger: near() derives zones from the live records (the wiring pin)', () => {
  const now = { t: 1000 }
  const clock = () => now.t
  const led = new HazardLedger({ now: clock })
  // the run77 quarry: three rescues at the bottom
  led.record({ x: -115, y: 48, z: 392 })
  led.record({ x: -121, y: 49, z: 394 })
  led.record({ x: -110, y: 47, z: 390 })
  // the rim candidate: clean for the point tier, condemned by the zone tier
  const rim = { x: -114, y: 58, z: 391 }
  assert.equal(nearWaterHazard(led.hazards, rim, now.t), null, 'the point tier misses the rim (the bug, kept honest)')
  assert.ok(led.near(rim), 'the ledger zones the rim - mapTargetFor and digShaft inherit the veto')
  // expiry rotates both tiers together
  now.t += WATER_HAZARD_TTL_MS + 1
  assert.equal(led.near(rim), null, 'expired records mean expired zones')
})

test('REGRESSION PIN: the run77 hazard-zone constants - the wiring cannot silently rot', () => {
  assert.equal(HAZARD_ZONE_MERGE_DIST, 12, 'records within 12 blocks are one quarry')
  assert.equal(HAZARD_ZONE_MIN_COUNT, 2, 'a lone pocket stays a point hazard')
  assert.equal(HAZARD_ZONE_MARGIN, 4, 'the envelope pads past the outermost member')
  assert.equal(HAZARD_ZONE_Y_BAND, 16, 'the zone band spans the pit the point band missed')
})

test('frozenRelogDecision: the threshold escalates only on CONSECUTIVE verdicts (run79 F8 x93)', () => {
  assert.equal(FROZEN_RELOG_AFTER, 3, 'three flat stand-downs = a persistent stall, not a blip')
  assert.deepEqual(frozenRelogDecision({ frozenStandDowns: 3 }),
    { relog: true, why: '3 consecutive frozen verdicts' }, 'the third consecutive verdict force-ends the session')
  assert.equal(frozenRelogDecision({ frozenStandDowns: 2 }).relog, false, 'a transient stall recovers within two verdicts')
  assert.equal(frozenRelogDecision({ frozenStandDowns: 1 }).relog, false)
  const below = frozenRelogDecision({ frozenStandDowns: 1 })
  assert.match(below.why, /1\/3/, 'the why names the progress toward the threshold')
})

test('frozenRelogDecision: the respawn and the session loop own the dead exits', () => {
  assert.equal(frozenRelogDecision({ frozenStandDowns: 9, hasEntity: false }).relog, false,
    'no entity - the session loop already owns it')
  assert.equal(frozenRelogDecision({ frozenStandDowns: 9, health: 0 }).relog, false,
    'a dead bot is the respawn\'s exit, not a relog')
  assert.equal(frozenRelogDecision({ frozenStandDowns: 9, health: 1 }).relog, true,
    'a half-dead frozen bot still gets the fresh client')
})

test('frozenRelogDecision: junk never condemns (the Number(null) lesson, seventh strike)', () => {
  assert.equal(frozenRelogDecision({}).relog, false, 'no counter = no escalation')
  assert.equal(frozenRelogDecision({ frozenStandDowns: null }).relog, false)
  assert.equal(frozenRelogDecision({ frozenStandDowns: NaN }).relog, false)
  assert.equal(frozenRelogDecision({ frozenStandDowns: -4 }).relog, false)
  assert.equal(frozenRelogDecision({ frozenStandDowns: 3, threshold: null }).relog, true,
    'junk threshold falls back to the constant')
  assert.equal(frozenRelogDecision({ frozenStandDowns: 2, threshold: 2 }).relog, true,
    'a caller-owned tighter threshold is honoured')
  assert.equal(frozenRelogDecision({ frozenStandDowns: 3, threshold: 0 }).relog, true,
    'a junk zero threshold keeps the default')
})

// ---- v0.96.0: THE WET-FROZEN RELOG ----
// MEASURED (run85, dispatch 35806079822): the 'fall/env' deaths of F3 (o2
// -1/0, head wet) and F19 (o2 -1) were DROWNING IN DISGUISE - the
// frozen-physics verdict stood the rescue down, the server kept ticking the
// drowning clock, and both bots died within seconds while the v0.87.0
// escalation waited for THREE consecutive verdicts (~75s). A head-wet
// flatline escalates on the FIRST verdict now.

test('v0.96.0 the wet-frozen relog: a head-wet frozen verdict escalates IMMEDIATELY (the drowning clock beats the 3-verdict threshold)', () => {
  const first = frozenRelogDecision({ frozenStandDowns: 1, headWet: true })
  assert.equal(first.relog, true, 'one wet verdict is proof enough - the bot has ~15s of air')
  assert.match(first.why, /head-wet/, 'the why names the class')
  assert.match(first.why, /drowning clock/, 'the why names the urgency')
  assert.equal(frozenRelogDecision({ frozenStandDowns: 2, headWet: true }).relog, true,
    'the second wet verdict still escalates (the threshold never downgrades it)')
})

test('v0.96.0 the wet-frozen relog: junk wetness NEVER accelerates (the gates-decide convention) and the dry threshold stands', () => {
  assert.equal(frozenRelogDecision({ frozenStandDowns: 1, headWet: false }).relog, false,
    'a dry frozen bot is harmless where it stands - the legacy threshold protects it')
  assert.equal(frozenRelogDecision({ frozenStandDowns: 2, headWet: false }).relog, false)
  assert.equal(frozenRelogDecision({ frozenStandDowns: 1, headWet: 'wet' }).relog, false,
    'a string is junk - only a boolean TRUE accelerates')
  assert.equal(frozenRelogDecision({ frozenStandDowns: 1 }).relog, false,
    'no wetness flag = the legacy shape, byte for byte')
  assert.equal(frozenRelogDecision({ frozenStandDowns: 1, headWet: null }).relog, false)
  assert.equal(frozenRelogDecision({ frozenStandDowns: 3, headWet: false }).relog, true,
    'the dry escalation still fires at the threshold')
})

test('v0.96.0 the wet-frozen relog: the dead exits outrank the acceleration (the respawn owns them)', () => {
  assert.equal(frozenRelogDecision({ frozenStandDowns: 1, headWet: true, hasEntity: false }).relog, false,
    'no entity - the session loop already owns it')
  assert.equal(frozenRelogDecision({ frozenStandDowns: 1, headWet: true, health: 0 }).relog, false,
    'a dead bot is the respawn\'s exit')
})

// ---- v0.94.0: THE FLEE-DRY VETO ----
// Run80 (35773697160) named the class: F5 was released surface-safe, then the
// flee verdict walked it into the flooded quarry - drowned@7.9. The dry flee
// branches (radial away-vector + yard kite) never judged their hop TARGET;
// the fleet's own death memory sat unused by every flee branch.

test('rotateBearingXZ: quarter turns are exact and wrap mod 4', () => {
  assert.deepEqual(rotateBearingXZ(1, 0, 0), { x: 1, z: 0 }, 'zero turns = the bearing itself')
  assert.deepEqual(rotateBearingXZ(1, 0, 1), { x: 0, z: 1 }, '+90: east -> south')
  assert.deepEqual(rotateBearingXZ(1, 0, 2), { x: -1, z: 0 }, '180: east -> west')
  assert.deepEqual(rotateBearingXZ(1, 0, 3), { x: 0, z: -1 }, '-90 (as 3): east -> north')
  assert.deepEqual(rotateBearingXZ(1, 0, 4), { x: 1, z: 0 }, '4 turns = a full circle')
  assert.deepEqual(rotateBearingXZ(1, 0, -1), { x: 0, z: -1 }, 'negative turns normalize (−1 = 3)')
  assert.deepEqual(rotateBearingXZ(1, 0, 7), { x: 0, z: -1 }, '7 mod 4 = 3 (the -90 turn: east -> north)')
  assert.deepEqual(rotateBearingXZ(0, 2, 1), { x: -2, z: 0 }, 'length is preserved (south -> west)')
  assert.deepEqual(rotateBearingXZ(NaN, 1, 1), { x: NaN, z: 1 }, 'junk bearing passes through untouched (the caller owns it)')
  assert.deepEqual(rotateBearingXZ(1, 1, NaN), { x: 1, z: 1 }, 'junk turns = zero turns')
})

test('fleeTargetBlocked: the live world tier - cell or floor water vetoes', () => {
  const dryWorld = () => 'grass_block'
  const wetCell = (x, y, z) => (z > 0 ? 'water' : 'grass_block')
  const wetFloor = (x, y, z) => (z > 0 ? (y === 62 ? 'water' : 'air') : 'grass_block')
  assert.equal(fleeTargetBlocked({ sample: dryWorld, x: 10, y: 64, z: 20 }), false, 'solid cell + solid floor = free')
  assert.equal(fleeTargetBlocked({ sample: wetCell, x: 10, y: 64, z: 20 }), true, 'water AT the target cell vetoes')
  assert.equal(fleeTargetBlocked({ sample: wetFloor, x: 10, y: 63, z: 20 }), true, 'water UNDER an air target vetoes (the pool the walk steps into)')
  assert.equal(fleeTargetBlocked({ sample: () => null, x: 10, y: 64, z: 20 }), false, 'unloaded chunks read as not-blocked (the hop tries, the wet detection owns the arrival)')
  assert.equal(fleeTargetBlocked({ x: 10, y: 64, z: 20 }), false, 'no sample at all = nothing to judge')
})

test('fleeTargetBlocked: the ledger tier - the death memory outranks a dry world read', () => {
  const dryWorld = () => 'grass_block'
  const hit = () => ({ x: -120, y: 48, z: 390, t: 1 })
  assert.equal(fleeTargetBlocked({ sample: dryWorld, hazardNear: hit, x: 10, y: 64, z: 20 }), true,
    'a live hazard record/zone at the target vetoes even a dry-land read (the chunks at 12 blocks may not hold the water the fleet died in)')
  assert.equal(fleeTargetBlocked({ sample: dryWorld, hazardNear: () => null, x: 10, y: 64, z: 20 }), false,
    'a null ledger read falls through to the world tier')
  assert.equal(fleeTargetBlocked({ sample: dryWorld, hazardNear: () => { throw new Error('ledger boom') }, x: 10, y: 64, z: 20 }), false,
    'a throwing ledger read degrades to the world tier, never throws')
  assert.equal(fleeTargetBlocked({ hazardNear: hit, x: 10, y: 64, z: 20 }), true,
    'the ledger vetoes even with no world reader at all')
})

test('fleeTargetBlocked: junk never vetoes and never throws (the Number(null) class)', () => {
  assert.equal(fleeTargetBlocked({}), false, 'no readers, junk coords = nothing to judge')
  assert.equal(fleeTargetBlocked({ sample: () => 'water', x: NaN, y: 64, z: 20 }), false, 'non-finite x judges nothing')
  assert.equal(fleeTargetBlocked({ sample: () => 'water', x: 10, y: Infinity, z: 20 }), false, 'non-finite y judges nothing')
  assert.equal(fleeTargetBlocked({ sample: () => 'water', x: 10, y: 64, z: undefined }), false, 'undefined z judges nothing (Number(null) eleventh strike)')
  assert.equal(fleeTargetBlocked({ sample: () => { throw new Error('world boom') }, x: 10, y: 64, z: 20 }), false, 'a throwing world read is not a veto')
})

test('vettedFleeTargetAbs: the first free candidate wins, order 0/+90/-90/180', () => {
  const dry = () => 'grass_block'
  assert.deepEqual(vettedFleeTargetAbs({ sample: dry, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }),
    { x: 12, z: 0, turns: 0 }, 'a free original target rides unchanged')
  // the original target (+12 x) is water; the +90 rotation (0,+12 z) is dry
  const wetEast = (x, y, z) => (x > 6 ? 'water' : 'grass_block')
  assert.deepEqual(vettedFleeTargetAbs({ sample: wetEast, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }),
    { x: 0, z: 12, turns: 1 }, 'the blocked east bearing rotates to south (+90), same hop length')
  // east AND south water -> -90 (north) wins
  const wetEastSouth = (x, y, z) => (x > 6 || z > 6 ? 'water' : 'grass_block')
  assert.deepEqual(vettedFleeTargetAbs({ sample: wetEastSouth, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }),
    { x: 0, z: -12, turns: 3 }, 'two blocked quarters rotate to north (−90 as turns 3)')
  // everything water -> the original stands (a chasing mob beats a standstill)
  const ocean = () => 'water'
  assert.deepEqual(vettedFleeTargetAbs({ sample: ocean, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }),
    { x: 12, z: 0, turns: 0 }, 'all four blocked = the legacy original stands')
  // rotation preserves the hop length exactly
  const v = vettedFleeTargetAbs({ sample: wetEast, ax: 3, ay: 64, az: -4, tx: 15, tz: -4 })
  assert.equal(Math.round(Math.hypot(v.x - 3, v.z + 4)), 12, 'the rotated target keeps the 12-block hop length')
})

test('vettedFleeTargetAbs: the ledger tier and the junk shape', () => {
  const dry = () => 'grass_block'
  const hit = p => (p && p.x === 12 && p.z === 0 ? { x: 12, y: 64, z: 0, t: 1 } : null)
  assert.deepEqual(vettedFleeTargetAbs({ sample: dry, hazardNear: hit, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }),
    { x: 0, z: 12, turns: 1 }, 'a ledgered target rotates like a water target (the death memory outranks the world)')
  assert.deepEqual(vettedFleeTargetAbs({ sample: dry, hazardNear: hit, ax: 0, ay: 64, az: 0, tx: 0, tz: -12 }),
    { x: 0, z: -12, turns: 0 }, 'a free bearing rides unchanged under a live ledger')
  assert.equal(vettedFleeTargetAbs({ sample: dry, ax: 0, ay: 64, az: 0, tx: NaN, tz: 0 }), null,
    'a non-finite target = no candidates = null (the caller keeps its legacy shape)')
  assert.equal(vettedFleeTargetAbs({ sample: dry, ax: 0, ay: NaN, az: 0, tx: 12, tz: 0 }), null,
    'a non-finite anchor y = null (the sample plane is unreadable)')
})

// ---- v0.95.0: THE FLEE PATH VETO + THE GLITCH ESCALATION ----
// Run84a (35801416480, the v0.94.0 fleet, NORMAL END 19/19): smelted=3 (the
// 11-run wall cracked), the flee-dry veto fired 4x - but (a) four bots died
// drowned@7.8-14.4 WHILE FLEEING a drowned: the target veto passed (the far
// shore was dry) and the PATH swam the quarry lakes; (b) F17 was glitch-
// ignored 675+ reads (oxygen 0 on dry land) and the server drowned it anyway.

test('fleePathBlocked: a straight line over water vetoes at any of the 3 depths', () => {
  const dry = () => 'grass_block'
  // water column at x=6 (the 50% sample of a 12-block hop from 0 to 12)
  const lake = (x, y, z) => (x === 6 ? 'water' : 'grass_block')
  assert.equal(fleePathBlocked({ sample: dry, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }), false, 'dry line = free')
  assert.equal(fleePathBlocked({ sample: lake, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }), true, 'water AT the plane vetoes')
  // water 2 below the plane (the descend-into-lake case): the surface cells read dry
  const sunkLake = (x, y, z) => (x === 6 ? (y === 62 ? 'water' : 'air') : 'grass_block')
  assert.equal(fleePathBlocked({ sample: sunkLake, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }), true,
    'water at y-2 under a dry surface vetoes (the hop descends the slope into the lake)')
  // the TARGET itself is not this function's business (the target veto owns it)
  const farWater = (x, y, z) => (x >= 10 ? 'water' : 'grass_block')
  assert.equal(fleePathBlocked({ sample: farWater, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }), false,
    'water only AT the target passes here - fleeTargetBlocked owns the target cell')
})

test('fleePathBlocked: junk never vetoes (null reads, throws, non-finite)', () => {
  assert.equal(fleePathBlocked({ ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }), false, 'no sample = nothing to judge')
  assert.equal(fleePathBlocked({ sample: () => null, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }), false, 'unloaded chunks = not blocked')
  assert.equal(fleePathBlocked({ sample: () => { throw new Error('boom') }, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }), false, 'a throwing world read is not a veto')
  assert.equal(fleePathBlocked({ sample: () => 'water', ax: 0, ay: NaN, az: 0, tx: 12, tz: 0 }), false, 'non-finite plane judges nothing')
  assert.equal(fleePathBlocked({ sample: () => 'water', ax: 0, ay: 64, az: 0, tx: Infinity, tz: 0 }), false, 'non-finite target judges nothing')
})

test('vettedFleeTargetAbs: a dry far shore across a lake ROTATES (the path veto rides)', () => {
  // the lake sits at x 4..8 - the +x target (12,0) has a dry target cell but a wet path
  const lake = (x, y, z) => (x >= 4 && x <= 8 ? 'water' : 'grass_block')
  assert.deepEqual(vettedFleeTargetAbs({ sample: lake, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }),
    { x: 0, z: 12, turns: 1 }, 'the east hop swims -> rotates to the dry south bearing')
  assert.deepEqual(vettedFleeTargetAbs({ sample: lake, ax: 0, ay: 64, az: 0, tx: 0, tz: -12 }),
    { x: 0, z: -12, turns: 0 }, 'a dry path rides unchanged (no over-veto on land)')
  // a cross-shaped lake on all four axes: every rotation's path swims while
  // every target cell (12+ blocks out) is dry - the original stands (a
  // chasing mob beats a standstill)
  const moat = (x, y, z) => ((Math.abs(z) <= 1 && Math.abs(x) >= 3 && Math.abs(x) <= 9) ||
    (Math.abs(x) <= 1 && Math.abs(z) >= 3 && Math.abs(z) <= 9) ? 'water' : 'grass_block')
  assert.deepEqual(vettedFleeTargetAbs({ sample: moat, ax: 0, ay: 64, az: 0, tx: 12, tz: 0 }),
    { x: 12, z: 0, turns: 0 }, 'all four paths swim = the legacy original stands')
})

test('waterVerdict: the glitch escalation - a sustained critical-on-dry streak believes the bar', () => {
  const dry = { feet: 'stone', head: 'air' }
  assert.equal(AIR_GLITCH_STREAK_CAP, 8, 'eight consecutive reads = sustained, not a burst')
  assert.equal(waterVerdict({ ...dry, oxygen: 0 }), 'none', 'legacy shape: one critical-on-dry read is still ignored')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: 7 }), 'none', 'just under the cap = still ignored')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: 8 }), 'drowning', 'AT the cap the bar is believed')
  assert.equal(waterVerdict({ ...dry, oxygen: 3, dryGlitchStreak: 12 }), 'drowning', 'past the cap at any critical level')
  assert.equal(waterVerdict({ ...dry, oxygen: 20, dryGlitchStreak: 99 }), 'none', 'a healthy bar with a junk-long streak is fine')
  assert.equal(waterVerdict({ feet: 'water', head: 'air', oxygen: 0, dryGlitchStreak: 0 }), 'drowning', 'wet reads page at critical regardless of the streak')
  // junk streaks fall back to the legacy shape, byte for byte
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: NaN }), 'none')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: -3 }), 'none')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: null }), 'none')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: 8.9 }), 'drowning', 'a fractional streak past the cap floors in')
})

// ---- (v0.104.0) THE WATERLOG STATE + THE DRY-LAND PROOF ----
// run93 (35835942682): F9/F15 stood DRY on the quarry rim with a bar stuck
// at 0 - the v0.95.0 streak escalation paged 'drowning', the rescue broke out
// 0.0s later (dry + on ground), recorded the DRY cell as a hazard, and the
// sentry re-fired every 3s - 45+ walk-cancel/hazard-poison cycles per bot
// feeding the A* storm that killed the run. And the REAL sustained-drain
// class (run84a F17) was waterlogged blocks reading their base names - the
// blockstate flag is the truth the streak ladder was guessing at.

test('airBarTrust: the waterlog blockstate is water contact (the F17 class reads wet)', () => {
  assert.equal(airBarTrust({ feet: 'oak_stairs', head: 'air', feetWaterlogged: true }), 'wet', 'a waterlogged stair underfoot reads its base name - the state does not lie')
  assert.equal(airBarTrust({ feet: 'stone', head: 'oak_slab', headWaterlogged: true }), 'wet', 'a waterlogged block at head height is submersion')
  assert.equal(airBarTrust({ feet: 'water', head: 'air', headWaterlogged: false }), 'wet', 'an explicit false flag judges nothing - the name already said water')
})

test('airBarTrust: missing or junk flags keep every legacy verdict byte for byte', () => {
  assert.equal(airBarTrust({ feet: 'sand', head: 'air' }), 'dry', 'the v0.16.0 shape: no flags, two dry reads')
  assert.equal(airBarTrust({ feet: 'oak_stairs', head: 'air' }), 'dry', 'a stair NAME alone is still dry - only the state flag speaks for waterlogging')
  assert.equal(airBarTrust({ feet: 'sand', head: 'air', feetWaterlogged: undefined }), 'dry', 'an undefined flag judges nothing')
  assert.equal(airBarTrust({ feet: 'sand', head: 'air', headWaterlogged: 'yes' }), 'dry', 'a truthy NON-boolean never invents water')
  assert.equal(airBarTrust({ feet: null, head: null, feetWaterlogged: false }), 'unknown', 'missing reads stay unknown')
})

test('waterVerdict: a critical bar behind waterlogged contact pages WITHOUT the streak ladder', () => {
  const wl = { feet: 'oak_stairs', head: 'air', feetWaterlogged: true }
  assert.equal(waterVerdict({ ...wl, oxygen: 0, dryGlitchStreak: 0 }), 'drowning', 'run84a F17: the drain was real, the rescue now swims immediately')
  assert.equal(waterVerdict({ ...wl, oxygen: 0, dryGlitchStreak: 3 }), 'drowning', 'the streak is irrelevant when the state says wet')
  assert.equal(waterVerdict({ feet: 'sand', head: 'air', headWaterlogged: true, oxygen: 0 }), 'drowning')
})

test('waterVerdict: the dry glitch class is unchanged (the proof and the gate own it now)', () => {
  const dry = { feet: 'sand', head: 'air' }
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: 0 }), 'none', 'no flags, dry reads: the legacy ignore')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, feetWaterlogged: false, headWaterlogged: false, dryGlitchStreak: 0 }), 'none', 'explicit false flags read exactly like no flags')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: AIR_GLITCH_STREAK_CAP }), 'drowning', 'the v0.95.0 escalation stays for unreadable states')
})

test('dryLandProof: only the fast zero-contact completion proves dry (run93 F9/F15 shape)', () => {
  assert.equal(dryLandProof({ wetPasses: 0, elapsedMs: 0 }), true, 'the 0.0s no-op rescue: the proof')
  assert.equal(dryLandProof({ wetPasses: 0, elapsedMs: 1999 }), true, 'inside the bound')
  assert.equal(dryLandProof({ wetPasses: 0, elapsedMs: DRY_PROOF_MAX_MS }), true, 'AT the bound admits (<=)')
  assert.equal(dryLandProof({ wetPasses: 0, elapsedMs: 2001 }), false, 'a long dry flail is not proven - the legacy hazard record stays')
  assert.equal(dryLandProof({ wetPasses: 1, elapsedMs: 0 }), false, 'any water contact disproves the proof (a swim-out records its hazard)')
  assert.equal(dryLandProof({ wetPasses: 3, elapsedMs: 120000 }), false)
})

test('dryLandProof: junk inputs judge NOTHING (false = legacy path)', () => {
  assert.equal(dryLandProof({}), false)
  assert.equal(dryLandProof({ wetPasses: null, elapsedMs: 100 }), false)
  assert.equal(dryLandProof({ wetPasses: 0, elapsedMs: null }), false)
  assert.equal(dryLandProof({ wetPasses: NaN, elapsedMs: 100 }), false)
  assert.equal(dryLandProof({ wetPasses: 0, elapsedMs: -5 }), false)
  assert.equal(dryLandProof({ wetPasses: -1, elapsedMs: 100 }), false)
})

test('the dry-land constants: the backoff stays under the drain-to-death clock', () => {
  assert.ok(DRY_PROOF_MAX_MS === 2000, 'the proof window covers the 0.0s/1.3s no-op shapes')
  assert.ok(DRY_PROOF_BACKOFF_MS === 20000, 'the re-fire backoff')
  assert.ok(DRY_PROOF_BACKOFF_MS < 35000, 'a real stuck-sensor drain still gets its page before the ~35s death clock')
  assert.ok(DRY_PROOF_BACKOFF_MS > RESCUE_COOLDOWN_MS, 'the backoff is a real step beyond the 3s cooldown')
})

// (v0.117.0) THE CHRONIC-LIAR LADDER - run102 (35889087936): F3 read 151+
// critical-on-dry pages, fired 11 overrides, 15 rescue starts, 10 dry-land
// proofs (every page disproven) and 4 frozen relogs - the proof restarts the
// streak but the gate window kept COUNTING, so the stale streak (~33 reads)
// re-fired the rescue the moment the 20s gate expired: a no-op rescue every
// ~25s for the whole run. The cure: confirmed no-op pages ladder the FRESH
// evidence bar for the next override.

test('glitchStreakCap: the ladder climbs 8 per confirmed no-op page, bounded at 40', () => {
  assert.equal(GLITCH_LADDER_STEP, 8, 'one page per ladder rung')
  assert.equal(GLITCH_LADDER_MAX, 40, 'the bound (~24s of sustained critical-on-dry at the 600ms cadence)')
  assert.equal(glitchStreakCap(0), 8, 'no confirmations = the legacy cap')
  assert.equal(glitchStreakCap(1), 16, 'one confirmed lie doubles the evidence bar')
  assert.equal(glitchStreakCap(2), 24)
  assert.equal(glitchStreakCap(3), 32)
  assert.equal(glitchStreakCap(4), 40, 'the bound lands')
  assert.equal(glitchStreakCap(10), 40, 'F3\'s 10 proofs stay bounded')
  assert.equal(glitchStreakCap(99), 40, 'the ladder never grows past the bound')
})

test('glitchStreakCap: junk confirmations read the legacy cap (never a lockout)', () => {
  assert.equal(glitchStreakCap(), 8, 'no argument')
  assert.equal(glitchStreakCap(null), 8)
  assert.equal(glitchStreakCap(undefined), 8)
  assert.equal(glitchStreakCap(NaN), 8)
  assert.equal(glitchStreakCap(-5), 8, 'a negative count is not debt')
  assert.equal(glitchStreakCap('x'), 8)
  assert.equal(glitchStreakCap(1.9), 16, 'floats floor to a whole confirmation (1)')
})

test('waterVerdict: the laddered cap governs the override page (the stale streak refuses)', () => {
  const dry = { feet: 'sand', head: 'air' }
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: 8, dryGlitchCap: 24 }), 'none',
    'the F3 shape: a first-override-sized streak on a twice-confirmed liar does NOT page')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: 23, dryGlitchCap: 24 }), 'none', 'just under the rung')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: 24, dryGlitchCap: 24 }), 'drowning', 'at the rung the page fires')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: 50, dryGlitchCap: 40 }), 'drowning', 'past the bound the sustained drain still pages')
})

test('waterVerdict: a junk cap reads the legacy cap; the wet lane never waits on the ladder', () => {
  const dry = { feet: 'sand', head: 'air' }
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: 8, dryGlitchCap: NaN }), 'drowning', 'junk cap = the legacy 8')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: 8, dryGlitchCap: null }), 'drowning')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: 8, dryGlitchCap: -3 }), 'drowning')
  assert.equal(waterVerdict({ feet: 'water', head: 'air', oxygen: 0, dryGlitchStreak: 0, dryGlitchCap: 40 }), 'drowning',
    'a WET critical read pages without any streak - the ladder only ever governs the DRY override')
  assert.equal(waterVerdict({ feet: 'sand', head: 'water', oxygen: 2, dryGlitchStreak: 0, dryGlitchCap: 40 }), 'drowning',
    'the head-wet rescue level likewise ignores the cap')
  assert.equal(waterVerdict({ ...dry, oxygen: 0, dryGlitchStreak: AIR_GLITCH_STREAK_CAP }), 'drowning',
    'the legacy call (no cap argument) keeps the v0.95.0 escalation byte for byte')
})

test('the liar-ladder wiring: the miner holds the streak in the gate, ratchets on the glitch-class proof, resets on wet/non-proof', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('glitchStreakCap'), 'the miner imports the laddered cap')
  assert.ok(src.includes('if (Date.now() >= noOpRescueGateUntil) dryGlitchStreak++'),
    'the gate window HOLDS the streak - stale reads never re-arm the page')
  assert.ok(src.includes('dryGlitchCap: glitchStreakCap(glitchConfirmed)'),
    'the verdict reads the laddered cap')
  assert.ok(src.includes('rescuePageWasGlitch = criticalOnDry'),
    'the fire site carries the page class (a wet-lane page never ratchets)')
  assert.ok(src.includes('liar ladder ratchets - confirmed no-op glitch page'),
    'the ratchet names itself so the next mine reads the lane')
  assert.ok(src.includes("contactTrust === 'wet' && glitchConfirmed > 0"),
    'wet contact resets the ladder (a new page class) - v0.127.0 shares the single trust read')
  assert.ok(src.includes('the rescue kept its water/long record'),
    'the non-proof exit resets the ladder (the real-drain shape keeps the fast lane)')
})

// (v0.119.0) THE FROZEN-RETURN GATE - run103 (35895546754): the v0.96.0
// wet-frozen relog became a LOOP - F14 relogged 12 times into the SAME water
// column [-121,58-59,376] (12 rescue starts, 12 relogs, zero completions):
// page at o2 12-13 -> surface (o2 20) -> physics freeze at the surface ->
// first-verdict wet relog -> reconnect into the SAME column -> re-page. The
// gate gives the relog's promise ("the rescue swims the bot out") the time it
// assumed: the sentry holds non-critical pages while the work loop walks the
// hazard-ledgered column out; a critical bar bypasses (the death clock wins).

test('frozenReturnGate: the ladder doubles 10/20/40 and bounds at 60s', () => {
  assert.equal(FROZEN_RETURN_GATE_BASE_MS, 10000, 'rung one: one walk-out window')
  assert.equal(FROZEN_RETURN_GATE_MAX_MS, 60000, 'the bound: a hold, not a residency')
  assert.equal(frozenReturnGate({ consecutiveRelogs: 0 }), 0, 'no relogs = no gate')
  assert.equal(frozenReturnGate({ consecutiveRelogs: 1 }), 10000, 'F14 relog #1')
  assert.equal(frozenReturnGate({ consecutiveRelogs: 2 }), 20000)
  assert.equal(frozenReturnGate({ consecutiveRelogs: 3 }), 40000)
  assert.equal(frozenReturnGate({ consecutiveRelogs: 4 }), 60000, 'the bound lands')
  assert.equal(frozenReturnGate({ consecutiveRelogs: 12 }), 60000, 'F14\'s 12 relogs stay bounded')
  assert.equal(frozenReturnGate({ consecutiveRelogs: 99 }), 60000)
})

test('frozenReturnGate: junk counts read 0 - a wiring sickness never arms a hold', () => {
  assert.equal(frozenReturnGate({}), 0)
  assert.equal(frozenReturnGate({ consecutiveRelogs: null }), 0)
  assert.equal(frozenReturnGate({ consecutiveRelogs: undefined }), 0)
  assert.equal(frozenReturnGate({ consecutiveRelogs: NaN }), 0)
  assert.equal(frozenReturnGate({ consecutiveRelogs: -2 }), 0, 'a negative count is not debt')
  assert.equal(frozenReturnGate({ consecutiveRelogs: 'x' }), 0)
  assert.equal(frozenReturnGate({ consecutiveRelogs: 2.9 }), 20000, 'floats floor to whole relogs (2)')
})

test('frozenReturnBypass: only a genuinely critical bar outranks the hold', () => {
  assert.equal(frozenReturnBypass({ oxygen: 0 }), true, 'the death clock owns o2=0')
  assert.equal(frozenReturnBypass({ oxygen: 4 }), true, 'AT the critical level bypasses (<=)')
  assert.equal(frozenReturnBypass({ oxygen: 5 }), false, 'the F14 page class (o2 12-13 family) holds')
  assert.equal(frozenReturnBypass({ oxygen: 13 }), false, 'the headWetMs lane holds')
  assert.equal(frozenReturnBypass({ oxygen: 20 }), false)
  assert.equal(frozenReturnBypass({ oxygen: NaN }), false, 'a lost read cannot spend an emergency')
  assert.equal(frozenReturnBypass({ oxygen: -1 }), false, 'the -1 reset sentinel is not a reading')
  assert.equal(frozenReturnBypass({}), false)
})

test('the frozen-return wiring: the streak rides the relog, the gate arms at the relog site, the honest completion clears, the sentry holds non-critical pages', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('const frozenRelogStreaks = new Map()') && src.includes('const frozenReturnGates = new Map()'),
    'the gate state is process-wide (a relog rebuilds the closure, the bot keeps its name)')
  assert.ok(src.includes("frozenRelogStreaks.get(username) || 0) + 1"),
    'the streak counts consecutive frozen relogs')
  assert.ok(src.includes('frozenReturnGates.set(username, Date.now() + hold)'),
    'the gate arms at the relog site')
  assert.ok(src.includes('frozen-return gate clears - the rescue completed with living physics'),
    'an honest completion clears the streak and the hold')
  assert.ok(src.includes('!frozenReturnBypass({ oxygen: o2raw })'),
    'the sentry holds the page unless the bar is genuinely critical')
  assert.ok(src.includes('frozen-return gate holds the page'),
    'the hold names itself so the next mine reads the lane')
})

// ---- (v0.119.0) THE FALLING-BAR LANE - run104 (35899827086) mined F3
// drowning at o2=2 with the head block reading DRY (a fresh flood through a
// dig; the chunk still read air). o2 in 5..10 with dry cells read 'none'
// until the critical ladder at o2<=4 - and by then the deep pocket had no
// shore (rescue start at o2=2, 'shore=none', dead). A REAL drain is a
// FALLING bar; the 26.2 glitch bar is stuck or flapping and never descends.
test('airBarFalling: a real drain descends, a glitch never does', () => {
  assert.equal(AIR_FALL_MIN_DROP, 2, 'pinned: two levels of real drain inside the window')
  assert.equal(AIR_FALL_MIN_READS, 3, 'pinned: three readings minimum - no verdicts off one or two samples')
  // the run104 F3 shape: the bar counting down under a stale-dry head cell
  assert.equal(airBarFalling([20, 18, 16, 13, 11, 9]), true, 'the countdown signature')
  assert.equal(airBarFalling([12, 11, 10]), true, 'a 2-level loss over the minimum window')
  assert.equal(airBarFalling([19, 18, 17, 16, 15, 14, 13, 12]), true, 'a longer history still reads its TAIL (window 6)')
  // the glitch shapes: stuck and flapping never page through this lane
  assert.equal(airBarFalling([0, 0, 0, 0]), false, 'the stuck bar (the 395x glitch shape)')
  assert.equal(airBarFalling([0, 19, 0, 19]), false, 'the flapping bar (metadata reset bursts)')
  assert.equal(airBarFalling([9, 9, 9, 9, 9]), false, 'a constant bar at the rescue level is not a drain')
  assert.equal(airBarFalling([2, 15, 3, 16]), false, 'refill bursts rise - no page')
  // windows and junk
  assert.equal(airBarFalling([20, 19]), false, 'fewer than AIR_FALL_MIN_READS in-domain readings = no verdict')
  assert.equal(airBarFalling([]), false)
  assert.equal(airBarFalling(null), false)
  assert.equal(airBarFalling(undefined), false)
  assert.equal(airBarFalling('junk'), false)
  assert.equal(airBarFalling([-1, -1, 20, 19, 18]), true, 'the -1 sentinel entries are skipped, not counted as drain evidence')
  assert.equal(airBarFalling([NaN, NaN, 20, 19, 18]), true)
  assert.equal(airBarFalling([20, 19, 18], { drop: 5 }), false, 'a custom drop requirement is honoured')
  assert.equal(airBarFalling([20, 19, 18], { window: 2 }), false, 'a tiny window starves the minimum reads')
})

test('waterVerdict: the falling-bar lane pages a real drain through dry block reads', () => {
  // THE run104 F3 CLASS: head cells read dry (stale chunk after a fresh
  // flood), o2 descends through the rescue band - the legacy verdict read
  // 'none' the whole way down
  const staleFlood = { feet: 'air', head: 'air', oxygen: 9, airHistory: [20, 17, 14, 11, 9] }
  assert.equal(waterVerdict(staleFlood), 'drowning', 'a draining bar outranks stale block reads')
  assert.equal(waterVerdict({ ...staleFlood, oxygen: 5, airHistory: [14, 11, 9, 7, 5] }), 'drowning')
  // the same dry cells with a NON-falling bar keep the legacy 'none' - the
  // glitch bar must not re-arm through this lane
  assert.equal(waterVerdict({ feet: 'air', head: 'air', oxygen: 9, airHistory: [9, 9, 9, 9, 9] }), 'none')
  assert.equal(waterVerdict({ feet: 'air', head: 'air', oxygen: 9 }), 'none', 'no history = the legacy shape byte for byte')
  assert.equal(waterVerdict({ feet: 'air', head: 'air', oxygen: 9, airHistory: [] }), 'none')
  // above the rescue level the lane does not fire (full bar + dry = work on)
  assert.equal(waterVerdict({ feet: 'air', head: 'air', oxygen: 15, airHistory: [20, 19, 18, 17, 15] }), 'none',
    'a falling bar still ABOVE the rescue level is not an emergency yet')
  // the critical lane still outranks everything (o2<=4 + non-dry trust)
  assert.equal(waterVerdict({ feet: 'water', head: 'air', oxygen: 3 }), 'drowning', 'the critical lane is untouched')
  // a wet page with a falling bar still pages (it always did, differently)
  assert.equal(waterVerdict({ feet: 'water', head: 'water', oxygen: 9, airHistory: [20, 17, 14, 11, 9] }), 'drowning')
  // junk history reads as absent - the legacy shape
  assert.equal(waterVerdict({ feet: 'air', head: 'air', oxygen: 9, airHistory: 'junk' }), 'none')
  assert.equal(waterVerdict({ feet: 'air', head: 'air', oxygen: 9, airHistory: [-1, -1, -1] }), 'none',
    'a history of reset sentinels is not drain evidence')
})

// ---------------------------------------------------------------------------
// (v0.125.0) THE DEEP-POCKET ASCEND - run108 (35919773515) F7/F11: the
// submerged lane's jump+settle produced ZERO y movement (y=54.2 flat pass
// over pass, o2 falling 0 -> -1) under a CEILING - alive physics, no shore,
// no exit, dead bot (the run104 F10 shape). The lane gains the human
// playbook: surface to the ceiling and dig up. The pure pair: ascendStalled
// (the stall question) + ceilingCell (the ceiling answer).

test('ascendStalled: the flat-y question (the run108 F7 pin)', () => {
  // rising = never stalled (the lane keeps its jump-only shape)
  assert.equal(ascendStalled({ points: [{ x: 0, y: 50, z: 0 }, { x: 0, y: 50.3, z: 0 }, { x: 0, y: 50.6, z: 0 }, { x: 0, y: 51.0, z: 0 }, { x: 0, y: 51.4, z: 0 }] }), false,
    'a live ascent is not a stall')
  // the run108 shape: y flat across 4+ passes = stalled
  assert.equal(ascendStalled({ points: [{ x: 0, y: 54.2, z: 0 }, { x: 0, y: 54.2, z: 0 }, { x: 0, y: 54.2, z: 0 }, { x: 0, y: 54.2, z: 0 }, { x: 0, y: 54.2, z: 0 }] }), true,
    'the F7 ceiling shape reads stalled')
  // sideways along the ceiling (x moves, y flat) is as stuck for the ascend
  assert.equal(ascendStalled({ points: [{ x: 0, y: 54.2, z: 0 }, { x: 1, y: 54.2, z: 0 }, { x: 2, y: 54.2, z: 0 }, { x: 3, y: 54.2, z: 0 }, { x: 4, y: 54.2, z: 0 }] }), true,
    'only y is watched: a ceiling crawl is a stall for the ascend')
  // sinking slowly (|dy| < eps) is a stall too (the jump is not holding)
  assert.equal(ascendStalled({ points: [{ x: 0, y: 54.1, z: 0 }, { x: 0, y: 54.0, z: 0 }, { x: 0, y: 53.9, z: 0 }, { x: 0, y: 53.8, z: 0 }, { x: 0, y: 53.7, z: 0 }] }), true,
    'a sinking bot is as stalled as a flat one')
  // a real jump bounce (|dy| >= eps) breaks the stall
  assert.equal(ascendStalled({ points: [{ x: 0, y: 54.0, z: 0 }, { x: 0, y: 54.2, z: 0 }, { x: 0, y: 54.0, z: 0 }, { x: 0, y: 54.2, z: 0 }, { x: 0, y: 54.0, z: 0 }] }), false,
    'jump movement above the epsilon breaks the stall')
  // short sequences never stall (the frozen family's junk philosophy)
  assert.equal(ascendStalled({ points: [{ x: 0, y: 54, z: 0 }, { x: 0, y: 54, z: 0 }] }), false)
  assert.equal(ascendStalled({ points: [] }), false)
  // junk never stalls (a LOST reading is not a stalled one - the Number(null) lesson)
  assert.equal(ascendStalled({ points: null }), false)
  assert.equal(ascendStalled({ points: 'junk' }), false)
  assert.equal(ascendStalled({ points: 42 }), false)
  assert.equal(ascendStalled({}), false)
  assert.equal(ascendStalled({ points: [{ x: 0, y: 54, z: 0 }, { x: 0, y: 54, z: 0 }, { x: 0, y: null, z: 0 }, { x: 0, y: 54, z: 0 }, { x: 0, y: 54, z: 0 }, { x: 0, y: 54, z: 0 }] }), false,
    'a missing y inside the window is a lost reading, not a stall')
  assert.equal(ascendStalled({ points: [{ x: 0, y: 54, z: 0 }, { x: 0, y: 54, z: 0 }, { x: 0, y: NaN, z: 0 }, { x: 0, y: 54, z: 0 }, { x: 0, y: 54, z: 0 }, { x: 0, y: 54, z: 0 }] }), false)
  // custom knobs honoured
  assert.equal(ascendStalled({ points: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }], minPasses: 2 }), true)
  assert.equal(ascendStalled({ points: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 1.2, z: 0 }, { x: 0, y: 1.4, z: 0 }], minPasses: 2 }), false,
    'movement above the epsilon breaks the stall')
  assert.equal(ascendStalled({ points: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 1.04, z: 0 }, { x: 0, y: 1.08, z: 0 }], minPasses: 2, epsilon: 0.05 }), true,
    'a bigger epsilon distinguishes drift from stall')
})

test('ceilingCell: the block above the head (the submerged lane calls it under water only)', () => {
  // feet y=54.2: the bot occupies 54 and 55, the head cell reads water,
  // the ceiling is 56 = floor(y)+2
  assert.deepEqual(ceilingCell({ x: -137.4, y: 54.2, z: 427.9 }), { x: -138, y: 56, z: 427 },
    'a negative position floors DOWN into its block (the -137.4 cell IS block -138)')
  assert.deepEqual(ceilingCell({ x: 0, y: 0, z: 0 }), { x: 0, y: 2, z: 0 })
  assert.deepEqual(ceilingCell({ x: 12, y: 45, z: -9 }), { x: 12, y: 47, z: -9 })
  // junk positions read null - the caller keeps the jump-only shape
  assert.equal(ceilingCell(null), null)
  assert.equal(ceilingCell(undefined), null)
  assert.equal(ceilingCell('junk'), null)
  assert.equal(ceilingCell({}), null)
  assert.equal(ceilingCell({ x: 1, y: null, z: 3 }), null, 'a missing coordinate is a lost read (the Number(null) lesson)')
  assert.equal(ceilingCell({ x: NaN, y: 54, z: 3 }), null)
  assert.equal(ceilingCell({ x: 1, y: Infinity, z: 3 }), null)
})

test('the deep-pocket ascend wiring: the submerged branch asks the stall, digs the ceiling, budgets the dig', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('ascendStalled({ points: passPoints })'), 'the submerged branch reads the pass history')
  assert.ok(src.includes('ceilingCell(bot.entity?.position)'), 'the ceiling answer feeds blockAt')
  assert.ok(src.includes('ascendDigs < ASCEND_DIG_BUDGET'), 'the dig is budgeted (a thick roof cannot eat the whole 25s)')
  assert.ok(src.includes('ceil.diggable === true'), 'only explicitly diggable blocks are dug (junk/absent reads fall back)')
  assert.ok(src.includes('deep-pocket ascend'), 'the lane names itself so the next mine can count the digs')
  assert.ok(src.includes("'ascend dig'"), 'the dig rides the withTimeout fence (a lost race never hangs the rescue)')
  assert.ok(src.includes('let ascendDigs = 0'), 'the budget is per-rescue state (a fresh rescue restarts it)')
})

// (v0.127.0) THE HISTORY GUARD - run525 (35927155318) mined the poisoning:
// F14/F11/F15 died of drown with ZERO water lines. All three were respawned
// clients whose air metadata reads ~0 on dry land; the sentry pushed every
// in-domain read into the falling-bar history, so when the real drain started
// the history's tail led with those 0s and airBarFalling's first-last read
// NEGATIVE - the one lane built for the stale-dry-blocks flood never fired,
// and the streak lane sat behind its laddered cap (40 fresh reads). The guard
// keeps the glitch page out of the trend: a critical-on-DRY read is the liar
// ladder's evidence, never a slope.
test('historyAdmissible: the glitch page never enters the falling-bar history', () => {
  // the glitch page: critical on dry - no trend information, never enters
  assert.equal(historyAdmissible(0, 'dry'), false)
  assert.equal(historyAdmissible(2, 'dry'), false)
  assert.equal(historyAdmissible(4, 'dry'), false, 'the critical boundary itself is a page')
  // a critical read on wet/unknown contact is a REAL drain's slope - it enters
  assert.equal(historyAdmissible(0, 'wet'), true)
  assert.equal(historyAdmissible(2, 'unknown'), true)
  // above-critical reads always enter (any trust) - they are honest trend data
  assert.equal(historyAdmissible(20, 'dry'), true)
  assert.equal(historyAdmissible(12, 'dry'), true)
  assert.equal(historyAdmissible(5, 'dry'), true)
  assert.equal(historyAdmissible(9, 'wet'), true)
  // junk trust judges nothing - the read stays admissible (the domain gate still applies)
  assert.equal(historyAdmissible(0, null), true)
  assert.equal(historyAdmissible(0, undefined), true)
  assert.equal(historyAdmissible(0, 'WET'), true, 'junk trust never reads as dry')
  // the domain gate holds (the -1 reset sentinel, NaN, +-Infinity)
  assert.equal(historyAdmissible(-1, 'wet'), false)
  assert.equal(historyAdmissible(NaN, 'wet'), false)
  assert.equal(historyAdmissible(Infinity, 'wet'), false)
  assert.equal(historyAdmissible(-0.5, 'unknown'), false)
  // a junk critical option reads the default (4)
  assert.equal(historyAdmissible(4, 'dry', { critical: NaN }), false)
  assert.equal(historyAdmissible(5, 'dry', { critical: NaN }), true)
})

test('the run525 poisoning shape: the guard un-poisons the falling lane end to end', () => {
  // the old shape: glitch 0s (on dry) fill the history, the drain starts,
  // airBarFalling reads first(0) - last(8) NEGATIVE - dead silent.
  const glitchReads = [0, 0, 0, 0, 0, 0]
  const drainReads = [20, 14, 8]
  const raw = [...glitchReads, ...drainReads]
  assert.equal(airBarFalling(raw), false, 'the poisoned history never trends (the run525 shape)')
  // the guard: the glitch reads never entered (dry + critical), the refill and
  // the above-critical drain did (dry + >4) - the tail is a pure countdown.
  const guarded = raw.filter((o2, i) => historyAdmissible(o2, i < glitchReads.length ? 'dry' : 'dry' === 'dry' && o2 <= 4 ? 'dry' : 'dry'))
  assert.deepEqual(guarded, drainReads, 'only the above-critical drain readings survive the guard')
  assert.equal(airBarFalling(guarded), true, 'the falling lane fires on the guarded history')
  // the stale-dry-blocks flood (run104 F3 class): the head cell reads air the
  // whole way down, so every read is on DRY contact - the drain still trends
  // through its above-critical readings and pages at o2 <= RESCUE_LEVEL.
  const staleFlood = [20, 16, 12, 9].filter(o2 => historyAdmissible(o2, 'dry'))
  assert.deepEqual(staleFlood, [20, 16, 12, 9])
  assert.equal(airBarFalling(staleFlood), true)
  assert.equal(9 <= OXYGEN_RESCUE_LEVEL, true, 'the verdict fires the moment the falling lane and the rescue level meet')
})

test('the history guard wiring: the sentry pushes through historyAdmissible with one shared trust read', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('historyAdmissible(o2Now, contactTrust)'), 'the push reads the guard')
  assert.ok(src.includes('O2_HISTORY_CAP) o2History.shift()'), 'the cap rides the export (guard + cap ship together)')
  assert.ok(src.includes('const contactTrust = airBarTrust(read)'), 'the trust is read once per tick')
  assert.ok(src.includes('criticalOnDry = oxygenInDomain(o2raw) && o2raw <= OXYGEN_CRITICAL_LEVEL && contactTrust'), 'the streak reuses the same verdict (one read, one truth)')
  assert.ok(!src.includes('if (oxygenInDomain(o2Now)) { o2History.push'), 'the old unguarded push is gone')
})
