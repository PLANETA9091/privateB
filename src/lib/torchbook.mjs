//
// torchbook.mjs - THE TORCH LEDGER (v0.500.0)
// The light supply chain's own book. The torch lane is the fleet's
// biggest unowned voice: the prefix census over the stored faces 42+43
// puts 'craft torches:' at 441 rows plus 24 placement-streak lines -
// zero readers before this book (the fire-0130 gap survey, the
// fire-0200 pick).
//
// THE EMITTERS (one lane, two voices, one parser):
//   the craft supply lane - src/bots/tools.mjs ensureTorches: the
//   generic skips ('skip (no coal: sticks N coals N)' - THE COAL
//   FLOOR, 'skip (no spare sticks: ...)' - THE STICK FLOOR), the two
//   stick-drought rescue rungs ('stick-dry with logs held - one plank
//   conversion first' - the v0.180.0 LOGS RUNG; 'stick-dry but N
//   planks held - one stick batch first' - the v0.137.0 PLANK RUNG),
//   the torch-coal resupply ask ('pocket coal dry (sticks N) - the
//   torch-coal resupply asks the commons (N coal)' - the v0.269.0
//   pocket-closed economy's cure, one ask per cooldown), the honest
//   cap-decline ('skip (the pocket torch cap: held N of M - ...)',
//   zero field rows at n=2, class kept), the honest reserve-decline
//   ('the metal fuel reserve holds all N coal for the furnace (N raw
//   metal held)', zero field rows, class kept), the terminal
//   ('N batch(es) -> N torches (sticks N coals N[, the metal reserve
//   keeps M])' - the yield, the keeps-variant priced separately),
//   the craft failure ('craft did not land (held N torch(es))') and
//   the catch-all ('failed: <why>', the WIDE greedy capture - the
//   smelthold v0.491.0 lesson);
//   the placement lane - src/bots/miner.mjs: 'torch: the placement
//   did not land (<cls>) xN - the streak names itself once, a landing
//   re-arms it' (the streak's once-per-streak naming law, the class
//   captured - 'dry' is the field's voice at n=2).
//
// THE FIELD READ (faces 42+43, hand-traced then live-verified byte
// for byte): 465 events - 239 coal-floor skips (54% of the craft
// rows: THE COAL FLOOR IS THE TORCH LANE'S GATE), 115 stick-drought
// rescue rungs (76 plank + 39 logs - the stick drought's TWO lanes
// firing before every skip), 53 resupply asks to the commons (106
// coal asked), 23 terminals delivering 172 torches in 43 batches
// (7 rows kept the metal reserve's 22 coal), 4 craft no-lands, 24
// streak lines (x24, all 'dry'). The supply chain WORKS: the rungs
// and the resupply convert a 239-skip coal drought into 172 torches.
//
// Pure parser, unit-pinned (the pouncebook v0.498.0 shape); decompose
// is its field read. Mining-surface only: zero fleet wiring, zero new
// log lines - the v0.379.0 precedent. Junk-safe end to end:
// non-string rows skipped, a face with no torch lines reads the
// honest zero.
//

// ---- the craft supply lane (src/bots/tools.mjs) ----
// 'F9 [F9] craft torches: skip (no coal: sticks 4 coals 0)'
export const TORCH_COAL_SKIP_RE =
  /^(\S+) \[\1\] craft torches: skip \(no coal: sticks (\d+) coals (\d+)\)$/
// 'F1 [F1] craft torches: skip (no spare sticks: sticks 0 coals 1)'
export const TORCH_STICK_SKIP_RE =
  /^(\S+) \[\1\] craft torches: skip \(no spare sticks: sticks (\d+) coals (\d+)\)$/
// 'F9 [F9] craft torches: skip (the pocket torch cap: held 12 of 12 - sticks 3 coals 9)'
// (zero field rows at n=2 - the class kept)
export const TORCH_CAP_RE =
  /^(\S+) \[\1\] craft torches: skip \(the pocket torch cap: held (\d+) of (\d+) - sticks (\d+) coals (\d+)\)$/
// 'F3 [F3] craft torches: the metal fuel reserve holds all 4 coal for the furnace (18 raw metal held)'
// (zero field rows at n=2 - the class kept)
export const TORCH_RESERVE_RE =
  /^(\S+) \[\1\] craft torches: the metal fuel reserve holds all (\d+) coal for the furnace \((\d+) raw metal held\)$/
// 'F2 [F2] craft torches: stick-dry with logs held - one plank conversion first'
export const TORCH_LOGS_RUNG_RE =
  /^(\S+) \[\1\] craft torches: stick-dry with logs held - one plank conversion first$/
// 'F9 [F9] craft torches: stick-dry but 10 planks held - one stick batch first'
export const TORCH_PLANK_RUNG_RE =
  /^(\S+) \[\1\] craft torches: stick-dry but (\d+) planks held - one stick batch first$/
// 'F9 [F9] craft torches: pocket coal dry (sticks 1) - the torch-coal resupply asks the commons (2 coal)'
export const TORCH_RESUPPLY_RE =
  /^(\S+) \[\1\] craft torches: pocket coal dry \(sticks (\d+)\) - the torch-coal resupply asks the commons \((\d+) coal\)$/
