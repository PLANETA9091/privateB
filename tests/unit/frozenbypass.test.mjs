// (v0.265.0) THE BYPASS ECHO pins - the frozen-relog loop's fuel, named.
// Face 36365938885's F1 chain: the wet-frozen relog arms a frozen-return
// hold, but the SAME verdict's critical air (o2=0) reads as a bypass class -
// the hold voids ON ARRIVAL, the sentry re-pages within seconds, the wedge
// re-freezes, the wet verdict relogs again (four cycles, zero walks, the bot
// drowned in place). The loop was invisible on BOTH sides: the relog line
// promised a hold that was already void, and the bypass crossed the gate
// silently (the hold branch printed, the bypass branch never did).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  frozenBypassEcho, frozenReturnBypass, o2SensorLabel,
  OXYGEN_CRITICAL_LEVEL, frozenRelogDecision, frozenReturnGate
} from '../../src/lib/drowning.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')

test('frozenBypassEcho: an in-domain critical bar claims the void', () => {
  const line = frozenBypassEcho({ oxygen: 0 })
  assert.ok(typeof line === 'string' && line.length > 0, 'o2=0 must claim the void')
  assert.ok(line.includes('the critical bypass voids the armed hold on the next page'), 'the claim names the void')
  assert.ok(line.startsWith('o2=0'), 'the claim carries the labeled bar')
})

test('frozenBypassEcho: the critical boundary claims (<= the line, the gate mirror)', () => {
  assert.equal(typeof frozenBypassEcho({ oxygen: OXYGEN_CRITICAL_LEVEL }), 'string',
    'a bar AT the critical level bypasses the gate, so the echo must claim it')
  assert.equal(frozenBypassEcho({ oxygen: OXYGEN_CRITICAL_LEVEL + 1 }), null,
    'one tick above the line the hold lives - silence is the honest read')
})

test('frozenBypassEcho: a healthy bar is silent (the absence is the honest read)', () => {
  assert.equal(frozenBypassEcho({ oxygen: 20 }), null)
  assert.equal(frozenBypassEcho({ oxygen: 10 }), null)
})

test('frozenBypassEcho: the sentinel claims nothing (the -1 burst is out of the gate domain)', () => {
  assert.equal(frozenBypassEcho({ oxygen: -1 }), null,
    'the post-rescue burst is not a measurement - the gate refuses it, the echo must agree')
  assert.equal(o2SensorLabel(-1), 'reset(-1)', 'the sentinel renders NAMED where a label is printed (the v0.264.0 law)')
})

test('frozenBypassEcho: junk claims per the GATE\'s own arithmetic (the mirror, not a private opinion)', () => {
  // the gate\'s deployed arithmetic is Number(x): null -> 0 (critical, the hold
  // DOES void) while NaN/undefined/junk-strings -> NaN (out of domain, no
  // claim). The echo describes the gate\'s future - it must diverge NOWHERE.
  assert.equal(frozenBypassEcho({ oxygen: NaN }), null)
  assert.equal(frozenBypassEcho({ oxygen: undefined }), null)
  assert.equal(frozenBypassEcho({ oxygen: 'wet' }), null)
  assert.equal(frozenBypassEcho({ oxygen: {} }), null)
  assert.equal(frozenBypassEcho({}), null, 'no read at all: no claim')
  assert.equal(frozenBypassEcho({ oxygen: null }) !== null, frozenReturnBypass({ oxygen: null }),
    'null rides the gate\'s own Number(null)=0 law - the echo agrees with the gate, whatever the gate does')
})

test('frozenBypassEcho: THE MIRROR LAW - the echo and the gate agree on every input', () => {
  const table = [20, 19, 10, 5, OXYGEN_CRITICAL_LEVEL, 1, 0, -1, -5, NaN, Infinity,
    null, undefined, '0', '4', '20', 'wet', '', {}, [], true, false]
  for (const x of table) {
    assert.equal(frozenBypassEcho({ oxygen: x }) !== null, frozenReturnBypass({ oxygen: x }),
      `echo/bypass divergence at ${String(x)} - a claim about the gate that the gate does not honor is a lie`)
  }
})

test('frozenBypassEcho: the string-bar mirror renders the claim with a junk label (one read, one truth)', () => {
  // the gate's own arithmetic coerces ('0' -> 0 -> bypass TRUE: the hold WILL
  // void), so the claim must fire; the label stays STRICT (a string was never
  // a measurement - it renders '?'). Claim and label are each honest.
  const line = frozenBypassEcho({ oxygen: '0' })
  assert.ok(typeof line === 'string' && line.includes('the critical bypass voids'), 'the claim mirrors the gate behavior')
  assert.ok(line.includes('o2=?'), 'the label renders the read quality, not a fake number')
})

