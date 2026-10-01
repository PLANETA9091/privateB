// (v0.379.0) THE WET-SENTINEL WATCH pins - an out-of-domain bar at a WITNESSED
// wet head is not air. Face 36799188224's F16 drowned INSIDE a running escape:
// the -1 reset sentinel disarmed the in-domain low-o2 watch (oxygenInDomain(-1)
// is false), the sentry's climb gate froze the wet clock ('rescue never',
// 'wet 0s@last' at a feet-water head-water death), and the lungs burned
// unwatched - the o2-RESET death class the 0900 fire named, the climb-lane
// variant. The cure: the climb's watch rides ONE pure gate (climbO2Watch) -
// the v0.85.0 floor arm byte-identical, the sentinel arm new; the v0.64.0 dry
// burst grace survives (no witness, no yield).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { climbO2Watch, CLIMB_ESCAPE_O2_FLOOR } from '../../src/lib/surface.mjs'
import { oxygenInDomain } from '../../src/lib/drowning.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('climbO2Watch: the low-o2 arm rides byte-identical (the v0.85.0 law)', () => {
  assert.deepEqual(climbO2Watch({ oxygen: 5, headWet: false }),
    { yield: true, reason: 'low-o2', o2: 5 },
    'an in-domain bar at the floor yields low-o2 with or without a witness')
  assert.equal(climbO2Watch({ oxygen: 5 }).reason, 'low-o2')
  assert.equal(climbO2Watch({ oxygen: 3 }).o2, 3)
})

test('climbO2Watch: the floor boundary and the healthy ride', () => {
  assert.equal(climbO2Watch({ oxygen: CLIMB_ESCAPE_O2_FLOOR }).yield, true,
    'AT the floor is the yield (the <= is the v0.85.0 contact)')
  assert.deepEqual(climbO2Watch({ oxygen: CLIMB_ESCAPE_O2_FLOOR + 1, headWet: true }),
    { yield: false, reason: null, o2: CLIMB_ESCAPE_O2_FLOOR + 1 },
    'one above the floor at a WET head keeps the escape - the sentinel arm needs an out-of-domain bar')
  assert.equal(climbO2Watch({ oxygen: 20, headWet: false }).yield, false)
})

test('climbO2Watch: the wet-sentinel arm - the F16 shape condemns', () => {
  assert.deepEqual(climbO2Watch({ oxygen: -1, headWet: true }),
    { yield: true, reason: 'wet-sentinel', o2: null },
    'the reset sentinel over a witnessed flood is the yield the F16 death needed')
  assert.equal(climbO2Watch({ oxygen: NaN, headWet: true }).reason, 'wet-sentinel',
    'NaN over water is the same blindness')
  assert.equal(climbO2Watch({ oxygen: undefined, headWet: true }).reason, 'wet-sentinel',
    'junk bar over water - the witness carries the condemnation')
  assert.equal(climbO2Watch({ headWet: true }).reason, 'wet-sentinel',
    'a missing bar is not air')
})

test('climbO2Watch: the v0.64.0 dry burst grace survives untouched', () => {
  assert.deepEqual(climbO2Watch({ oxygen: -1, headWet: false }),
    { yield: false, reason: null, o2: null },
    'the post-respawn burst class (395 reads measured) rides on dry land')
  assert.equal(climbO2Watch({ oxygen: NaN, headWet: false }).yield, false)
  assert.equal(climbO2Watch({ oxygen: '5', headWet: false }).yield, false,
    'a string bar is junk (the strict gate - never a measurement) and dry land never condemns')
})

test('climbO2Watch: the witness must be STRICT true (junk never condemns)', () => {
  for (const w of [null, undefined, NaN, 0, 1, 'wet', {}]) {
    assert.equal(climbO2Watch({ oxygen: -1, headWet: w }).yield, false,
      `witness ${String(w)} is not a water read - the burst rides`)
  }
  assert.equal(climbO2Watch({}).yield, false, 'no input at all - no yield')
})