// 'F9 [F9] craft torches: 1 batch(es) -> 4 torches (sticks 3 coals 9)'
// 'F3 [F3] craft torches: 1 batch(es) -> 4 torches (sticks 3 coals 16, the metal reserve keeps 3)'
export const TORCH_TERMINAL_RE =
  /^(\S+) \[\1\] craft torches: (\d+) batch\(es\) -> (\d+) torches \(sticks (\d+) coals (\d+)(?:, the metal reserve keeps (\d+))?\)$/
// 'F9 [F9] craft torches: craft did not land (held 0 torch(es))'
export const TORCH_NOLAND_RE =
  /^(\S+) \[\1\] craft torches: craft did not land \(held (\d+) torch\(es\)\)$/
// The catch-all (the WIDE greedy why - the smelthold lesson); the
// caller prices it as the honest error bucket.
export const TORCH_ERROR_RE =
  /^(\S+) \[\1\] craft torches: failed: (.+)$/

// ---- the placement lane (src/bots/miner.mjs) ----
// 'F9 [F9] torch: the placement did not land (dry) x1 - the streak names itself once, a landing re-arms it'
// The class vocabulary is the emitter's own torchLedger keys
// (dry / cell / wall / place) - the book reads exactly those, the
// field's voice at n=2 is all 'dry'.
export const TORCH_STREAK_RE =
  /^(\S+) \[\1\] torch: the placement did not land \((dry|cell|wall|place)\) x(\d+) - the streak names itself once, a landing re-arms it$/

function zeroBot () {
  return {
    coalSkips: 0, coalSkipSticks: 0, coalSkipCoals: 0,
    stickSkips: 0, stickSkipSticks: 0, stickSkipCoals: 0,
    capDeclines: 0,
    reserveDeclines: 0, reserveCoal: 0,
    logsRungs: 0,
    plankRungs: 0, plankRungPlanks: 0,
    resupplyAsks: 0, resupplyAskCoal: 0,
    terminals: 0, terminalBatches: 0, terminalTorches: 0, terminalMetalKept: 0,
    noLands: 0, noLandHeld: 0,
    errors: 0,
    streaks: 0, streakX: 0,
    total: 0
  }
}

function zeroTotals () {
  const t = zeroBot()
  t.torchBots = {}
  t.total = 0
  return t
}

/**
 * Read the torch lane's field book - the light supply's skips, its
 * rescue rungs, the resupply asks and the yield. Pure census: no
 * cross-line join, no opener required; every line classifies
 * independently.
 * @param {string[]} lines one fleet-log, all lines
 * @returns {{bots: Object<string, object>, totals: object}|null}
 *   null for a junk input (non-array); a face with no torch lines
 *   reads the honest zero (empty bots, zeroed totals).
 */
export function torchBook (lines) {
  if (!Array.isArray(lines)) return null
  const bots = {}
  const totals = zeroTotals()
  const bot = name => bots[name] ?? (bots[name] = zeroBot())
  for (const line of lines) {
    if (typeof line !== 'string') continue
    let m = TORCH_COAL_SKIP_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.coalSkips++; b.coalSkipSticks += Number(m[2]); b.coalSkipCoals += Number(m[3])
      b.total++
      continue
    }
    m = TORCH_STICK_SKIP_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.stickSkips++; b.stickSkipSticks += Number(m[2]); b.stickSkipCoals += Number(m[3])
      b.total++
      continue
    }
    m = TORCH_CAP_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.capDeclines++
      b.total++
      continue
    }
    m = TORCH_RESERVE_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.reserveDeclines++; b.reserveCoal += Number(m[2])
      b.total++
      continue
    }
    m = TORCH_LOGS_RUNG_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.logsRungs++
      b.total++
      continue
    }
    m = TORCH_PLANK_RUNG_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.plankRungs++; b.plankRungPlanks += Number(m[2])
      b.total++
      continue
    }
    m = TORCH_RESUPPLY_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.resupplyAsks++; b.resupplyAskCoal += Number(m[3])
      b.total++
      continue
    }
    m = TORCH_TERMINAL_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.terminals++; b.terminalBatches += Number(m[2]); b.terminalTorches += Number(m[3])
      if (m[6] != null) b.terminalMetalKept += Number(m[6])
      b.total++
      continue
    }
    m = TORCH_NOLAND_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.noLands++; b.noLandHeld += Number(m[2])
      b.total++
      continue
    }
    m = TORCH_ERROR_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.errors++
      b.total++
      continue
    }
    m = TORCH_STREAK_RE.exec(line)
    if (m) {
      const b = bot(m[1])
      b.streaks++; b.streakX += Number(m[3])
      b.total++
    }
  }
  for (const b of Object.values(bots)) {
    for (const k of Object.keys(b)) {
      if (k === 'total') continue
      totals[k] += b[k]
    }
    totals.total += b.total
    totals.torchBots[b.total] = (totals.torchBots[b.total] ?? 0) + 1
  }
  return { bots, totals }
}
