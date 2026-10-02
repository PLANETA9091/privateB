// (v0.465.0) THE UPGRADE CENSUS - the tool ladder's own harvest counted.
// The toolupgrade flow prints one line per bot upgrade event: '<bot>
// [toolupgrade] [upgrade] upgraded: stone_pickaxe,wooden_shovel,...' - the
// tools the rung DELIVERED this face (the tier-defer steer's own promise,
// 'the upgrade rung restores the lead', priced by its other half). The line
// is name-bearing and nobody read it - the census counts the rung's output
// while tierDeferCensus counts its work list (face 42: 13 events, 0 for the
// deferred F16 - the defer's tail kept its option; face 40: 0 events, the
// calm face's silent ladder). One parser per emitter: UPGRADE_RE owns
// exactly that shape; the tool list is the join of the delivered names
// (split, trim, skip empties - any tools, not just the observed four).
// Junk-safe: non-lines skipped, non-array -> null. Pure: reads, never
// mutates.
export const UPGRADE_RE = /^(F\d+) \[toolupgrade\] \[upgrade\] upgraded: (.+)$/i

// upgradeCensus(lines) -> { upgrades, perBot, byTool, tools } | null
//   upgrades  total 'upgraded:' event count (one line = one bot's rung pass)
//   perBot    { F9: 2, ... } - the upgrading bots (the rung's customers)
//   byTool    { stone_pickaxe: 13, ... } - WHAT the ladder delivered
//   tools     total crafted-tool units across the events
export function upgradeCensus (lines) {
  if (!Array.isArray(lines)) return null
  const perBot = {}
  const byTool = {}
  let upgrades = 0
  let tools = 0
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const m = UPGRADE_RE.exec(line)
    if (!m) continue
    upgrades++
    perBot[m[1]] = (perBot[m[1]] || 0) + 1
    for (const tool of m[2].split(',').map(s => s.trim()).filter(Boolean)) {
      byTool[tool] = (byTool[tool] || 0) + 1
      tools++
    }
  }
  return { upgrades, perBot, byTool, tools }
}

// (v0.467.0) THE DEFER PROMISE JOIN - the tier-defer steer's own promise
// put to an order-aware test. The defer line's tail promises 'the tail
// keeps the option, the upgrade rung restores the lead'; the census rows
// read the work list and the delivery side by side, but the PROMISE is
// per-bot and positional: did a bot that deferred reach the rung AFTER
// its defer? One walk over the lines (the join reuses the two emitters'
// own REs - TIER_DEFER_RE and UPGRADE_RE - no new shape claimed): the
// bot's LAST defer index governs; an upgrade event after it = tookAfter,
// upgrades only before it = tookBeforeOnly (the defer outlived the rung),
// no upgrade events at all = kept (the option still held). Co-existence
// is reported, causation never guessed (the row does not know WHY the
// rung ran - the tail is the steer's own words). Junk-safe: non-lines
// skipped, non-array -> null. Pure: reads, never mutates.
import { TIER_DEFER_RE } from './tierdefer.mjs'

// deferPromise(lines) -> { deferringBots, tookAfter, tookBeforeOnly, kept,
//                           perBot } | null
//   deferringBots  bots with >= 1 defer line this face
//   tookAfter      deferred, then upgraded (the promise's live pass)
//   tookBeforeOnly upgraded before the last defer (the defer outlived it)
//   kept           no upgrade event this face (the option held)
//   perBot         { F16: 'kept' | 'took-after' | 'took-before-only', ... }
export function deferPromise (lines) {
  if (!Array.isArray(lines)) return null
  const lastDefer = {}
  const upgradeIdx = {}
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (typeof line !== 'string') continue
    const d = TIER_DEFER_RE.exec(line)
    if (d) {
      lastDefer[d[1]] = i
      continue
    }
    const u = UPGRADE_RE.exec(line)
    if (u) {
      (upgradeIdx[u[1]] = upgradeIdx[u[1]] || []).push(i)
    }
  }
  const perBot = {}
  let tookAfter = 0
  let tookBeforeOnly = 0
  let kept = 0
  for (const bot of Object.keys(lastDefer)) {
    const ups = upgradeIdx[bot] || []
    const after = ups.some(idx => idx > lastDefer[bot])
    const cls = after ? 'took-after' : (ups.length ? 'took-before-only' : 'kept')
    perBot[bot] = cls
    if (cls === 'took-after') tookAfter++
    else if (cls === 'took-before-only') tookBeforeOnly++
    else kept++
  }
  return { deferringBots: Object.keys(lastDefer).length, tookAfter, tookBeforeOnly, kept, perBot }
}

