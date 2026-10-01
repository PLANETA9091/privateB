// v0.263.0 THE SUPPORT DIG-DOWN - the above-family FAILED walk's last mile,
// the lip dig-down mirrored up. THE RECORD (face 36359454749 attempt 2): the
// ledger read 'failed=94 (below x28, plane x30, above x36) lipDig=0' - the
// ABOVE family is the largest failing bucket, an above walk that times out
// buys ZERO (the drop rides the despawn on its ledge), and the lip dig can
// never fire on such a run (it arms only on a CONVERGED below arrival - the
// below family failed x28). THE CURE: when an above-family walk FAILS, dig
// the ONE solid block the DROP rests on - the drop falls 1-2 down its own
// column, passes the bot's plane, the ~1.5 magnet sweeps it mid-fall or it
// lands at the stance where the plane/below families converge on the next
// pass (the v0.182.0 re-classify doctrine). Fences (all measured, never new
// physics): the measured ledge class dy 1..3, a solid non-fluid support read,
// a 1..2 dry fall column (the LIP_DIG_MAX_AIR window mirrored up; 3+ = open
// shaft, the landing unknown - the v0.86.0 worst-read lesson), the bot within
// SUPPORT_DIG_REACH 2 of the fall column (horizontal). Junk law: a missing
// read never arms a dig. The dig never opens the bot's own footing: dy >= 1
// pins the support at the feet level or ABOVE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { supportDigWanted, supportDigRefusal, SUPPORT_DIG_MAX_AIR, SUPPORT_DIG_MIN_DY, SUPPORT_DIG_MAX_DY, SUPPORT_DIG_REACH, sweepDropRecord, belowResidueRow, lipDigWanted, LIP_DIG_MAX_AIR, DROP_GOAL_ABOVE_DY, DROP_GOAL_BELOW, DROP_GOAL_BELOW_DY, DROP_GOAL_DEEP_DY } from '../../src/lib/drops.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const minerSrc = readFileSync(join(here, '../../src/bots/miner.mjs'), 'utf8')

test('v0.263.0 fences: the happy ledge family arms - the measured class walks through', () => {
  assert.equal(SUPPORT_DIG_MAX_AIR, 2, 'the fall window mirrors the lip dig 1..2')
  assert.equal(SUPPORT_DIG_MIN_DY, 1, 'the drop rests a full cell UP - the measured ledge class')
  assert.equal(SUPPORT_DIG_MAX_DY, 3, 'the ledge cap - the v0.189.0 sample held +1.0..+2.1 (one +4.0 outlier refused)')
  assert.equal(SUPPORT_DIG_REACH, 2, 'the horizontal stand-off the fall must pass inside the magnet')
  assert.equal(supportDigWanted({ dy: 1, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 1.5 }), true, 'the +1.0 ledge, one air below, dry, close')
  assert.equal(supportDigWanted({ dy: 2.0, supportSolid: true, airBelow: 2, fluidBelow: false, distXZ: 2 }), true, 'the +2.0 ledge at the stand-off edge')
  assert.equal(supportDigWanted({ dy: 3, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 0 }), true, 'the cap edge dy 3, standing under the column')
})

test('v0.263.0 fences: the family gate - the plane/below drops keep their own cures', () => {
  assert.equal(supportDigWanted({ dy: 0.9, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 1 }), false, 'a sub-ledge dy is the plane land - the walk families own it')
  assert.equal(supportDigWanted({ dy: 0, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 1 }), false, 'dy 0 is the flat family')
  assert.equal(supportDigWanted({ dy: -1, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 1 }), false, 'the below family owns the lip dig')
  assert.equal(supportDigWanted({ dy: NaN, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 1 }), false, 'junk dy never arms (a missing read never arms an action)')
  assert.equal(supportDigWanted({ supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 1 }), false, 'a missing dy never arms')
  assert.equal(supportDigWanted({ dy: 3.1, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 1 }), false, 'beyond the cap the fall lands unmeasured')
  assert.equal(supportDigWanted({ dy: 4, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 1 }), false, 'the +4.0 outlier class refuses')
})

