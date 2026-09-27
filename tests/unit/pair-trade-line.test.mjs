// Tests for the pair trade line (v0.236.0).
//
// MEASURED (run36295859380, the v0.235.0 tree's fleet, COMPLETED SUCCESS but
// 11 deaths - the zombie melee gallery x7): every dead bot fought a PAIR AT
// REACH while the verdict counted the DETECT_RANGE census - F12 'fighting
// zombie_villager (dist 2.0, hp 13.0, 2 nearby)' -> 'verdict flipped to flee
// (hp 4.0)' one sentry gap later (a 9-hp drain vs 2 x ~2.5/s incoming while
// the swings stay 1 target per 0.65s cadence); F8 20.0 -> 6.3 vs its pair;
// F10 5.3 at the open; F4 10.3 -> 7.3. The counter-weight in the same run:
// F18 fought '3 nearby' and WON (mob down, 5 swings, hp 20.0 -> 18.5) - the
// extras sat at 5.3/7.5, OUT of the melee band (the drift-wait lines name
// them) - the DETECT_RANGE count was never the DPS. THE CURE: the verdict
// gains the reach-weighted census (attackersClose = hostiles within
// ENGAGE_RANGE) and yields 'flee' at the FIRST verdict when TWO hostiles
// are inside the melee band and the bar sits below SWARM_FLEE_HP - the same
// hp line the 3+ crowd already yields at, keyed on reach. Junk-safe: a
// missing/junk close count reads 0 and every legacy verdict rides byte for
// byte (a guessed close count must never flee a healthy fight).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { threatVerdict, threatVerdictLane, PAIR_SIZE, SWARM_FLEE_HP, SWARM_SIZE, ENGAGE_RANGE } from '../../src/lib/combat.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('THE F12 FACE: the pair at reach flees at the FIRST verdict (the 13.0 -> 4.0 drain never happens)', () => {
  // the exact open the log mined: 'fighting zombie_villager (dist 2.0, hp 13.0, 2 nearby)'
  const v = threatVerdict({ name: 'zombie_villager', dist: 2.0, hp: 13.0, attackers: 2, attackersClose: 2, dark: true, armed: true })
  assert.equal(v, 'flee', 'the pair line fires at hp 13.0 - nine hp of flee margin instead of the measured death')
  // the sibling faces from the same gallery: F8's pair drained 20 -> 6.3, F4's 10.3 -> 7.3
  assert.equal(threatVerdict({ name: 'zombie', dist: 2.5, hp: 6.3, attackers: 2, attackersClose: 2 }), 'flee', 'F8: the pair line owns the drained bar too')
  assert.equal(threatVerdict({ name: 'zombie', dist: 2.3, hp: 10.3, attackers: 1, attackersClose: 1 }), 'fight', 'F4 at the open: a SINGLE zombie in reach stays the fight (the land line owns the drain later)')
})

test('THE LEGACY BYTE: without the close census the verdicts are byte for byte', () => {
  const base = { name: 'zombie_villager', dist: 2.0, hp: 13.0, attackers: 2, dark: true, armed: true }
  assert.equal(threatVerdict({ ...base }), 'fight', 'missing attackersClose -> the legacy fight verdict')
  assert.equal(threatVerdict({ ...base, attackersClose: 0 }), 'fight', 'a zero close census -> the legacy fight verdict')
  assert.equal(threatVerdictLane({ ...base }), 'none', 'the lane mirror names nothing (flee iff lane, both directions)')
})

