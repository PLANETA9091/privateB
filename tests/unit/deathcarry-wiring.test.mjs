// The death carry wiring pins (v0.649.0).
//
// Face 37243173708 (the v0.645.0 fleet, mined with the v0.647.0 lens): the
// DEATH DROP CENSUS read 13 death-drop stakes (1235u at stake) and the arm
// join returned armed 1 / SILENT 12 (1216u) - the silent class GREW from the
// wet storm's 6-of-7 face. The F11 anatomy priced the rebuild hop: the whole
// post-death tail (approach -> deposits -> communes -> pre-position bank)
// died to a duplicate_login KICK with the loop top never re-reached, and at
// EVERY rebuild the carry read `{ spot, at }` and the seed restored
// `{ spot, at, attempted }` - the POCKET STAKE dropped at both hops (the
// v0.484.0 pile arm read `lastDeath.pocketU` -> undefined -> not-bypass:
// every post-rebuild big pile armed as an empty pocket). The cure rides the
// wiring: relootCarry (pure, src/lib/reloot.mjs) is the ONE shape both hops
// share, the seed keeps the stake, and the carry voice stamps the rebuild
// (one line per carried death - the silent class's rebuild face gets its
// own seat). The DEAD WIRING class is only catchable at the source: these
// pins name every seam the wire must touch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { relootCarry } from '../../src/lib/reloot.mjs'
import { relootPileVerdict } from '../../src/lib/reloot.mjs'

const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('REGRESSION PIN: the carry assignment rides relootCarry (the stake survives the rebuild hop)', () => {
  const carryAt = fleetSrc.indexOf('let deathCarry = null')
  assert.ok(carryAt > -1, 'the death carry declaration exists (the v0.203.0 block)')
  const prevDeathAt = fleetSrc.indexOf('const prevDeath = miner.lastDeath?.() ?? null')
  assert.ok(prevDeathAt > carryAt, 'the prev-death read sits in the attempt teardown')
  const carryCallAt = fleetSrc.indexOf('deathCarry = relootCarry(prevDeath)')
  assert.ok(carryCallAt > prevDeathAt, 'the carry rides relootCarry (v0.649.0) - not the old `{ spot, at }` literal')
  assert.ok(!/deathCarry = \(\{? ?spot|deathCarry = prevDeath/.test(fleetSrc), 'the old stake-dropping shapes are gone')
})

test('REGRESSION PIN: the seed restores the pocketU (the pile arm survives the rebuild)', () => {
  const seedAt = minerSrc.indexOf('lastDeath = {')
  const seedObjAt = minerSrc.indexOf('lastDeath = {\n      spot:', seedAt - 20) > -1 ? seedAt : seedAt
  assert.ok(seedObjAt > -1, 'the seed restore exists')
  const seedBody = minerSrc.slice(seedObjAt, seedObjAt + 700)
  assert.ok(seedBody.includes('pocketU:'), 'the seed body keeps the pocket stake (the v0.484.0 pile arm reads lastDeath.pocketU)')
  // the seeded stake rides the pile arm's own junk law: a junk stake reads null, never a free arm
  assert.equal(relootPileVerdict({ pileU: null }).bypass, false, 'a null stake never bypasses the unarmed delay')
  // and the carried stake DOES arm the big pile (the walk fills the pocket the delay waits for)
  const carried = relootCarry({ spot: { x: 1, y: 2, z: 3 }, at: 5, attempted: false, pocketU: 256 })
  assert.equal(relootPileVerdict({ pileU: carried.pocketU }).bypass, true, 'the carried 256u pile arms the walk after the rebuild')
})

test('REGRESSION PIN: the carry voice stamps the rebuild once per carried death', () => {
  const voiceAt = fleetSrc.indexOf('death carry: the un-attempted stake rides the rebuild')
  assert.ok(voiceAt > -1, 'the carry voice line exists (the silent class\'s rebuild face gets its seat)')
  const dedupAt = fleetSrc.indexOf('deathCarryAnnounced !== deathCarry.at')
  assert.ok(dedupAt > -1 && dedupAt < voiceAt, 'the voice dedups on the record clock (one line per carried death, not per rebuild)')
  const attemptGateAt = fleetSrc.indexOf('if (attempt > 0 && deathCarry && deathCarryAnnounced !== deathCarry.at)')
  assert.ok(attemptGateAt > -1, 'the voice rides the attempt>0 gate (a fresh spawn has nothing to carry)')
  const voiceBody = fleetSrc.slice(voiceAt - 400, voiceAt + 400)
  assert.ok(voiceBody.includes('pocketU != null'), "the stake's 'unknown' face rides the voice (never a fabricated 0)")
})
