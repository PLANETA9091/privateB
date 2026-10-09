// THE WALK FLOOR'S OWN PREFLIGHT (v0.872.0) - the chain prices the walk
// BEFORE the visit, with the same ruler and the same grace.
//
// Face 138's budget-floor book named the front: the floor's refusals rode
// the MID-VISIT throw ('visit died mid-visit (budget exhausted (walk
// floor))') - the scan, the three ledger skips and the doom gate all paid
// their bytes for a verdict the floor already knew at pricing time. The
// preflight answers the visit's own walkOnce-entry question one gate
// earlier: chestWalkBudgetMs prices (the one-ruler law), effectiveWalkBudget
// floors against the chain's remaining clock, yardGraceGate peeks (the
// one-shot still rides INSIDE the visit only). A refusal names the chest
// clock-dead at the scan's own level ('chest skip (walk floor preflight:
// ...)') and the loop BREAKS - the scan is nearest-first and the ruler is
// monotonic in d, so a chest the clock cannot fund dooms every farther one
// (the v0.45.0 far-chest skip's own break law). Junk distance or an
// unbounded chain clock reads no preflight - the legacy visit decides.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { walkFloorPreflight, chestWalkBudgetMs, YARD_GRACE_FAR_DIST, YARD_GRACE_FAR_CAP_MS } from '../../src/lib/deposit.mjs'

test('the affordable verdict: the floor prices the walk in - the legacy visit runs', () => {
  // d=26 prices 30s (the ruler's base floor); a 40s clock funds it whole
  const pf = walkFloorPreflight({ dist: 26, remainingMs: 40000, graceUsed: false })
  assert.equal(pf.refuse, false)
  assert.equal(pf.pricedMs, 30000)
  assert.equal(pf.why, 'the floor prices the walk affordable')
  // the clamp branch: an 8s clock funds a CLAMPED walk (min(30000, 8000)) -
  // the visit's own byte: the floor only refuses below its 5s start floor
  const clamped = walkFloorPreflight({ dist: 26, remainingMs: 8000, graceUsed: false })
  assert.equal(clamped.refuse, false)
  assert.equal(clamped.pricedMs, 30000)
  // a near chest on a fat clock - the common at-the-yard shape
  const near = walkFloorPreflight({ dist: 6, remainingMs: 120000, graceUsed: false })
  assert.equal(near.refuse, false)
  // the cap end: d=120 prices the 60s cap, a 61s clock still funds it
  const capped = walkFloorPreflight({ dist: 120, remainingMs: 61000, graceUsed: false })
  assert.equal(capped.refuse, false)
  assert.equal(capped.pricedMs, 60000)
})