test('v0.263.0 fences: the support and column reads - junk never arms a dig', () => {
  assert.equal(supportDigWanted({ dy: 2, supportSolid: false, airBelow: 1, fluidBelow: false, distXZ: 1 }), false, 'a non-solid support refuses')
  assert.equal(supportDigWanted({ dy: 2, supportSolid: null, airBelow: 1, fluidBelow: false, distXZ: 1 }), false, 'an unreadable support refuses')
  assert.equal(supportDigWanted({ dy: 2, supportSolid: true, airBelow: 0, fluidBelow: false, distXZ: 1 }), false, 'sealed under the ledge - the fall has nowhere to go')
  assert.equal(supportDigWanted({ dy: 2, supportSolid: true, airBelow: 3, fluidBelow: false, distXZ: 1 }), false, 'an open shaft - the landing is unknown (the worst-read lesson)')
  assert.equal(supportDigWanted({ dy: 2, supportSolid: true, airBelow: NaN, fluidBelow: false, distXZ: 1 }), false, 'an unmeasured column refuses')
  assert.equal(supportDigWanted({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: true, distXZ: 1 }), false, 'a wet column refuses - water reads empty to the bbox probe')
  assert.equal(supportDigWanted({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: undefined, distXZ: 1 }), false, 'an unmeasured wet guard is a blind dig')
  assert.equal(supportDigWanted({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: 0, distXZ: 1 }), false, 'a truthy-junk wet guard refuses - only the exact false arms')
})

test('v0.263.0 fences: the stand-off gate - a far shake buys nothing', () => {
  assert.equal(supportDigWanted({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 2.1 }), false, 'outside the magnet stand-off refuses')
  assert.equal(supportDigWanted({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: -0.1 }), false, 'a negative stand-off is junk')
  assert.equal(supportDigWanted({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: Infinity }), false, 'a junk stand-off refuses')
  assert.equal(supportDigWanted({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: false }), false, 'a missing stand-off never arms')
})

test('v0.263.0 refusal instrument: every guard names itself, the wanted dig reads null', () => {
  assert.equal(supportDigRefusal({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 1.5 }), null, 'the happy family has no refusal to name')
  assert.equal(supportDigRefusal({ dy: NaN }), 'unmeasured dy', 'junk dy names itself')
  assert.equal(supportDigRefusal({ dy: 0.5, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 1 }), 'below the ledge class', 'the sub-ledge dy names the family fence')
  assert.equal(supportDigRefusal({ dy: 3.5, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 1 }), 'the ledge reads too high', 'the cap names itself')
  assert.equal(supportDigRefusal({ dy: 2, supportSolid: false, airBelow: NaN, fluidBelow: false, distXZ: 1 }), 'unmeasured support', 'a non-solid support falls through to the honest class (the caller pre-names air/fluid)')
  assert.equal(supportDigRefusal({ dy: 2, supportSolid: true, airBelow: NaN, fluidBelow: false, distXZ: 1 }), 'unmeasured air', 'an unreadable column names itself')
  assert.equal(supportDigRefusal({ dy: 2, supportSolid: true, airBelow: 0, fluidBelow: false, distXZ: 1 }), 'sealed under the ledge', 'the sealed fall names itself')
  assert.equal(supportDigRefusal({ dy: 2, supportSolid: true, airBelow: 3, fluidBelow: false, distXZ: 1 }), 'the fall reads open', 'the open shaft names itself')
  assert.equal(supportDigRefusal({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: true, distXZ: 1 }), 'wet column', 'the wet guard names itself')
  assert.equal(supportDigRefusal({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: 'junk', distXZ: 1 }), 'unmeasured wet guard', 'a junk wet guard names itself')
  assert.equal(supportDigRefusal({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 4 }), 'outside the stand-off', 'a far stance names itself')
  assert.equal(supportDigRefusal({ dy: 2, supportSolid: true, airBelow: 1, fluidBelow: false, distXZ: 'junk' }), 'unmeasured stand-off', 'a junk stand-off names itself')
})