test('climbO2Watch: junk floor falls back to the default', () => {
  assert.equal(climbO2Watch({ oxygen: CLIMB_ESCAPE_O2_FLOOR, floor: NaN }).yield, true,
    'junk config never widens the condemnation (the transitStalled discipline)')
  assert.equal(climbO2Watch({ oxygen: CLIMB_ESCAPE_O2_FLOOR, floor: -3 }).yield, true)
})

test('climbO2Watch: the oxygenInDomain doctrine is the shared spine', () => {
  assert.equal(oxygenInDomain(-1), false, 'the sentinel is out-of-domain (the v0.64.0 law)')
  assert.equal(oxygenInDomain(0), true, 'zero IS in-domain - a real empty bar')
  assert.equal(oxygenInDomain('5'), false, 'a string is never a measurement')
})

test('wet-sentinel wiring: both watch sites ride the pure gate', () => {
  assert.equal(minerSrc.split('climbO2Watch({ oxygen: bot.oxygenLevel').length - 1, 2,
    'the loop top AND the between-digs check call the gate (a dig can burn ~10s - one site leaves the other blind)')
  assert.ok(!minerSrc.includes('oxygenInDomain(o2Top)'), 'the inline loop-top check is gone')
  assert.ok(!minerSrc.includes('oxygenInDomain(o2Mid)'), 'the inline between-digs check is gone')
})

test('wet-sentinel wiring: the reason returns carry the gate verdicts', () => {
  const topIdx = minerSrc.indexOf('const wTop = climbO2Watch(')
  assert.ok(topIdx > 0, 'the loop-top gate exists')
  const topBlock = minerSrc.slice(topIdx, minerSrc.indexOf('const feet = bot.entity.position.floored()', topIdx))
  assert.ok(topBlock.includes('reason: wTop.reason'),
    'the yield returns the gate\'s reason (low-o2 AND wet-sentinel share the honest return)')
  const midIdx = minerSrc.indexOf('const wMid = climbO2Watch(')
  assert.ok(midIdx > topIdx, 'the between-digs gate sits after the loop top')
  const midBlock = minerSrc.slice(midIdx, minerSrc.indexOf('let broke = false', midIdx))
  assert.ok(midBlock.includes('reason: wMid.reason'), 'the dig-window return carries the gate too')
})

test('wet-sentinel wiring: the handoff names the blindness and refuses nothing', () => {
  const lineIdx = minerSrc.indexOf('oxygen unreadable (reset sentinel) at a wet head')
  assert.ok(lineIdx > 0, 'the handoff line names the sentinel blindness')
  const logCall = minerSrc.slice(minerSrc.lastIndexOf('log(', lineIdx), minerSrc.indexOf('\n', lineIdx))
  assert.ok(logCall.includes('the rescue lane owns the air'),
    'the line names the takeover (the low-o2 handoff doctrine)')
  const sentIdx = minerSrc.indexOf("if (esc.reason === 'wet-sentinel')")
  const lowIdx = minerSrc.indexOf("if (esc.reason === 'low-o2')")
  assert.ok(sentIdx > lowIdx > 0, 'the wet-sentinel handoff rides beside the low-o2 handoff')
  const sentBlock = minerSrc.slice(sentIdx, minerSrc.indexOf("if (esc.resumed) continue", sentIdx))
  assert.ok(sentBlock.includes("reason: 'wet-sentinel'"),
    'the climb ladder returns the reason honestly (climbRetryPlan\'s default refuses it - no retry)')
})

test('wet-sentinel wiring: the escape watch reads the head WITNESS, not the frozen tracker', () => {
  const topIdx = minerSrc.indexOf('const wTop = climbO2Watch(')
  const call = minerSrc.slice(topIdx, minerSrc.indexOf('\n', topIdx))
  assert.ok(call.includes('waterRead().head'),
    'the witness is a LIVE block read inside the escape (the sentry\'s headWetSince tracker is frozen by the climb gate - that freeze is the whale)')
  assert.ok(call.includes('isWaterName'), 'the witness rides the canonical water family')
})
