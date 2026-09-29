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
  assert.ok(drownSrc.includes('if (best.turns === passing[0].turns) {'),
    'the first passing candidate scoring farthest returns the byte-true legacy shape (the v0.307.0 lens adds foesVetoed ONLY when it moved the pick - the no-foes outcome stays field-identical)')
})

test('REGRESSION PIN: both flee call sites carry the threat coords', () => {
  // the kite hop site (v0.307.0 re-pin: the second-hostile census joins the call)
  assert.ok(minerSrc.includes('tx: hopT.x, tz: hopT.z, threatX: threat.entity.position.x, threatZ: threat.entity.position.z, foes: otherHostiles(threat.entity) })'),
    'the kite-hop vetting reads the threat live AND the second-hostile census (the tangent classes died where the coords were missing, the delivery-era pair kills where the foes were missing)')
  // the away-vector site
  assert.ok(minerSrc.includes('tx: raw.x, tz: raw.z, threatX: threat.entity.position.x, threatZ: threat.entity.position.z, foes: otherHostiles(threat.entity) })'),
    'the away-vector vetting reads the threat live AND the census (the geometric law keeps the on-axis away flee byte-true, the vetoed one turns distance-aware, the second mob joins the score)')
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

test('REGRESSION PIN: the second-hostile lens rides both flee call sites (v0.307.0)', () => {
  // face 36535536162: the bot mid-evasion of mob A killed by mob B - the
  // vetting read the second mob NOWHERE. Both sites feed the census and both
  // name the lens reason before the legacy water/hazard line (else-if order:
  // the override > the lens > the water/hazard).
  const sites = minerSrc.split('foes: otherHostiles(threat.entity)').length - 1
  assert.equal(sites, 2, 'the kite hop AND the away-vector sites read the second-hostile census')
  assert.ok(minerSrc.includes('const foes = []'), 'the census helper builds its own list (junk entity reads skipped)')
  assert.ok(minerSrc.includes('e === threatEntity'), 'the census excludes the threat itself (the v0.298.0 threat term stays the score floor)')
  assert.ok(minerSrc.includes('(the second hostile vetoes the yard target)'), 'the kite site names the lens reason on the same flee line family')
  assert.ok(minerSrc.includes('(the second hostile vetoes the away target)'), 'the away site names the lens reason on the same flee line family')
  const lensIdx = minerSrc.indexOf('v && v.foesVetoed')
  const waterIdx = minerSrc.indexOf('v && v.turns')
  const overIdx = minerSrc.indexOf('v && v.overrode')
  assert.ok(overIdx > -1 && lensIdx > overIdx && waterIdx > lensIdx, 'the else-if ladder: the override speaks first, then the lens, then the legacy rotation')
})