// (v0.468.0) THE VERDICT CENSUS - the upgrade lane's result lines counted,
// the counter-vs-words window named from the emitter's own code. The
// policy flow (toolupgrade.mjs) prints one verdict per run: '<bot> tool
// upgrade: OK -> <tier> (<detail>)' / 'failed'; the commune path prints
// its own '(commune)' variant. The detail NAMES the path: a kit list =
// the tier-raise craft (the delegation's words own the 'upgraded:' line
// for these), 'worn (left=N/M)' = the worn-replacement craft (the words
// NEVER speak here - the upgraded: emitter belongs to the healthy path
// only), 'already stone+' = the silent no-op the counter still counts.
// THE WINDOW (face 42's field read): counter 14 = tier 12 + worn 2 + noop
// 0 - the 2-extra mystery resolved as the worn class. One parser per
// emitter: VERDICT_RE owns the verdict shape; junk-safe, non-array null.
export const VERDICT_RE = /^(F\d+) tool upgrade(?: \(commune\))?: (OK|failed) -> (.+?) \((.+)\)$/i

// upgradeVerdicts(lines) -> { ok, failed, commune, tier, worn, noop, maxWear } | null
//   ok/failed  main-path verdict counts (the counter's own res.ok leg)
//   commune    commune-path verdict count (its own result line)
//   tier       ok verdicts whose detail is a kit list (the delegation path)
//   worn       ok verdicts with a 'worn (left=N/M)' detail (the swap craft)
//   noop       ok verdicts with 'already stone+' (the silent no-op)
//   maxWear    the smallest left= seen on worn verdicts (the closest call)
export function upgradeVerdicts (lines) {
  if (!Array.isArray(lines)) return null
  let ok = 0
  let failed = 0
  let commune = 0
  let tier = 0
  let worn = 0
  let noop = 0
  let maxWear = null
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const m = VERDICT_RE.exec(line)
    if (!m) continue
    const isCommune = /tool upgrade \(commune\):/i.test(line)
    if (isCommune) {
      commune++
      if (m[2].toLowerCase() === 'failed') continue
    } else if (m[2].toLowerCase() === 'failed') {
      failed++
      continue
    } else ok++
    const detail = m[4]
    const wm = /worn \(left=(\d+)\/(\d+)\)/i.exec(detail)
    if (wm) {
      worn++
      const left = Number(wm[1])
      if (maxWear === null || left < maxWear) maxWear = left
    } else if (/already stone\+/i.test(detail)) noop++
    else if (isCommune) { /* commune tier-craft: no kit list in its detail */ }
    else tier++
  }
  return { ok, failed, commune, tier, worn, noop, maxWear }
}

// (v0.470.0) THE VERDICT SPREAD - the verdict census's per-bot half. The
// face-level verdict row counts the classes, but the spread question is
// per-bot: does the worn class ride ONE bot (a local hazard or a dig-style
// signature) or spread across the lane? The lens keys the same VERDICT_RE
// per bot (one parser per emitter - no new shape claimed): perBot rows
// mirror the face-level classes (ok/tier/worn/noop/failed main-path,
// commune separated - the sums reconcile with upgradeVerdicts), wornBots
// in first-worn line order, and the closest call NAMES its bot
// (maxWearBot/maxWear - first occurrence wins ties, the line-order law).
// Co-existence reported, causation never guessed (the row does not know
// WHY a pick wore - dig mix, ground hardness, the craft's own dice).
// Junk-safe: non-lines skipped, non-array -> null. Pure: reads, never
// mutates.

