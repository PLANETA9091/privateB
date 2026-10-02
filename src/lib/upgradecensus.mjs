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