test('miner wiring: the relog line grows the verdict tail (the identity-extends precedent)', () => {
  assert.ok(minerSrc.includes('s (the frozen-return gate) - o2='), 'the tail joins AFTER the existing gate token - the legacy tokens keep their positions')
  assert.ok(minerSrc.includes('window=${frozenDownWindow ?? \'?\'}'), 'the condemning window rides the tail')
  assert.ok(minerSrc.includes('health=${bot.health ?? \'?\'}'), 'the health rides the tail')
  assert.ok(minerSrc.includes("frozenBypassEcho({ oxygen: frozenDownO2, headWet: frozenDownWet, underHold: true })"), 'the echo reads the bar captured at the verdict (v0.266.0 identity-extends: the verdict\'s wet + the hold arming ride the same mirror)')
})

test('miner wiring: the stand-down captures the bar and the window name', () => {
  assert.ok(minerSrc.includes('frozenDownO2 = read.oxygen'), 'the verdict\'s bar is captured at the stand-down site')
  assert.ok(minerSrc.includes("frozenDownWindow = frozenWindow !== FROZEN_WINDOW ? 'wet-critical fast' : 'legacy'"), 'the window is named (fast vs legacy)')
  assert.ok(minerSrc.includes('let frozenDownO2 = null'), 'the capture starts honest-null')
})

test('miner wiring: the gate-side bypass echo fires while armed, rate-limited (the 19-bot law)', () => {
  assert.ok(minerSrc.includes('frozen-return gate bypassed (critical read o2='), 'the bypass branch prints - the loop signature is visible on the reconnect side')
  assert.ok(minerSrc.includes('lastBypassEchoAt >= AIR_GLITCH_LOG_MS'), 'the echo rides the AIR_GLITCH_LOG_MS cadence')
  assert.ok(minerSrc.includes('frozenRelogStreaks.get(username) > 0 && now - lastBypassEchoAt'), 'the streak gates the echo (the loop signature, not every critical page)')
  assert.ok(minerSrc.includes('the armed hold voids on arrival, the rescue owns the clock'), 'the line names the void')
})

test('the F1 chain shape composed: wet-frozen at a dead bar relogs on verdict one AND claims the void', () => {
  // the exact F1 read from face 36365938885: frozen underwater, o2=0, head
  // WET, first verdict - the decision relogs immediately (the v0.96.0 law)
  // and the SAME read voids the hold the relog arms (the loop fuel, now
  // printed at the moment it is armed).
  const esc = frozenRelogDecision({ frozenStandDowns: 1, hasEntity: true, health: 8, headWet: true })
  assert.equal(esc.relog, true, 'the wet-frozen first verdict relogs (the drowning clock owns the client)')
  const echo = frozenBypassEcho({ oxygen: 0 })
  assert.ok(echo !== null && echo.includes('the loop fuel'), 'the same verdict\'s bar claims the void - the armed hold dies on arrival')
})

test('the hold branch stays byte-identical (the legacy shape pinned)', () => {
  assert.ok(minerSrc.includes('frozen-return gate holds the page'), 'the hold line survives untouched')
  assert.ok(minerSrc.includes('frozen-return gate clears - the rescue completed with living physics'), 'the clear line survives untouched')
})

// (v0.266.0) THE SENTINEL BLINDNESS CURE pins - face 36369215771's F9 chain:
// relog #3 armed 40s, the fresh client re-paged head WET with the v0.64.0
// reset burst on the bar (o2=-1), the bypass's domain law read the sentinel
// as 'not a measurement, not critical' - the hold kept the page, 'rescue
// never', the bot drowned with the sentry watching. The bypass reads the
// page's own class now.

test('frozenReturnBypass: the F9 shape - junk bar + head WET + the armed hold bypasses', () => {
  assert.equal(frozenReturnBypass({ oxygen: -1, headWet: true, underHold: true }), true,
    'the sentinel burst must not hold a drowning page - the drain clock outranks the walk window')
  assert.equal(frozenReturnBypass({ oxygen: NaN, headWet: true, underHold: true }), true,
    'the NaN junk family rides the same disjunct (a lost read with wet evidence)')
  assert.equal(frozenReturnBypass({ oxygen: 'lost', headWet: true, underHold: true }), true,
    'the string-bar junk family too (the 26.2 sensor lesson)')
})

test('frozenReturnBypass: the disjunct keeps its fences', () => {
  assert.equal(frozenReturnBypass({ oxygen: -1, headWet: false, underHold: true }), false,
    'a junk bar with a DRY head claims nothing - the dry bot is harmless where it stands')
  assert.equal(frozenReturnBypass({ oxygen: -1, headWet: true, underHold: false }), false,
    'no hold riding - no bypass concept (the legacy callers\' world)')
  assert.equal(frozenReturnBypass({ oxygen: -1 }), false,
    'the defaults keep the v0.265.0 law byte-true (junk never bypasses by itself)')
  assert.equal(frozenReturnBypass({ oxygen: 20, headWet: true, underHold: true }), false,
    'a healthy bar never bypasses - the wet-cycler disjunct needs a LOST read')
  assert.equal(frozenReturnBypass({ oxygen: 0 }), true,
    'the legacy critical call stays true (the F1 shape, the old law)')
  assert.equal(frozenReturnBypass({ oxygen: null }), true,
    'the Number(null)=0 mirror stays (the gate\'s own arithmetic, documented)')
})

