// (v0.389.0) THE HONEST DEATH SWEEP - the old DEATHS keyword bucket printed
// prose as deaths (face 19's ZERO-death log carried the steer hazard defer's
// 'a death is a cost the deficit cannot repay' onto the death row). Tests
// feed the verbatim death lines from the held artifacts (face 15
// 36760275928: mob kills + the drowned-kill contexts; face 18 36799188224:
// the o2-reset drown pair) and the verbatim prose carriers from face 19
// (36802577873) - the pollution pins.
import { isDeathLine, deathSweep } from '../../src/lib/deathsweep.mjs'
import assert from 'node:assert'
import { test } from 'node:test'

// face 15 (36760275928) verbatim - the mob-kill announce and the
// drowned-kill context (the dry-shore arena the v0.373.0 split names).
const FACE15_MOB_ANNOUNCE = 'F5 [F5] died - respawning (cause: server: was slain by Spider [kind=mob by Spider] | inferred: spider@1.5 (0s before death at [-121,64,386]) [the inference corroborates the server verdict])'
const FACE15_DRYSHORE_CONTEXT = 'F14 [F14] death: drowned-kill context (dry-shore, y 61, feet air, head air, water none)'

// face 18 (36799188224) verbatim - the o2-reset drown pair.
const FACE18_F16_ANNOUNCE = 'F16 [F16] died - respawning (cause: server: drowned [kind=drown] | inferred: fall/env (0s before death at [-124,59,386]) [the inference is blind to this kind - the hint is noise by construction (the server kind stays the authority)])'
const FACE18_F16_CONTEXT = 'F16 [F16] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg walk, wet 0s@last)'
const FACE18_F11_CONTEXT = 'F11 [F11] death: drown context (o2 reset(-1), feet water, head water, rescue never, leg walk to a machine (sweep), wet 35s)'

// face 18 verbatim - the breath mirror's PROSE carries 'died' and 'death'
// (the o2 census's evidence, never a death row entry).
const FACE18_MIRROR_PROSE = "F16 [F16] water: breath mirror [controls-blind] - the wet-escape climb owned the controls but the sentry's sight died 36s before death - the o2 burned unwatched while the owner failed (the F14 36566021862 class: the snapshot was the blindness evidence) (o2 20, head dry/unknown, snapshot 35.8s old)"

// face 19 (36802577873) verbatim - the pollution pins: the ZERO-death face
// whose steer hazard defer prose printed as a fake death under the old sweep.
const FACE19_PROSE_DEATH = 'F13 steer hazard defer: coal_ore@-122,59,387 held behind the ledger (d 4.7) - the clean veins led (a death is a cost the deficit cannot repay, the tail keeps the option)'
const FACE19_HAZARD_FLEETWIDE = 'F1 [F1] water: hazard memorized at [-125,62,389] (1 live, fleet-wide)'
const FACE19_RESCUE_START = 'F9 [F9] drowning rescue start (drowning, o2 12, leg walk, pass 0)'

test('the announce anatomy: a mob kill reads as a death (face 15 verbatim)', () => {
  assert.equal(isDeathLine(FACE15_MOB_ANNOUNCE), true)
  const s = deathSweep([FACE15_MOB_ANNOUNCE])
  assert.equal(s.byKind.announce, 1)
  assert.equal(s.byKind.context, 0)
  assert.deepEqual(s.byBot, { F5: 1 })
})

test('the context anatomy: the drowned-kill dry-shore form reads as a death (face 15 verbatim)', () => {
  assert.equal(isDeathLine(FACE15_DRYSHORE_CONTEXT), true)
  const s = deathSweep([FACE15_DRYSHORE_CONTEXT])
  assert.equal(s.byKind.context, 1)
  assert.deepEqual(s.byBot, { F14: 1 })
})

test('face-18 pair: byBot and byKind aggregate the drown deaths', () => {
  const s = deathSweep([FACE18_F16_ANNOUNCE, FACE18_F16_CONTEXT, FACE18_F11_CONTEXT])
  assert.equal(s.deaths.length, 3)
  assert.deepEqual(s.byBot, { F16: 2, F11: 1 })
  assert.equal(s.byKind.announce, 1)
  assert.equal(s.byKind.context, 2)
})

test('the pollution pin: the face-19 prose carrier never reads as a death AND lands in the audit list', () => {
  assert.equal(isDeathLine(FACE19_PROSE_DEATH), false)
  const s = deathSweep([FACE19_PROSE_DEATH])
  assert.deepEqual(s.deaths, [])
  assert.deepEqual(s.keywordOnly, [FACE19_PROSE_DEATH])
})

test('the fleet-wide hazard line: not a death, and the water: anatomy keeps it out of the audit list', () => {
  const s = deathSweep([FACE19_HAZARD_FLEETWIDE])
  assert.deepEqual(s.deaths, [])
  assert.deepEqual(s.keywordOnly, [])
})

test('the breath mirror prose: not a death (the o2 census owns it), the water: exclusion holds', () => {
  const s = deathSweep([FACE18_MIRROR_PROSE])
  assert.deepEqual(s.deaths, [])
  assert.deepEqual(s.keywordOnly, [])
})

test('a FATAL-truncated announce is not anatomy-true but stays visible in the audit list', () => {
  const s = deathSweep(['F16 [F16] died - respaw'])
  assert.deepEqual(s.deaths, [])
  assert.equal(s.keywordOnly.length, 1)
  assert.match(s.keywordOnly[0], /^F16 \[F16\] died - respaw$/)
})

test('a rescue start never reads as a death (the drowning rescue exclusion lives on)', () => {
  const s = deathSweep([FACE19_RESCUE_START])
  assert.deepEqual(s.deaths, [])
  assert.deepEqual(s.keywordOnly, [])
})

test('the honest face-19 read: zero deaths, exactly one prose carrier', () => {
  const s = deathSweep([FACE19_PROSE_DEATH, FACE19_HAZARD_FLEETWIDE, FACE19_RESCUE_START, 'F3 [F3] water: pass 0 head=wet shore=none'])
  assert.deepEqual(s.deaths, [])
  assert.deepEqual(s.byBot, {})
  assert.deepEqual(s.byKind, { announce: 0, context: 0 })
  assert.deepEqual(s.keywordOnly, [FACE19_PROSE_DEATH])
})

test('junk battery: non-strings and empties never throw', () => {
  const s = deathSweep([null, undefined, 42, '', false])
  assert.deepEqual(s.deaths, [])
  assert.deepEqual(s.byBot, {})
  assert.deepEqual(s.keywordOnly, [])
  assert.deepEqual(deathSweep(undefined).deaths, [])
  assert.deepEqual(deathSweep('not an array').deaths, [])
  assert.equal(isDeathLine(null), false)
  assert.equal(isDeathLine(42), false)
})
