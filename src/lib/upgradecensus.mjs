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