test('frozenBypassEcho: the mirror grows the wet-cycler claim with the gate', () => {
  const line = frozenBypassEcho({ oxygen: -1, headWet: true, underHold: true })
  assert.ok(typeof line === 'string' && line.includes('the wet-cycler bypass voids the armed hold'),
    'the same inputs the gate sees claim the void - the mirror law holds')
  assert.ok(line.startsWith('o2=reset(-1)'), 'the label renders the sentinel NAMED (the strict label law)')
  assert.equal(frozenBypassEcho({ oxygen: -1 }), null,
    'the sentinel\'s refusal stands with defaults (the v0.265.0 pin intent)')
  assert.equal(frozenBypassEcho({ oxygen: -1, headWet: false, underHold: true }), null,
    'the dry-hold junk keeps its silence')
  const crit = frozenBypassEcho({ oxygen: 0, headWet: true, underHold: true })
  assert.ok(crit !== null && crit.includes('the loop fuel') && !crit.includes('wet-cycler'),
    'the domain-critical claim keeps its byte shape (the lane\'s F1 pin)')
})

test('the F9 chain composed: relog #3 arms 40s, the sentinel page bypasses, the echo claims it', () => {
  // the exact F9 read from face 36369215771: relog #3 -> hold 40s -> the
  // fresh client re-pages head WET, o2=-1 (the reset burst) -> the OLD gate
  // held the page ('rescue never', drowned); the NEW gate bypasses.
  const hold = frozenReturnGate({ consecutiveRelogs: 3 })
  assert.equal(hold, 40000, 'relog #3 arms the 40s hold (the doubling ladder)')
  const bypass = frozenReturnBypass({ oxygen: -1, headWet: true, underHold: true })
  assert.equal(bypass, true, 'the sentinel page crosses - the drowning clock owns the hold')
  const echo = frozenBypassEcho({ oxygen: -1, headWet: true, underHold: true })
  assert.ok(echo !== null && echo.includes('the sentinel is not safety evidence'),
    'the relog tail names the class at the moment it is armed')
})

test('miner wiring: the bypass reads the page\'s own class, the junk crossing prints its own line', () => {
  assert.ok(minerSrc.includes('frozenReturnBypass({ oxygen: o2raw, headWet, underHold: frozenHoldLive })'),
    'the gate\'s call carries the page\'s head-wet truth and the hold state')
  assert.ok(minerSrc.includes('frozen-return gate bypassed (wet cycler o2='),
    'the junk crossing prints the wet-cycler line (the loop signature, sentinel class)')
  assert.ok(minerSrc.includes('the sentinel is not safety evidence, the drowning clock outranks the hold'),
    'the line names the cure\'s law')
  assert.ok(minerSrc.includes('frozenBypassEcho({ oxygen: frozenDownO2, headWet: frozenDownWet, underHold: true })'),
    'the relog tail\'s echo mirrors the same inputs (the verdict\'s wet + the hold arming)')
})

// (v0.361.0) THE WET-RELOG LOOP BREAK pins - the echo's loop, CLOSED.
// Face 36740244530's F6 ladder: six consecutive wet-frozen relogs, the
// bypass echoes named the void at streaks 3/4/5 (o2 4 -> 1 -> 0), health
// 20 -> 18 -> 12.67, zero walk-outs - the relog lane was feeding the loop
// it exists to break. The cure: the wet first-verdict saver stands down
// once the streak proves the loop (FROZEN_RELOG_LOOP_CAP), the transient
// stall gets its grace, the legacy threshold still owns the next relog.
test('miner wiring: the loop-break decision reads the streak, the refusal prints its own line', () => {
  assert.ok(minerSrc.includes('consecutiveRelogs: frozenRelogStreaks.get(username) || 0'),
    'the decision call carries the bot\'s frozen-relog streak (a missing counter reads 0 - never breaks)')
  assert.ok(minerSrc.includes("esc.loopBreak === true"), 'the refusal has its own branch - it never falls through silently again')
  assert.ok(minerSrc.includes('frozen-relog loop break (#'), 'the loop-break line exists and names the streak')
  assert.ok(minerSrc.includes('the session rides the freeze, the sentry re-pages and the rescue re-verdicts'),
    'the line names the grace\'s owner and the backstop')
  const breakLine = minerSrc.split('\n').find(l => l.includes('frozen-relog loop break (#'))
  assert.ok(breakLine && !breakLine.includes('frozen client relog'),
    'the loop-break line stays OUT of the decompose.mjs relog counter\'s lane (it counts /frozen client relog/)')
  assert.ok(minerSrc.includes('headWet: frozenDownWet, consecutiveRelogs:'),
    'the decision call passes the streak in the same object literal as the verdict\'s wet (the F6 read, one call)')
})