test('v0.263.0 wiring: the shake lives at the ABOVE-family FAILURE site - the landed paths untouched', () => {
  const failIdx = minerSrc.indexOf("dropFails++")
  assert.ok(failIdx > -1, 'the failure site exists')
  const triageIdx = minerSrc.indexOf('if (range === DROP_GOAL_BELOW) {', failIdx)
  assert.ok(triageIdx > failIdx && triageIdx - failIdx < 1600, 'the ledger triage survives byte for byte')
  const shakeIdx = minerSrc.indexOf('if (dyWalk > DROP_GOAL_ABOVE_DY) {', triageIdx)
  // (v0.294.0) the above height split rides between the triage and the shake
  // (the band read is the triage's own extension) - the proximity bound grew
  assert.ok(shakeIdx > triageIdx && shakeIdx - triageIdx < 2600, 'the support consult rides the catch AFTER the triage - the above family only')
  const catchEnd = minerSrc.indexOf('// (v0.187.0) THE LIP DIG-DOWN', shakeIdx)
  assert.ok(catchEnd > shakeIdx, 'the shake closes before the lip block - the converged path never consults it')
  // (v0.418.0) the walked capture (~35 lines: posBefore + the walkedTail
  // build) joined the walk path BETWEEN the landed fast path and the shake -
  // the proximity window grew 4000 -> 8000. The ORDER law is unchanged: the
  // landed fast path precedes the catch, a skipped walk never shakes.
  const landedIdx = minerSrc.indexOf('landed = true', shakeIdx - 8000)
  assert.ok(landedIdx > -1 && landedIdx < shakeIdx, 'the landed fast path precedes the catch - a skipped walk never shakes')
})

test('v0.263.0 wiring: the probes anchor at the DROP support - one read, three consumers', () => {
  assert.match(minerSrc, /const supportCell = new Vec3\(Math\.floor\(d\.x\), Math\.floor\(d\.y\) - 1, Math\.floor\(d\.z\)\)/, 'the support is the cell under the DROP (the block the shake would open)')
  assert.match(minerSrc, /const supportSolid = !!\(support && support\.boundingBox === 'block' && !SHAFT_FLUID_NAMES\.has\(support\.name\)\)/, 'the solidity read mirrors the cover shape')
  assert.match(minerSrc, /const airSupport = supportSolid \? dropAheadBelow\(supportCell, \{ depth: 3 \}\) : null/, 'the fall probe reads the column under the SUPPORT, null when it cannot be read')
  assert.match(minerSrc, /const strikeSupport = supportSolid \? fluidStrikeBelow\(supportCell, \{ depth: 3 \}\) : null/, 'the wet probe reads the same honest column')
  assert.match(minerSrc, /const digParams = \{ dy: dyNow, supportSolid, airBelow: airSupport, fluidBelow: strikeSupport !== null, distXZ \}/, 'the gate consumes the stance-derived probes - dy from the CURRENT stance')
  const gateIdx = minerSrc.indexOf('if (supportDigWanted(digParams))')
  const digIdx = minerSrc.indexOf('await bot.fastDig(support)', gateIdx)
  assert.ok(digIdx > gateIdx && digIdx - gateIdx < 120, 'the dig uses the SAME support the probes measured - no re-read drift')
  assert.match(minerSrc, /try \{ await bot\.fastDig\(support\); supportDigs\+\+ \} catch \{ \/\* the shake is a bonus - never a failure \*\/ \}/, 'the shake is a bonus - a refused dig never fails the sweep')
})

test('v0.263.0 wiring: the refusal names the support classes BEFORE the legacy geometry classes', () => {
  const whyIdx = minerSrc.indexOf("const why = !support ? 'no support read'")
  assert.ok(whyIdx > -1, 'the composed refusal exists')
  const airIdx = minerSrc.indexOf("'the support reads air'", whyIdx)
  const fluidIdx = minerSrc.indexOf("'the support reads fluid'", whyIdx)
  const legacyIdx = minerSrc.indexOf(': supportDigRefusal(digParams)', whyIdx)
  assert.ok(airIdx > whyIdx && fluidIdx > airIdx && legacyIdx > fluidIdx, 'the order: no support read -> reads air -> reads fluid -> the legacy supportDigRefusal classes')
  assert.match(minerSrc, /if \(supportRefusals <= 2\) log\(`\$\{tag\} vein sweep: support dig refused - \$\{why\} \(air \$\{airSupport\}, dist \$\{distXZ\.toFixed\(1\)\}\$\{sealTail\}\)`\)/, 'the refusal rides the vein sweep key, capped at 2 like the lip (the v0.267.0 seal tail rides after the legacy tokens)')
})