test('the grace-rescue verdict: the floor refuses but the grace would fund - the visit runs (the one-shot rides inside it)', () => {
  // the face-136 band: d 23..29 - the far class prices its 30s base floor,
  // the grace cap admits it (farMs <= YARD_GRACE_FAR_CAP_MS)
  const far = walkFloorPreflight({ dist: 26, remainingMs: 4000, graceUsed: false })
  assert.equal(far.refuse, false)
  assert.match(far.why, /^the grace would fund the walk \(the far walk is priced by its own ruler/)
  // the short class: d<=16 rides the flat 15s pardon
  const short = walkFloorPreflight({ dist: 10, remainingMs: 4000, graceUsed: false })
  assert.equal(short.refuse, false)
  assert.equal(short.why, 'the grace would fund the walk (the short walk is provably affordable)')
  // the preflight only PEEKS - the gate's grant here must not consume the
  // one-shot: the peek is a pure function, no holder is touched (the same
  // input twice reads the same verdict)
  const again = walkFloorPreflight({ dist: 26, remainingMs: 4000, graceUsed: false })
  assert.equal(again.refuse, false)
})

test('the envelope refusal: beyond the grace envelope the doom guard stands (spent clock, grace unused)', () => {
  // the envelope is the GRACE's business: a fat clock funds the walk whole
  // (the floor's clamp byte) and the envelope is never consulted - the
  // refusal fires only when the floor already refused and the gate is asked
  const pf = walkFloorPreflight({ dist: 45, remainingMs: 4000, graceUsed: false })
  assert.equal(pf.refuse, true)
  assert.equal(pf.pricedMs, 30000)
  assert.equal(pf.why, `d=45 prices 30s beyond the 4s left - d=45 beyond the grace envelope (${YARD_GRACE_FAR_DIST}) - the doom guard stands`)
  // the fat-clock byte: d=45 rides a clamped 30s visit exactly like d=26
  const funded = walkFloorPreflight({ dist: 45, remainingMs: 60000, graceUsed: false })
  assert.equal(funded.refuse, false)
  assert.equal(funded.why, 'the floor prices the walk affordable')
})

test('the grace-rode refusal: the one-shot spent, the floor verdict stands with its own why', () => {
  const pf = walkFloorPreflight({ dist: 26, remainingMs: 4000, graceUsed: true })
  assert.equal(pf.refuse, true)
  assert.equal(pf.why, 'd=26 prices 30s beyond the 4s left - the grace already rode (one-shot per chain)')
  // the envelope + rode compose in the gate's own priority order (graceUsed first)
  const both = walkFloorPreflight({ dist: 45, remainingMs: 1000, graceUsed: true })
  assert.equal(both.refuse, true)
  assert.match(both.why, /the grace already rode \(one-shot per chain\)$/)
})

test('the d=0 edge: the grace gate reads junk at d=0 and the preflight refuses exactly as the visit would', () => {
  // the visit byte: walkOnce entry floor 0 -> graceTopUp -> yardGraceGate
  // reads d<=0 as junk -> not granted -> 'budget exhausted (walk floor)'.
  // The preflight names the same death at the scan level.
  const pf = walkFloorPreflight({ dist: 0, remainingMs: 4000, graceUsed: false })
  assert.equal(pf.refuse, true)
  assert.match(pf.why, /the distance reads junk - affordability unproven$/)
})

test('the junk laws: no distance or an unbounded clock reads NO preflight - the legacy visit decides', () => {
  for (const dist of [null, undefined, NaN, -3, '12', {}]) {
    const pf = walkFloorPreflight({ dist, remainingMs: 1000, graceUsed: false })
    assert.equal(pf.refuse, false, `dist=${String(dist)} does not preflight`)
    assert.equal(pf.why, 'no distance read - the legacy visit decides')
  }
  const unbounded = walkFloorPreflight({ dist: 45, remainingMs: Infinity, graceUsed: false })
  assert.equal(unbounded.refuse, false)
  assert.equal(unbounded.why, 'the chain clock is unbounded - the legacy visit decides')
  const legacy = walkFloorPreflight({ dist: 45, remainingMs: undefined, graceUsed: false })
  assert.equal(legacy.refuse, false)
})

test('the monotonic fence: the refusal set is exactly d>40 (spent clock, grace unused) - a clock-deaf chest dooms every farther one', () => {
  // the ruler itself is monotonic non-decreasing
  let prev = -1
  for (let d = 0; d <= 120; d++) {
    const priced = chestWalkBudgetMs(d)
    assert.ok(priced >= prev, `priced monotonic at d=${d}`)
    prev = priced
  }
  // a fat clock: NOTHING refuses - the floor funds every distance (the clamp
  // byte), the grace envelope is never consulted when the floor passes
  for (let d = 0; d <= 60; d++) {
    const pf = walkFloorPreflight({ dist: d, remainingMs: 60000, graceUsed: false })
    assert.equal(pf.refuse, false, `d=${d} rides the funded visit`)
  }
  // a spent floor (1s left): refuse iff the grace cannot rescue - beyond the
  // envelope, or d=0 where the gate's own junk clause reads no proof
  for (let d = 0; d <= 60; d++) {
    const pf = walkFloorPreflight({ dist: d, remainingMs: 1000, graceUsed: false })
    assert.equal(pf.refuse, d === 0 || d > YARD_GRACE_FAR_DIST, `d=${d} rescue set matches the envelope (minus the junk d=0)`)
  }
  // the grace rode + a spent floor: EVERY distance refuses (the storm's break law)
  for (let d = 0; d <= 60; d++) {
    const pf = walkFloorPreflight({ dist: d, remainingMs: 1000, graceUsed: true })
    assert.equal(pf.refuse, true, `d=${d} refuses with the grace spent`)
  }
  // the grace rode + a fat clock: NO distance refuses (the clamp funds all)
  for (let d = 0; d <= 60; d++) {
    const pf = walkFloorPreflight({ dist: d, remainingMs: 60000, graceUsed: true })
    assert.equal(pf.refuse, false, `d=${d} rides the clamped visit`)
  }
})

test('WIRING: the chain calls the preflight before the visit, the line rides the chest-skip family, the loop breaks', () => {
  const src = readFileSync(new URL('../../src/lib/deposit.mjs', import.meta.url), 'utf8')
  const chain = src.slice(src.indexOf('export async function depositToChests'))
  // the call site exists and passes the shared holder's own state
  assert.match(chain, /const pf = walkFloorPreflight\(\{ dist: dPf, remainingMs: remaining\(\), graceUsed: yardGrace\.used === true \}\)/)
  // the refusal line joins the 'chest skip' filter-key family (zero fleet wiring)
  assert.match(chain, /chest skip \(walk floor preflight: \$\{pf\.why\}\)/)
  // the break law: the loop BREAKS on a preflight refusal and names the
  // verdict in the report (the loop-top's own 'budget exhausted' byte)
  const block = chain.slice(chain.indexOf('THE WALK FLOOR\'S OWN PREFLIGHT'), chain.indexOf('MID-VISIT GUARD, arm 2'))
  assert.match(block, /if \(pf\.refuse\) \{\s*\n\s*log\(\`\[\$\{bot\.username \?\? 'bot'\}\] chest skip \(walk floor preflight: \$\{pf\.why\}\)\`\)\s*\n\s*reports\.push\('budget exhausted'\)[^\n]*\n\s*break\s*\n\s*\}/)
  // the gate order: after the vertical doom gate, before the mid-visit net
  const doomAt = chain.indexOf("chest skip (vertical doom: ")
  const pfAt = chain.indexOf('THE WALK FLOOR\'S OWN PREFLIGHT')
  const netAt = chain.indexOf('MID-VISIT GUARD, arm 2')
  assert.ok(doomAt > 0 && pfAt > doomAt && netAt > pfAt, 'the preflight sits between the doom gate and the visit net')
  // the fleet filter already carries the family - the line can never ride blind
  const fleet = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  assert.match(fleet, /chest skip/)
})

test('the grace envelope and cap pins ride untouched (the preflight adds no pin)', () => {
  assert.equal(YARD_GRACE_FAR_DIST, 40)
  assert.equal(YARD_GRACE_FAR_CAP_MS, 30000)
  assert.equal(chestWalkBudgetMs(26), 30000)
  assert.equal(chestWalkBudgetMs(45), 30000)
  assert.equal(chestWalkBudgetMs(120), 60000)
})
