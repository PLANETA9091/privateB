//
// tablegate.mjs - THE TABLE GATE (v0.495.0)
// The tool chain's zero-point. The spare-table bootstrap (toolupgrade.mjs:
// no crafting_table in the pocket -> craft one on the 2x2 -> on refusal
// the plank rung converts a log -> retry -> 'spare table: crafted|FAILED')
// speaks ~30 lines across faces 42+43 with ZERO readers - and every
// downstream reader named its echo without reading the cause: the fight
// ledger priced the pickaxe tax, the recovery book read the 'tool
// recovery:' wrapper's table whys, the armory census tallied the sword
// lane's table refusals, countergap explicitly PINS OUT 'spare table:
// crafted' as an intermediate, and upgradecensus's VERDICT_RE owns the
// 'tool upgrade: failed -> ...' flow terminals. The gate's own anatomy
// was the unread half - this book reads it.
//
// THE WIRE: a pure census - every line classifies independently (no
// opener exists: F17/F13/F19's single 'spare table: crafted' has no
// preceding struggle line - the armory census's honest scope law).
//   the terminal: 'spare table: crafted' (the gate opened) / 'spare
//     table: FAILED' (the gate refused - the flow dies below);
//   the drought leg: 'craft crafting_table: no craftable recipe variant
//     (ingredients missing?)' - the 2x2 held no 4-of-one-type planks
//     (bare and [upgrade]-prefixed skins, one read);
//   the rescue rung: 'plank rung: converted A->B same-type planks (need
//     N, from <wood>)' - from/to are the plank counts, B-A the yield;
//   the stick rung: 'sticks: crafted (have N)';
//   the [upgrade] machinery's attempt anatomy: 'variant#V attemptA
//     failed: <why>' with the WIDE greedy why capture (the smelthold
//     v0.491.0 lesson) - 'timeout after Nms' prices the attempt, any
//     other why lands the honest other bucket; the all-variants verdict
//     echoes the last why (the tax's verdict, not extra time). The
//     machinery's stale-window grid recoveries are NOT tallied: the
//     same line also serves the camp furnace's plank crafts (face 42
//     shows 4 non-table windows) - the table-scoped book never counts
//     another lane's recovery.
//
// THE FIELD READ (faces 42+43, hand-traced then pinned byte-verbatim):
// face 42's six gates ALL opened - the three droughts rescued 3/3 by
// the plank rung (the oak_log converter); face 43's woodless pocket
// cannot pay: F4/F5 refused with zero plank rungs (F5's sticks-but-no-
// planks signature: 'sticks: crafted (have 5)' then 'FAILED' - the
// 2x2 needs 4 planks of ONE type, sticks do not substitute). The
// timeout tax: 4 attempts x 7s = 28s of variant machinery bought zero
// tables. The flow terminals ('tool upgrade: failed -> none (cannot
// make a spare table ...)') ride upgradecensus's VERDICT_RE - never
// claimed here; the recovery book's table whys are these refusals'
// downstream echo (prose in decompose, no cross-line join - the honest
// scope).
//
// Pure parser, unit-pinned (the armory census v0.494.0 shape); decompose
// is its field read. Mining-surface only: zero fleet wiring, zero new
// log lines. Junk-safe end to end: non-string rows skipped, a face with
// no table lines reads the honest zero (a table-less fleet is itself
// the read - the fists era's own signature).
//

// ---- the bootstrap's own terminal ----
export const TABLE_OK_RE = /^(F\d+) \[toolupgrade\] spare table: crafted$/
export const TABLE_FAIL_RE = /^(F\d+) \[toolupgrade\] spare table: FAILED$/

// ---- the legs ----
// The drought: the craft machinery's refusal skin (both the bare flow
// and the [upgrade]-prefixed machinery print it).
export const TABLE_DROUGHT_RE =
  /^(F\d+) \[toolupgrade\] (?:\[upgrade\] )?craft crafting_table: no craftable recipe variant \(ingredients missing\?\)$/
// The rescue rung: the log converter. from/to = the plank counts around
// the conversion; 'need' the craft's plank floor; 'from' the wood kind.
export const TABLE_RUNG_RE =
  /^(F\d+) \[toolupgrade\] plank rung: converted (\d+)->(\d+) same-type planks \(need (\d+), from ([a-z_]+)\)$/