test('v0.263.0 instruments: the honest line family and the ledger row extend', () => {
  assert.match(minerSrc, /if \(supportDigs > 0\) log\(`\$\{tag\} vein sweep: \$\{supportDigs\} support dig-down\(s\) - the failed ledge walk shook the drop loose, the fall carries it to the magnet`\)/, 'the honest line rides the vein sweep key')
  assert.match(minerSrc, /let supportDigs = 0/, 'the counter initializes with its siblings')
  assert.match(minerSrc, /let supportRefusals = 0/, 'the refusal counter initializes with its siblings')
  assert.match(minerSrc, /sd\.supportDig \+= supportDigs/, 'the ledger accumulates the shakes')
  assert.match(minerSrc, /stats\.sweepDrops = \{ sweeps: 0, picked: 0, failed: 0, below: 0, above: 0, above1: 0, aboveHigh: 0, deepSkip: 0, lipDig: 0, supportDig: 0, seal1: 0, seal2: 0, seal3: 0, sealNear: 0, sealFar: 0, ledgeCut: 0, sealCutTargets: 0, sealNearThin: 0, sealCutGap: 0, stanceStep: 0, stanceCut: 0 \}/, 'the stats seed grows the new counter (and the v0.267.0 seal histogram rides the tail; the v0.294.0 height bands join the head)')
  const row = belowResidueRow([{ sweeps: 2, picked: 10, failed: 3, below: 1, above: 2, deepSkip: 1, lipDig: 0, supportDig: 1 }])
  assert.match(row, /supportDig=1 seal1=0 seal2=0 seal3=0 near=0 far=0 cut=0 nthick=0 nthin=0 ngap=0 step=0 stepcut=0 above1=0 aboveHigh=0$/, 'the fleet row carries the tail token - the v0.205.0 precedent (existing tokens keep their positions)')
  assert.match(row, /deepSkip=1 lipDig=0 supportDig=1/, 'the extended identity: the old tokens byte-unchanged')
})

test('v0.263.0 ledger: junk floors and the clamped identity survive the extension', () => {
  const rec = sweepDropRecord({ sweeps: 3, picked: 12, failed: 5, below: 2, above: 9, deepSkip: 1, lipDig: -4, supportDig: 2 })
  assert.equal(rec.failed, 5, 'the raw counters pass through floored (the clamp lives in the row)')
  assert.equal(rec.above, 9, 'sweepDropRecord does not clamp - belowResidueRow owns the identity')
  assert.equal(rec.lipDig, 0, 'a negative counter floors at zero')
  assert.equal(rec.supportDig, 2, 'the new counter floors and passes')
  const clamped = belowResidueRow([{ failed: 5, below: 2, above: 9, supportDig: 2 }])
  assert.match(clamped, /failed=5 \(below x2, plane x0, above x3\)/, 'above claims the rest of failed - the identity below + plane + above == failed holds')
  assert.match(clamped, /supportDig=2 seal1=0 seal2=0 seal3=0 near=0 far=0 cut=0 nthick=0 nthin=0 ngap=0 step=0 stepcut=0 above1=0 aboveHigh=0$/, 'the clamped row still carries the tail token')
  const junk = sweepDropRecord()
  assert.equal(junk.supportDig, 0, 'no-arg tolerates - the null guard lives at the row caller (r ?? {}, the v0.203.0 shape)')
  assert.equal(belowResidueRow([null, undefined, {}]), 'sweep drop ledger: sweeps=0 picked=0u failed=0 (below x0, plane x0, above x0) deepSkip=0 lipDig=0 supportDig=0 seal1=0 seal2=0 seal3=0 near=0 far=0 cut=0 nthick=0 nthin=0 ngap=0 step=0 stepcut=0 above1=0 aboveHigh=0', 'the all-junk row keeps its shape with the new tokens (the v0.267.0 histogram rides the tail)')
})

test('v0.263.0 the lip dig block is UNTOUCHED - the mirror does not bend the original', () => {
  assert.equal(LIP_DIG_MAX_AIR, 2, 'the lip window stays')
  assert.equal(DROP_GOAL_BELOW_DY, -0.5, 'the plane fence stays (the v0.191.0 edge)')
  assert.equal(DROP_GOAL_DEEP_DY, -2, 'the deep fence stays (the v0.182.0 sphere limit)')
  assert.equal(DROP_GOAL_ABOVE_DY, 0, 'the ledge fence stays (the v0.189.0 mirror)')
  assert.match(minerSrc, /const coverCell = feet\.offset\(0, -1, 0\)/, 'the lip cover anchor byte-unchanged (the v0.259.0 cure)')
  assert.match(minerSrc, /if \(lipDigWanted\(lipParams\)\)/, 'the lip gate byte-unchanged')
  assert.equal(lipDigWanted({ range: DROP_GOAL_BELOW, airBelow: 1, fluidBelow: false, dy: -1 }), true, 'the lip gate still arms its own family')
})
