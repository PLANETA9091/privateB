// THE ASK'S OWN WHY BOOK (pure, no bot dependencies - unit-testable).
//
// (v0.652.0) The delivery side's write-off got its why book (the v0.612.0
// why-suffix law, the v0.650.0 residual feed) - the ask side stayed BLIND:
// face 37249185472 (the v0.650.0 face, the water storm) read 36 dry
// 'budget spent' terminals and the mining surface could not say WHY - the
// ask ladder's walk-failure lines ('chest walk failed (...)', the decide
// class, the fleet goal ceiling, the water rescue interlock) ride NO census
// anywhere in decompose.mjs. The whys were on the face the whole time; the
// tool never joined them.
//
// This census joins, per bot, in file order (the log is chronological - the
// emitter's own convention, the death-ground's law):
//   - every walk-failure why the ask ladder names, classed;
//   - every 'budget spent (x/y units)' terminal, with its units-dry (y - x);
//   - the terminal's own pricing: the LAST why gathered since the bot's
//     previous terminal prices the dry units ('the last refusal wins - the
//     terminal truth', the v0.650.0 law's own convention). A terminal with
//     no why since the last one prices its dry units to NOTHING - missing
//     evidence is not a class (the junk never invents, the v0.203.0 law).
//
// The census reads the lines the ask block already owns: zero fleet wiring,
// zero new log lines (the v0.379.0/v0.647.0 mining-surface precedent). The
// next face prices the ask storm by name - the decide class, the ceiling
// class, the water interlock - and the next lever prices from DATA.

/** The ask's dry terminal: 'F9 fuel commons: budget spent (0/4 units)'. */
export const ASK_TERMINAL_RE = /^F\d+ (?:fuel|food) commons: budget spent \((\d+)\/(\d+) units\)$/

/** The ask ladder's walk-failure line: the first goto, the post-nudge retry. */
export const ASK_WHY_RE = /^F\d+ (?:fuel|food) commons: chest walk failed(?: after the nudge)? \((.+)\)$/

/**
 * The why classes, in match order (the first matching class owns the why -
 * the throttle's prose can name a timeout inside itself, the throttle IS
 * the front; the water interlock's parens can name a walk, the water IS the
 * front). The ceiling class owns BOTH jobqueue throttle skins (the v0.652.0
 * field read: 'fleet goal ceiling' x2 AND 'goal brake' x3 rode one face -
 * siblings of the same goal-budget throttle, the codebase's own vocabulary
 * names the family the goal brake - dropwalk.mjs's 'the goal brake's share').
 * The unnamed bucket keeps the grain lossless without inventing a class
 * (the v0.583.0 'unnamed' law).
 */
export const ASK_WHY_CLASSES = [
  { key: 'ceiling', re: /fleet goal ceiling|goal brake:/ },
  { key: 'water', re: /water rescue in progress/ },
  { key: 'decide', re: /Took to long to decide path to goal|No path to the goal/ },
  { key: 'timeout', re: /timeout after \d+ms/ }
]

const ZERO_CLASSES = () => ({ ceiling: 0, water: 0, decide: 0, timeout: 0, unnamed: 0 })

/** Which class owns this why string (junk / unknown -> 'unnamed'). */
export function askWhyClass (why) {
  if (typeof why !== 'string' || why.length === 0) return 'unnamed'
  for (const c of ASK_WHY_CLASSES) {
    if (c.re.test(why)) return c.key
  }
  return 'unnamed'
}

/**
 * The ask ladder's why census over a fleet log (array of lines or one big
 * string - junk-safe: non-strings judge nothing).
 *
 * @param {string|string[]|null} lines
 * @returns {{terminals: number, unitsDry: number, whys: {ceiling: number, water: number, decide: number, timeout: number, unnamed: number}, dryByWhy: {ceiling: number, water: number, decide: number, timeout: number, unnamed: number}}}
 */
export function askWhyCensus (lines) {
  const list = Array.isArray(lines) ? lines : (typeof lines === 'string' ? lines.split('\n') : null)
  const out = { terminals: 0, unitsDry: 0, whys: ZERO_CLASSES(), dryByWhy: ZERO_CLASSES() }
  if (!list) return out
  // per-bot pending whys since the bot's last terminal (the bot tag is the
  // join key - the cross-bot law: F5's whys never price F9's terminal)
  const pending = new Map()
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const whyM = ASK_WHY_RE.exec(raw)
    if (whyM) {
      const bot = raw.slice(0, raw.indexOf(' '))
      const klass = askWhyClass(whyM[1])
      out.whys[klass] += 1
      const arr = pending.get(bot)
      if (arr) arr.push(klass)
      else pending.set(bot, [klass])
      continue
    }
    const termM = ASK_TERMINAL_RE.exec(raw)
    if (termM) {
      const bot = raw.slice(0, raw.indexOf(' '))
      const took = Number(termM[1])
      const want = Number(termM[2])
      const dry = Number.isFinite(took) && Number.isFinite(want) && want > took ? want - took : 0
      out.terminals += 1
      out.unitsDry += dry
      const arr = pending.get(bot)
      const last = Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : null
      if (last !== null) out.dryByWhy[last] += dry
      pending.set(bot, [])
    }
  }
  return out
}