// The stick rung.
export const TABLE_STICKS_RE = /^(F\d+) \[toolupgrade\] sticks: crafted \(have (\d+)\)$/

// The [upgrade] machinery's attempt anatomy - the WIDE greedy why
// capture (nested reasons die at the first ')' otherwise).
export const TABLE_ATTEMPT_RE =
  /^(F\d+) \[toolupgrade\] \[upgrade\] craft crafting_table: variant#(\d+) attempt(\d+) failed: (.+)$/
export const TABLE_ALLFAIL_RE =
  /^(F\d+) \[toolupgrade\] \[upgrade\] craft crafting_table: all (\d+) variant\(s\) failed, last: (.+)$/

/**
 * Price an attempt why: 'timeout after Nms' -> N, anything else -> 0
 * (the caller files it in the honest other bucket).
 * @param {string} why the captured why tail
 * @returns {number} milliseconds priced, 0 when the why is not a timeout
 */
export function timeoutMs (why) {
  const m = /timeout after (\d+)ms$/.exec(String(why ?? '').trim())
  return m ? Number(m[1]) : 0
}

function zeroBot () {
  return {
    ok: 0, failed: 0,
    droughts: 0, rungs: 0, rungPlanks: 0,
    sticks: 0, stickHolds: 0,
    attempts: 0, timeoutMs: 0, otherAttempts: 0, allFails: 0
  }
}

function zeroTotals () {
  return {
    ok: 0, failed: 0,
    droughts: 0, rungs: 0, rungPlanks: 0,
    sticks: 0, stickHolds: 0,
    attempts: 0, timeoutMs: 0, otherAttempts: 0, allFails: 0,
    total: 0
  }
}

/**
 * Read the table gate's own anatomy - the spare-table bootstrap's
 * terminals, its drought/rescue legs and the [upgrade] machinery's
 * timeout tax. Pure census: no cross-line join, no opener required.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {null|{bots: Object<string,object>, totals: object}}
 */
export function tableGate (lines) {
  if (!Array.isArray(lines)) return null
  const bots = {}
  const totals = zeroTotals()
  for (const line of lines) {
    if (typeof line !== 'string') continue
    let m = TABLE_OK_RE.exec(line)
    if (m) {
      const b = bots[m[1]] || (bots[m[1]] = zeroBot())
      b.ok++; totals.ok++
      continue
    }
    m = TABLE_FAIL_RE.exec(line)
    if (m) {
      const b = bots[m[1]] || (bots[m[1]] = zeroBot())
      b.failed++; totals.failed++
      continue
    }
    m = TABLE_RUNG_RE.exec(line)
    if (m) {
      const b = bots[m[1]] || (bots[m[1]] = zeroBot())
      const from = Number(m[2])
      const to = Number(m[3])
      b.rungs++
      b.rungPlanks += Math.max(0, to - from)
      totals.rungs++
      totals.rungPlanks += Math.max(0, to - from)
      continue
    }
    m = TABLE_STICKS_RE.exec(line)
    if (m) {
      const b = bots[m[1]] || (bots[m[1]] = zeroBot())
      b.sticks++
      b.stickHolds += Number(m[2])
      totals.sticks++
      totals.stickHolds += Number(m[2])
      continue
    }
    m = TABLE_DROUGHT_RE.exec(line)
    if (m) {
      const b = bots[m[1]] || (bots[m[1]] = zeroBot())
      b.droughts++; totals.droughts++
      continue
    }
    m = TABLE_ATTEMPT_RE.exec(line)
    if (m) {
      const b = bots[m[1]] || (bots[m[1]] = zeroBot())
      b.attempts++
      const ms = timeoutMs(m[4])
      if (ms > 0) b.timeoutMs += ms
      else b.otherAttempts++
      totals.attempts++
      if (ms > 0) totals.timeoutMs += ms
      else totals.otherAttempts++
      continue
    }
    m = TABLE_ALLFAIL_RE.exec(line)
    if (m) {
      const b = bots[m[1]] || (bots[m[1]] = zeroBot())
      b.allFails++; totals.allFails++
    }
  }
  totals.total = totals.ok + totals.failed + totals.droughts + totals.rungs +
    totals.sticks + totals.attempts + totals.allFails
  return { bots, totals }
}
