// THE DRAGON ZONE (v0.220.0): dragonZoneAnchor + inDragonZone - the
// plan-first unit. The measured base: both era dragon kills pulled by the
// 01:00 fire's forensics - run30 F6 (36229765630) at [101,49,1] and run29
// F18 (36253378529) at [99,49,1], both 'was killed by Ender Dragon
// using magic', ~2 blocks apart at y=49: a FIXED ANCHOR (~[100,49,1]),
// not a chase. The pins hold the field kills byte-for-byte so the wiring
// lane's exclusion/shelter work stands on the measured anchor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dragonZoneAnchor, inDragonZone, DRAGON_ZONE_CLUSTER, DRAGON_ZONE_RADIUS } from '../../src/lib/dragonzone.mjs'

const pos = (x, y, z) => ({ x, y, z })
const death = (x, y, z, cause = 'was killed by Ender Dragon using magic') => ({ pos: pos(x, y, z), cause })

// THE FIELD KILLS - the forensics' two records, verbatim positions.
const RUN30_F6 = death(101, 49, 1)
const RUN29_F18 = death(99, 49, 1)

test('dragonZoneAnchor: the two field kills merge to the measured anchor [100,49,1]', () => {
  const a = dragonZoneAnchor([RUN30_F6, RUN29_F18])
  assert.deepEqual(a, { x: 100, y: 49, z: 1, count: 2 }, 'the era anchor - 101+99 -> 100 exact, y=49, z=1')
})

test('dragonZoneAnchor: a far kill does not merge - the largest cluster wins, the anchor holds', () => {
  const a = dragonZoneAnchor([RUN30_F6, RUN29_F18, death(140, 63, 60)])
  assert.equal(a.count, 2, 'the far kill forms its own cluster - the zone stays the measured pair')
  assert.equal(a.x, 100); assert.equal(a.y, 49); assert.equal(a.z, 1)
})

test('dragonZoneAnchor: a single magic kill names an anchor of its own (count 1)', () => {
  const a = dragonZoneAnchor([RUN30_F6])
  assert.deepEqual(a, { x: 101, y: 49, z: 1, count: 1 }, 'a lone sample still names the spot - the wiring calibrates whether it acts')
})

test('dragonZoneAnchor: non-magic causes never cluster - the zone reads ONLY the magic-kill class', () => {
  const deaths = [
    { pos: pos(101, 49, 1), cause: 'was slain by Zombie' },
    { pos: pos(99, 49, 1), cause: 'fell from a high place' },
    { pos: pos(100, 49, 1), cause: 'was killed by Ender Dragon' } // the no-magic truncation shape - NOT the signature
  ]
  assert.equal(dragonZoneAnchor(deaths), null, 'no magic kill - no zone, the predicate stays vacuous')
})

test('dragonZoneAnchor: junk records are skipped, honest nulls on nothing', () => {
  assert.equal(dragonZoneAnchor(null), null, 'no deaths at all')
  assert.equal(dragonZoneAnchor([]), null)
  assert.equal(dragonZoneAnchor('junk'), null, 'non-array -> null')
  assert.equal(dragonZoneAnchor([{ pos: null, cause: 'was killed by Ender Dragon using magic' }]), null, 'a missing pos is not a kill spot')
  assert.equal(dragonZoneAnchor([{ pos: pos(1, NaN, 2), cause: 'was killed by Ender Dragon using magic' }]), null, 'a junk axis is not a kill spot')
})

test('dragonZoneAnchor: the cluster radius is 8 - a kill at the merge edge joins, past it splits', () => {
  const edge = dragonZoneAnchor([RUN30_F6, death(101 + DRAGON_ZONE_CLUSTER, 49, 1)]) // exactly 8 apart
  assert.equal(edge.count, 2, 'the boundary is inclusive - 8.0 apart merges')
  const split = dragonZoneAnchor([RUN30_F6, death(101 + DRAGON_ZONE_CLUSTER + 0.5, 49, 1)])
  assert.equal(split.count, 1, '8.5 apart splits - the first-formed cluster wins the tie')
})

test('inDragonZone: the anchor ground and the measured kills read inside', () => {
  const a = dragonZoneAnchor([RUN30_F6, RUN29_F18])
  assert.equal(inDragonZone(pos(100, 49, 1), a), true, 'the anchor itself')
  assert.equal(inDragonZone(pos(101, 49, 1), a), true, 'run30 F6 stands in the zone')
  assert.equal(inDragonZone(pos(99, 49, 1), a), true, 'run29 F18 stands in the zone')
})

test('inDragonZone: the radius boundary is inclusive at 16, honest outside', () => {
  const a = dragonZoneAnchor([RUN30_F6, RUN29_F18])
  assert.equal(inDragonZone(pos(100 + DRAGON_ZONE_RADIUS, 49, 1), a), true, 'exactly 16 -> inside (avoidance errs toward avoiding)')
  assert.equal(inDragonZone(pos(100 + DRAGON_ZONE_RADIUS + 1, 49, 1), a), false, '17 -> outside')
  assert.equal(inDragonZone(pos(100, 49, 1 + DRAGON_ZONE_RADIUS), a), true, 'the z-axis rides the same radius')
})

test('inDragonZone: the vertical axis stays out - a bot directly above stands in the shadow', () => {
  const a = dragonZoneAnchor([RUN30_F6, RUN29_F18])
  assert.equal(inDragonZone(pos(100, 80, 1), a), true, 'horizontal 0 - the zone is the ground shadow')
})

test('inDragonZone: the gates - no anchor, junk anchor, junk pos all read false', () => {
  const a = dragonZoneAnchor([RUN30_F6, RUN29_F18])
  assert.equal(inDragonZone(pos(100, 49, 1), null), false, 'no zone measured - no avoidance, honest')
  assert.equal(inDragonZone(pos(100, 49, 1), undefined), false)
  assert.equal(inDragonZone(null, a), false, 'a junk position is not evidence of presence')
  assert.equal(inDragonZone(pos(100, NaN, 1), a), false)
  assert.equal(inDragonZone(pos(100, 49, 1), { x: NaN, y: 49, z: 1 }), false, 'a junk anchor is not a zone')
})