test('THE F18 WIN PRESERVED: the trio with the extras OUT of reach stays the fight', () => {
  // 'fighting zombie (dist 3.3, hp 20.0, 3 nearby)' won at 18.5 - the extras
  // sat at 5.3/7.5 (beyond ENGAGE_RANGE), only the fought mob was in reach
  const v = threatVerdict({ name: 'zombie', dist: 3.3, hp: 18.5, attackers: 3, attackersClose: 1, dark: true, armed: true })
  assert.equal(v, 'fight', 'one hostile in reach is the win class - the line needs TWO')
  assert.equal(threatVerdictLane({ name: 'zombie', dist: 3.3, hp: 18.5, attackers: 3, attackersClose: 1, dark: true, armed: true }), 'none', 'no lane fires on the win face')
  // the reach discriminator in isolation: a PAIR at census range with only
  // ONE in reach stays the fight below the line (the 3+ face at hp 13 flees
  // via the LEGACY swarm tier - pre-existing, not the pair line's doing)
  assert.equal(threatVerdict({ name: 'zombie', dist: 3.3, hp: 13.0, attackers: 2, attackersClose: 1, dark: true, armed: true }), 'fight', 'a pair at census range with one in reach fights (the reach discriminator)')
  assert.equal(threatVerdictLane({ name: 'zombie', dist: 3.3, hp: 13.0, attackers: 2, attackersClose: 1, dark: true, armed: true }), 'none', 'no pair-trade without TWO in reach')
  assert.equal(threatVerdict({ name: 'zombie', dist: 3.3, hp: 13.0, attackers: 3, attackersClose: 1, dark: true, armed: true }), 'flee', 'the 3+ face at hp 13 flees via the LEGACY swarm tier (byte for byte)')
})

test('THE LINE LIVES BELOW SWARM_FLEE_HP ONLY: a pair at a full bar is still the fight', () => {
  assert.equal(threatVerdict({ name: 'zombie', dist: 2.0, hp: 20.0, attackers: 2, attackersClose: 2, dark: true, armed: true }), 'fight', '20 hp vs a pair: the sword answer stands (the F18 evidence)')
  assert.equal(threatVerdict({ name: 'zombie', dist: 2.0, hp: SWARM_FLEE_HP, attackers: 2, attackersClose: 2, dark: true, armed: true }), 'fight', 'the edge is strict: AT the swarm line the fight stands')
  assert.equal(threatVerdict({ name: 'zombie', dist: 2.0, hp: SWARM_FLEE_HP - 0.1, attackers: 2, attackersClose: 2, dark: true, armed: true }), 'flee', 'one tick under the line the pair yields')
})

test('THE LANE MIRROR: pair-trade named, the legacy swarm keeps priority when both fire', () => {
  const args = { name: 'zombie', dist: 2.0, hp: 10.0, attackers: 3, attackersClose: 2, dark: true, armed: true }
  assert.equal(threatVerdictLane(args), 'swarm', 'the 3+ census lane keeps its attribution (the legacy byte for the decode counters)')
  assert.equal(threatVerdictLane({ ...args, attackers: 2 }), 'pair-trade', 'the reach-weighted lane is named when it is the first firing lane')
  // by-construction coherence: the verdict flees exactly when a lane is named
  assert.equal(threatVerdict(args), 'flee')
  assert.equal(threatVerdict({ ...args, attackers: 2 }), 'flee')
  assert.equal(threatVerdictLane({ name: 'zombie', dist: 2.0, hp: 20, attackers: 2, attackersClose: 2 }), 'none', 'the full-bar pair is a fight - the lane reads none')
})

test('THE LANE FAMILY KEEPS PRIORITY: creeper/unarmed/land/water/lens all fire before the pair line', () => {
  assert.equal(threatVerdictLane({ name: 'creeper', dist: 4.0, hp: 10.0, attackers: 2, attackersClose: 2 }), 'creeper-band', 'the creeper band is first (the F14@0.3 precedent)')
  assert.equal(threatVerdictLane({ name: 'zombie', dist: 2.0, hp: 4.0, attackers: 2, attackersClose: 2 }), 'land-flee', 'the land line owns the sub-8 bar (the legacy first lane)')
  assert.equal(threatVerdictLane({ name: 'drowned', dist: 2.0, hp: 10.0, attackers: 2, attackersClose: 2, inWater: true }), 'water-flee', 'the water yield outranks the pair line')
  assert.equal(threatVerdictLane({ name: 'skeleton', dist: 6.0, hp: 10.0, attackers: 2, attackersClose: 2, cooldown: true }), 'pair-trade', 'a live cooldown does not outrank the close pressure (both yield flee; the first lane names the trade)')
})

