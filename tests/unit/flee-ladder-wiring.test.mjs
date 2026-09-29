// The threat-aware flee ladder's wiring pins (v0.298.0).
//
// run36507990221-mined (SUCCESS 19/19) still lost F17 and F6 to creeper
// explosions on one shared signature: the away bearing was water/hazard-
// vetoed, the first-pass rotation handed the flee a tangent arc, and the
// creeper closed straight through it (F17's flee never opened distance:
// 6.2 -> 1.7 -> boom). The pure cure (vettedFleeTargetAbs's threatX/
// threatZ ladder) ships in drowning.mjs; these pins read the CALL SITES -
// the dusk wire's dead-wire class (run195: the pure family passed, the
// field wiring omitted an arg) is only catchable at the source, so the
// pins name every scalar the calls must carry and the line the override
// must speak.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const drownSrc = readFileSync(new URL('../../src/lib/drowning.mjs', import.meta.url), 'utf8')

test('REGRESSION PIN: the drowning module owns the distance-aware ladder', () => {
  assert.ok(drownSrc.includes('const threatAware = Number.isFinite(threatX) && Number.isFinite(threatZ)'),
    'the ladder arms ONLY on a finite threat pair (junk degrades to the legacy first-pass, never to a judged 0)')
  assert.ok(drownSrc.includes("overrode: true, firstTurns: passing[0].turns"),
    'the override NAMES the first dry bearing (the rotated line without it would blame the water for the threat read)')
  assert.ok(drownSrc.includes('if (best.turns === passing[0].turns) return { x: best.x, z: best.z, turns: best.turns }'),
    'the first passing candidate scoring farthest returns the byte-true legacy shape (no extra fields)')
})

test('REGRESSION PIN: both flee call sites carry the threat coords', () => {
  // the kite hop site
  assert.ok(minerSrc.includes('tx: hopT.x, tz: hopT.z, threatX: threat.entity.position.x, threatZ: threat.entity.position.z })'),
    'the kite-hop vetting reads the threat live (the tangent classes died where the coords were missing)')
  // the away-vector site
  assert.ok(minerSrc.includes('tx: raw.x, tz: raw.z, threatX: threat.entity.position.x, threatZ: threat.entity.position.z })'),
    'the away-vector vetting reads the threat live (the geometric law keeps the on-axis away flee byte-true, the vetoed one turns distance-aware)')
})

test('REGRESSION PIN: the override speaks its own line, the water keeps its old one', () => {
  assert.ok(minerSrc.includes('combat: flee ladder ${v.firstTurns * 90}deg -> ${v.turns * 90}deg (the threat reads the yard rotation)'),
    'the kite-site override line names the ladder (the rotated line would blame the water/hazard)')
  assert.ok(minerSrc.includes('combat: flee ladder ${v.firstTurns * 90}deg -> ${v.turns * 90}deg (the threat reads the away rotation)'),
    'the away-site override line names the ladder')
  assert.ok(minerSrc.includes("if (v && v.overrode) log(`${tag} combat: flee ladder"),
    'the override line owns the branch BEFORE the legacy rotated line (else-if: one reason per hop)')
  assert.ok(minerSrc.includes('flee bearing rotated ${v.turns * 90}deg (water/hazard vetoes the away target)'),
    'the legacy water/hazard line survives for the non-override rotations (the log classes are a census)')
})
