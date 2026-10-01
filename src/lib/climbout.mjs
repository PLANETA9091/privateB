// (v0.420.0) THE CLIMB LENS - the vertical doom's verdict read. The 2230
// fire's brief asked the question the face-27 underground=21 class left
// open: is the doom gate WORKING (honest refusals of truly doomed shafts)
// or OVER-FIRING (climbable yards refused)? The climb out VERDICT lines
// answer it - and no census read them (the decompose counts the climb
// rise assist lines and bankCensus carries the doom ledger fleet-side;
// the verdicts themselves rode unread).
//
// THE EMITTER FAMILY (fleet19.mjs lines 1169-1200, ONE call site's
// seven shapes, verified verbatim against the held logs):
//   F8 climb out (pre-position): OK +11 levels (10 steps, 23 dug, 26s)
//   F7 climb out (wood trip): OK +16 levels (16 steps, 43 dug, 53s)
//   F9 climb out (trip): OK +14 levels (14 steps, 28 dug, 12 traversed, 38s)
//   F9 climb out (trip): failed - stalled [stage 2]
//   F9 climb out (pre-position): failed - timeout (traversed 11)
//   F9 climb out (pre-position): failed - exhausted (wait 47s)
//   F6 climb out (pre-position): failed - rescue owns the bot
//   F14 climb out (pre-position): failed - wet-sentinel
//   F9 climb out (bank): retry (escalated retry after stalled, fenced to 90s of the 150s the chain has left)
//   F9 climb out (bank): retry failed - stalled [stage 1]
//   F9 climb out (bank): no retry (the plan's own why)
//   F1 climb out (trip): <doom why> - the climb raises its target to the yard's level
// The arm is optional in the grammar (the endphase comments name an
// armless historical shape) - an armless verdict parses with arm null.
// The failure reason is the emitter's own interpolation order (wait,
// traversed, stage) - the reason itself never contains those parens
// (the held logs' why vocabulary: stalled 43, timeout 23, low-o 13,
// rescue owns the bot 8, wet wall 6, wet-sentinel 1).
//
// THE HONEST-VS-OVER-FIRING READ: a stalled-dominated histogram with a
// deep stage ladder and few OK reads the doom gate HONEST (the shafts
// truly refuse); OK lines' secs/dug price the cost that WAS payable
// (the v0.294.0 pricing: ~4.2s/level); the doom retargets count the
// gate's own re-pricing. The climb bridge/diag/pounce probe lines are
// miner.mjs's internal per-attempt detail - a DIFFERENT emitter, out of
// this lens's scope (one parser per emitter, the v0.409.0 law).
//
// Pure parser, unit-pinned (the hot-spot v0.419.0 shape); decompose is
// its field read. Mining-surface only: zero fleet wiring, zero new log
// lines - the v0.379.0 precedent. Junk-safe end to end: non-string rows
// skipped, absent classes read the honest zero.

function bump (map, key, n = 1) {
  if (key == null) return
  map[key] = (map[key] ?? 0) + n
}

// The failure why - the held logs' own vocabulary, most-specific-first.
// Multi-word whys are real ('rescue owns the bot', 'wet wall'); unknown
// lands in 'other' with the raw reason kept on the event (the
// honest-sweep law: named, never dropped).
export function classifyClimbWhy (reason) {
  if (typeof reason !== 'string') return null
  if (/^stalled/.test(reason)) return 'stalled'
  if (/^timeout/.test(reason)) return 'timeout'
  if (/^low-o/.test(reason)) return 'low-o'
  if (/^wet wall/.test(reason)) return 'wet-wall'
  if (/^wet-sentinel/.test(reason)) return 'wet-sentinel'
  if (/^rescue owns the bot/.test(reason)) return 'rescue-owns'
  if (/^exhausted/.test(reason)) return 'exhausted'
  if (/^stopped/.test(reason)) return 'stopped'
  if (reason === '') return 'other'
  return 'other'
}

// The head: bot, optional arm, the rest of the verdict. The arm is the
// call site's own reason label ('pre-position', 'trip', 'wood trip',
// 'bank') - the HYPHEN is real ('pre-position' is the field's dominant
// arm); armless shapes parse with arm null (the grammar's honesty).
export const CLIMB_OUT_RE = /^(F\d+) climb out(?: \(([a-z -]+)\))?: (.+)$/

// The OK tail - the emitter prints gained/steps/dug always, traversed
// only when the climb traversed, secs as a rounded integer. THE
// UNDEFINEDS SHAPE (the held logs' own): the emitter's
// `${r.secs?.toFixed(0)}s` prints the literal 'undefineds' when the
// result carried no secs (9 lines across three held faces) - the climb
// counts, its price stays unknown (secs null: the stamp never invents).
const CLIMB_OK_RE = /^(retry )?OK \+(\d+) levels \((\d+) steps, (\d+) dug(?:, (\d+) traversed)?, (?:(\d+)s|undefineds)\)$/