// verdictSpread(lines) -> { bots, perBot, wornBots, maxWearBot, maxWear } | null
//   bots        distinct verdict-bearing bots on the lane
//   perBot      { F1: { ok, tier, worn, noop, failed, commune }, ... }
//   wornBots    bots with >= 1 worn verdict (first-worn line order)
//   maxWearBot  the bot holding the closest worn call (null when no worn)
//   maxWear     the smallest left= seen (the closest call's own number)
export function verdictSpread (lines) {
  if (!Array.isArray(lines)) return null
  const perBot = {}
  const wornBots = []
  let maxWear = null
  let maxWearBot = null
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const m = VERDICT_RE.exec(line)
    if (!m) continue
    const bot = m[1]
    const isCommune = /tool upgrade \(commune\):/i.test(line)
    const isFailed = m[2].toLowerCase() === 'failed'
    const row = perBot[bot] || (perBot[bot] = { ok: 0, tier: 0, worn: 0, noop: 0, failed: 0, commune: 0 })
    if (isCommune) {
      row.commune++
      if (isFailed) continue
    } else if (isFailed) {
      row.failed++
      continue
    } else row.ok++
    const detail = m[4]
    const wm = /worn \(left=(\d+)\/(\d+)\)/i.exec(detail)
    if (wm) {
      row.worn++
      if (!wornBots.includes(bot)) wornBots.push(bot)
      const left = Number(wm[1])
      if (maxWear === null || left < maxWear) {
        maxWear = left
        maxWearBot = bot
      }
    } else if (/already stone\+/i.test(detail)) row.noop++
    else if (isCommune) { /* commune tier-craft: no kit list in its detail */ }
    else row.tier++
  }
  return { bots: Object.keys(perBot).length, perBot, wornBots, maxWearBot, maxWear }
}

// (v0.471.0) THE PROMISE PERSISTENCE - the promise's cross-face leg. The
// deferPromise row reads ONE face (13/15 took-after across faces 41/39/42);
// the kept class left the standing question open: does a bot that held its
// option (deferred, never reached the rung) get there the NEXT face? The
// lens joins two faces' lines through the existing emitters only
// (TIER_DEFER_RE + UPGRADE_RE - no new shape): the prior face's kept bots
// are the roll call, the next face answers per bot - an upgrade event
// there = reached (the promise's persistence pass), reached after ANOTHER
// defer that the rung then answered = reached-after-defer (the strongest
// form: the option traded for the rung again), no upgrade events =
// still-held (the option survived two faces - the rung's cost, the honest
// read). Only the kept class governs (took-after already passed; the read
// is the kept bots' fate). Co-existence reported, causation never guessed.
// Junk-safe: non-array prev or next -> null. Pure: reads, never mutates.

// promisePersistence(prevLines, nextLines) ->
//   { keptBots, reached, reachedAfterDefer, stillHeld, perBot } | null
//   keptBots           the prior face's kept count (the roll call)
//   reached            kept bots with >= 1 upgrade event in the next face
//   reachedAfterDefer  the reached that deferred again AND took-after there
//   stillHeld          kept bots with zero upgrade events next face
//   perBot             { F16: 'reached-after-defer'|'reached'|'still-held' }
export function promisePersistence (prevLines, nextLines) {
  if (!Array.isArray(prevLines) || !Array.isArray(nextLines)) return null
  const prev = deferPromise(prevLines)
  if (!prev || prev.kept === 0) {
    return { keptBots: 0, reached: [], reachedAfterDefer: [], stillHeld: [], perBot: {} }
  }
  const next = deferPromise(nextLines)
  const nextUc = upgradeCensus(nextLines)
  const upgraded = nextUc ? nextUc.perBot : {}
  const perBot = {}
  const reached = []
  const reachedAfterDefer = []
  const stillHeld = []
  for (const bot of Object.keys(prev.perBot)) {
    if (prev.perBot[bot] !== 'kept') continue
    if (!((upgraded[bot] || 0) > 0)) {
      perBot[bot] = 'still-held'
      stillHeld.push(bot)
      continue
    }
    if (next && next.perBot[bot] === 'took-after') {
      perBot[bot] = 'reached-after-defer'
      reachedAfterDefer.push(bot)
    } else {
      perBot[bot] = 'reached'
      reached.push(bot)
    }
  }
  return { keptBots: prev.kept, reached, reachedAfterDefer, stillHeld, perBot }
}
