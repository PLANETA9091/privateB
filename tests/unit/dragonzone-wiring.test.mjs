// The dragon zone's wiring pins (v0.225.0).
//
// The pure design (src/lib/dragonzone.mjs) shipped in v0.220.0 from the
// era forensics: both dragon magic kills sit ~2 blocks apart at y=49 (a
// FIXED anchor ~[100,49,1], not a chase). This fire wires the evacuation:
// the death registry (the server verb + the corpse pos, fleet-shared,
// capped) feeds dragonZoneAnchor each pass, and a bot whose position reads
// inDragonZone walks OUT along the away ray with one bounded gotoSafe.
// These pins read the SOURCE of both sides - the dusk wire's dead-wire
// class (run195) is only catchable at the call site, so the pins name every
// scalar the call must carry.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { dragonZoneExit, dragonZoneAnchor, inDragonZone, DRAGON_ZONE_RADIUS, DRAGON_ZONE_EXIT_MS, DRAGON_ZONE_EXIT_PAD, DRAGON_DEATH_LOG_CAP } from '../../src/lib/dragonzone.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

test('REGRESSION PIN: the death handler records the registry (the server authority only)', () => {
  assert.ok(minerSrc.includes('const dragonLog = dragonDeaths ?? []'),
    'the registry rides by reference (a solo default keeps a private log honest)')
  assert.ok(minerSrc.includes('dragonLog.push({ cause: serverDeath.verb, pos: { x: dpos.x, y: dpos.y, z: dpos.z }, at: Date.now() })'),
    'the record carries the server verb (the magic-kill signature) + the corpse pos + the clock')
  const authAt = minerSrc.indexOf('const verdict = inferenceVerdict(serverDeath')
  const pushAt = minerSrc.indexOf('dragonLog.push({ cause: serverDeath.verb')
  assert.ok(authAt > -1 && pushAt > authAt, 'the record sits INSIDE the fresh-server-line branch (the inference is noise for every cluster class)')
  assert.ok(minerSrc.includes('dragonLog.length > DRAGON_DEATH_LOG_CAP'), 'the cap rides the module constant (the registry never grows unbounded)')
})

test('REGRESSION PIN: the fleet imports the anchor, the predicate, the exit and the budget', () => {
  assert.match(fleetSrc, /import \{ dragonZoneAnchor, inDragonZone, dragonZoneExit, DRAGON_ZONE_EXIT_MS \} from '\.\.\/src\/lib\/dragonzone\.mjs'/,
    'the zone rides the import (the v0.207.0 precedent: the import line grows with the wiring)')
})