test('JUNK-SAFE: a guessed close count never flees a fight', () => {
  const base = { name: 'zombie', dist: 2.0, hp: 10.0, attackers: 2, dark: true, armed: true }
  assert.equal(threatVerdict({ ...base, attackersClose: null }), 'fight', 'null reads 0')
  assert.equal(threatVerdict({ ...base, attackersClose: NaN }), 'fight', 'NaN reads 0')
  assert.equal(threatVerdict({ ...base, attackersClose: '2' }), 'fight', 'a string census is junk (Number.isFinite refuses)')
  assert.equal(threatVerdict({ ...base, attackersClose: Infinity }), 'fight', 'Infinity is not a finite measurement')
  assert.equal(threatVerdict({ ...base, attackersClose: -1 }), 'fight', 'a negative census reads 0')
  assert.equal(threatVerdict({ ...base, attackersClose: 2.9 }), 'flee', 'a fractional census floors to its integer (2.9 -> 2 = the pair)')
  assert.equal(threatVerdictLane({ ...base, attackersClose: NaN }), 'none', 'the lane mirror refuses the same junk')
})

test('THE POISON LENS INTERPLAY: the pair line judges the SEEN bar (the lens drains before the trade)', () => {
  // hp 15 poisoned reads seen 11 (POISON_HP_BUDGET 4) - under the swarm line
  const v = threatVerdict({ name: 'zombie', dist: 2.0, hp: 15.0, attackers: 2, attackersClose: 2, poisoned: true, dark: true, armed: true })
  assert.equal(v, 'flee', 'the pair line spends the poisoned bar, not the raw one (the one-bar law)')
  assert.equal(threatVerdict({ name: 'zombie', dist: 2.0, hp: 19.0, attackers: 2, attackersClose: 2, poisoned: true, dark: true, armed: true }), 'fight', 'seen 15 >= 14: the pair fight stands even poisoned')
})

test('THE CONSTANTS SHAPE: PAIR_SIZE is two, the family shares the swarm line, the band is the engage band', () => {
  assert.equal(PAIR_SIZE, 2, 'the line needs TWO in reach (one is the win class)')
  assert.equal(SWARM_FLEE_HP, 14, 'one hp line for the whole crowd family (3+ at range, 2 at reach)')
  assert.equal(SWARM_SIZE, 3, 'the legacy census gate untouched')
  assert.equal(ENGAGE_RANGE, 5, 'the reach band is the verdict engage band (reach + lunge margin)')
})

test('THE WIRING PINS: the miner feeds the reach-weighted census at every verdict call site', () => {
  // the import rides ENGAGE_RANGE beside DETECT_RANGE
  assert.ok(/DETECT_RANGE, ENGAGE_RANGE, fleeResponse/.test(minerSrc), 'ENGAGE_RANGE rides the combat import')
  // countHostiles takes the range (the bare calls keep DETECT_RANGE)
  assert.ok(/function countHostiles \(range = DETECT_RANGE\)/.test(minerSrc), 'the census takes the range parameter')
  assert.ok(!/countHostiles\(DETECT_RANGE\)/.test(minerSrc), 'the legacy bare calls stay bare (the default IS DETECT_RANGE)')
  // all four verdict/lane sites pass the close census (the defendSelf
  // lane+verdict pair and the re-verdict verdict+lane pair)
  const sites = minerSrc.match(/attackersClose: countHostiles\(ENGAGE_RANGE\)/g) || []
  assert.equal(sites.length, 4, 'the close census rides all four verdict call sites (the defendSelf pair + the re-verdict pair)')
  // the pair line sits after the legacy swarm check in the pure policy (the attribution order)
  const combatSrc = readFileSync(new URL('../../src/lib/combat.mjs', import.meta.url), 'utf8')
  const swarmAt = combatSrc.indexOf('if (crowd >= SWARM_SIZE && seen < SWARM_FLEE_HP) return \'flee\'')
  const pairAt = combatSrc.indexOf('if (crowdClose >= PAIR_SIZE && seen < SWARM_FLEE_HP) return \'flee\'')
  assert.ok(swarmAt !== -1 && pairAt !== -1 && swarmAt < pairAt, 'the pair line sits AFTER the legacy swarm check (the swarm lane keeps priority)')
})