// The failure tail - the emitter's interpolation order: reason, then the
// optional (wait Ns), then the optional (traversed N), then the optional
// [stage N]. The lazy reason stops at the first optional group.
const CLIMB_FAIL_RE = /^(retry )?failed - (.*?)(?: \(wait (\d+)s\))?(?: \(traversed (\d+)\))?(?: \[stage (\d+)\])?$/

// The doom re-target tail - the gate's own re-pricing line.
const CLIMB_DOOM_RE = /^(.*) - the climb raises its target to the yard's level$/

export function parseClimbOut (line) {
  if (typeof line !== 'string') return null
  const m = line.match(CLIMB_OUT_RE)
  if (!m) return null
  const bot = m[1]
  const arm = m[2] ?? null
  const rest = m[3]
  const ok = rest.match(CLIMB_OK_RE)
  if (ok) {
    return {
      bot, arm,
      verdict: ok[1] ? 'retry-ok' : 'ok',
      gained: Number(ok[2]), steps: Number(ok[3]), dug: Number(ok[4]),
      traversed: ok[5] !== undefined ? Number(ok[5]) : null,
      secs: ok[6] !== undefined ? Number(ok[6]) : null,
    }
  }
  const fail = rest.match(CLIMB_FAIL_RE)
  if (fail) {
    return {
      bot, arm,
      verdict: fail[1] ? 'retry-failed' : 'failed',
      why: fail[2],
      whyClass: classifyClimbWhy(fail[2]),
      waitSecs: fail[3] !== undefined ? Number(fail[3]) : null,
      traversed: fail[4] !== undefined ? Number(fail[4]) : null,
      stage: fail[5] !== undefined ? Number(fail[5]) : null,
    }
  }
  const doom = rest.match(CLIMB_DOOM_RE)
  if (doom) {
    return { bot, arm, verdict: 'doom-retarget', why: doom[1] }
  }
  let pm = rest.match(/^retry \((.+)\)$/)
  if (pm) return { bot, arm, verdict: 'retry-plan', why: pm[1] }
  pm = rest.match(/^no retry \((.+)\)$/)
  if (pm) return { bot, arm, verdict: 'no-retry', why: pm[1] }
  // the head matched but the body escaped the grammar - the shape evolved;
  // the event rides unparsed (counted, never dropped) by the census.
  return { bot, arm, verdict: 'unparsed', raw: rest }
}

export function climbOutCensus (lines) {
  const out = {
    attempts: 0, ok: 0, failed: 0, retryOk: 0, retryFailed: 0,
    byArm: {}, byWhy: {}, byBot: {},
    gains: { n: 0, sum: 0, max: 0 },
    dug: { n: 0, sum: 0, max: 0 },
    secs: { n: 0, sum: 0, max: 0 },
    stages: { n: 0, max: 0 },
    retries: { plans: 0, noRetry: 0, byWhy: {} },
    doomRetargets: { n: 0, byWhy: {} },
    unparsed: 0,
  }
  if (!Array.isArray(lines)) return out
  for (const l of lines) {
    if (typeof l !== 'string') continue
    const e = parseClimbOut(l)
    if (!e) continue
    bump(out.byBot, e.bot)
    bump(out.byArm, e.arm ?? 'bare')
    if (e.verdict === 'ok' || e.verdict === 'retry-ok') {
      out.attempts++
      if (e.verdict === 'ok') out.ok++; else out.retryOk++
      out.gains.n++; out.gains.sum += e.gained; if (e.gained > out.gains.max) out.gains.max = e.gained
      out.dug.n++; out.dug.sum += e.dug; if (e.dug > out.dug.max) out.dug.max = e.dug
      // the undefineds shape's unknown price stays out of the pricing
      // (secs null) while the climb itself counts - the stamp never invents
      if (e.secs !== null) { out.secs.n++; out.secs.sum += e.secs; if (e.secs > out.secs.max) out.secs.max = e.secs }
      continue
    }
    if (e.verdict === 'failed' || e.verdict === 'retry-failed') {
      out.attempts++
      if (e.verdict === 'failed') out.failed++; else out.retryFailed++
      bump(out.byWhy, e.whyClass)
      if (e.stage !== null) { out.stages.n++; if (e.stage > out.stages.max) out.stages.max = e.stage }
      continue
    }
    if (e.verdict === 'retry-plan') { out.retries.plans++; bump(out.retries.byWhy, 'retry'); continue }
    if (e.verdict === 'no-retry') { out.retries.noRetry++; bump(out.retries.byWhy, 'no-retry'); continue }
    if (e.verdict === 'doom-retarget') { out.doomRetargets.n++; bump(out.doomRetargets.byWhy, e.why); continue }
    out.unparsed++
  }
  return out
}