test('REGRESSION PIN: the registry is fleet-shared and passed into every miner', () => {
  assert.ok(fleetSrc.includes('const dragonDeaths = []'),
    'the array lives at the fleet scope (the zone is world geography - the records outlive every relog)')
  assert.match(fleetSrc, /createMiner\(\{[\s\S]*?dragonDeaths,/, 'the createMiner call passes the shared registry (the hazardLedger pattern)')
})

test('REGRESSION PIN: the consult carries every scalar (the run195 dead-wire class)', () => {
  const anchorCall = fleetSrc.match(/dragonZoneAnchor\(dragonDeaths\)/)
  assert.ok(anchorCall, 'the anchor clusters the SHARED registry')
  const predCall = fleetSrc.match(/inDragonZone\(\{ x: me\.x, y: me\.y, z: me\.z \}, dAnchor\)/)
  assert.ok(predCall, 'the predicate reads the bot live position against the anchor')
  const exitCall = fleetSrc.match(/dragonZoneExit\(\{ x: me\.x, y: me\.y, z: me\.z \}, dAnchor\)/)
  assert.ok(exitCall, 'the exit prices the goal from the same position read')
  const walkCall = fleetSrc.match(/gotoSafe\(miner\.bot, standGoalNear\(miner\.bot, goals, dGoal\.x, dGoal\.y, dGoal\.z, \{ range: 3 \}\), \{ timeoutMs: DRAGON_ZONE_EXIT_MS, label: 'dragonzone exit' \}\)/)
  assert.ok(walkCall, 'the walk rides the module budget, never a hardcoded number')
})

test('REGRESSION PIN: one line per entry, the flag resets when the bot reads out', () => {
  const lane = fleetSrc.match(/const dAnchor[\s\S]*?dragonEvacAnnounced = false\n        \}/)
  assert.ok(lane, 'the lane exists')
  assert.ok(lane[0].includes('if (!dragonEvacAnnounced)'), 'the line is flag-gated (the lastNightLog shape)')
  assert.ok(lane[0].includes('dragonEvacAnnounced = true'), 'the entry arms the flag')
  assert.ok(lane[0].includes('dragonEvacAnnounced = false'), 'the exit resets it (a second entry tells its own story)')
})

test('REGRESSION PIN: the consult precedes the churn pricing (safety outranks stance)', () => {
  const dragonAt = fleetSrc.indexOf('dragonZoneAnchor(dragonDeaths)')
  const churnAt = fleetSrc.indexOf('wetChurnPlan({ rescueEvents: churnEvents')
  assert.ok(dragonAt > -1 && churnAt > dragonAt, 'the zone consult sits BEFORE the voluntary-goal pricing')
})

test('REGRESSION PIN: the vacuous read is the design gate (no avoidance on an unmeasured zone)', () => {
  assert.ok(!fleetSrc.includes('dragonZoneAnchor([100, 49, 1]'), 'no hardcoded anchor (the zone is MEASURED, never assumed)')
  assert.ok(fleetSrc.includes('const inZone = !!(dAnchor && miner.bot.entity?.position'),
    'a null anchor reads out (no zone, no avoidance) - the predicate only consults behind the anchor gate')
})

test('dragonZoneExit: the goal sits radius + pad beyond the anchor along the away ray', () => {
  const anchor = { x: 100, y: 49, z: 1, count: 2 }
  // the bot stands due east of the anchor at the zone edge
  const g = dragonZoneExit({ x: 116, y: 49, z: 1 }, anchor)
  assert.ok(g, 'a real ray prices a real goal')
  assert.ok(Math.abs(g.x - (100 + DRAGON_ZONE_RADIUS + DRAGON_ZONE_EXIT_PAD)) < 1e-9, 'the east exit lands radius + pad east of the anchor')
  assert.ok(Math.abs(g.z - 1) < 1e-9, 'the ray keeps the axis (no drift)')
  assert.equal(g.y, 49, 'the goal keeps the bot own plane (the walk machinery prices the terrain)')
})

test('dragonZoneExit: an off-axis position prices the honest diagonal', () => {
  const anchor = { x: 100, y: 49, z: 1 }
  // 3-4-5 triangle: 12 east, 16 south = 20 out (beyond the 16 radius, inside the consult)
  const g = dragonZoneExit({ x: 112, y: 50, z: 17 }, anchor)
  assert.ok(g)
  const out = Math.hypot(g.x - 100, g.z - 1)
  assert.ok(Math.abs(out - (DRAGON_ZONE_RADIUS + DRAGON_ZONE_EXIT_PAD)) < 1e-9, 'the goal sits exactly radius + pad from the anchor regardless of direction')
})

test('dragonZoneExit: the degenerate ray reads null (on the anchor - no honest away direction)', () => {
  const anchor = { x: 100, y: 49, z: 1 }
  assert.equal(dragonZoneExit({ x: 100, y: 49, z: 1 }, anchor), null, 'the bot stands ON the anchor - the wiring holds one pass and re-reads')
})

test('dragonZoneExit: junk reads null (the wiring stays vacuous, never guesses)', () => {
  const anchor = { x: 100, y: 49, z: 1 }
  assert.equal(dragonZoneExit(null, anchor), null)
  assert.equal(dragonZoneExit({ x: NaN, y: 49, z: 1 }, anchor), null)
  assert.equal(dragonZoneExit({ x: 110, y: 49, z: 1 }, null), null)
  assert.equal(dragonZoneExit({ x: 110, y: 49, z: 1 }, { x: NaN, y: 49, z: 1 }), null)
})

test('the zone family stays coherent with the era forensics (the anchor reproduces)', () => {
  // the two measured kills (run30 F6 at [101,49,1], run29 F18 at [99,49,1])
  const deaths = [
    { pos: { x: 101, y: 49, z: 1 }, cause: 'was killed by Ender Dragon using magic' },
    { pos: { x: 99, y: 49, z: 1 }, cause: 'was killed by Ender Dragon using magic' }
  ]
  const a = dragonZoneAnchor(deaths)
  assert.ok(a)
  assert.equal(a.x, 100, 'the two kills 101+99 merge to the 100 anchor (the v0.220.0 design pin, re-proven at the wiring)')
  assert.equal(a.count, 2)
  assert.ok(inDragonZone({ x: 105, y: 50, z: 1 }, a), 'a bot near the anchor reads inside')
  assert.ok(!inDragonZone({ x: 117, y: 50, z: 1 }, a), 'the F12 VOID spot class (17b east) reads OUTSIDE the 16 radius - recorded, not speculated')
})

test('REGRESSION PIN: the constants keep the wiring shape', () => {
  assert.equal(DRAGON_DEATH_LOG_CAP, 128, 'era-proof headroom (2 deaths per era measured)')
  assert.equal(DRAGON_ZONE_EXIT_MS, 15000, 'one bounded gotoSafe per entry')
  assert.equal(DRAGON_ZONE_EXIT_PAD, 4, 'the arrival clears the zone with the sphere tolerance')
  assert.equal(DRAGON_ZONE_RADIUS, 16, 'the design radius is untouched (the wiring calibrates nothing)')
})
