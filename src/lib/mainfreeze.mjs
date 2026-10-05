/**
 * mainfreeze.mjs - (v0.661.0) THE MAIN FREEZE'S OWN ROW - the blackbox dump's
 * own census, pure. The mining-surface law says the face's own rows print
 * themselves (the v0.660.0 runs-row lesson), and the main-thread freeze is
 * the face's biggest single economy event with NO row of its own: the
 * heartbeat distress row carries only the gauge's max mainLate (a bare
 * number), while the '[blackbox] main freeze ~Ns; last: ...' dump (the
 * v0.62.0 ring, printed since the 51s deploy freeze named its blocker)
 * rode the logs unread by any census. MEASURED (fleet 37265374356, the
 * v0.660.0 tree face): the main thread froze ~53s at ts=561s - the
 * end-phase's own entry - with the ring's last NAMED activity
 * 'pf:queue fuel commons w'; the freeze's victims price the face's
 * economy: banked 55 of 1640 mined, the budget-floor zeros x18
 * (F10's 14 unplaced), the walk-timeout zeros x10, the chest-unreachable
 * storm x34 - the cadence froze inside the one window that had to deliver.
 *
 * THE LAWS:
 *   - the freeze line's grammar (two eras): '[blackbox] main freeze ~<N>s;
 *     last: <chain>' with the v0.77.0 oscillating scope's tail '; loop:
 *     timers=<T> imm=<M>/<W>s (<verdict>)' OPTIONAL - the older dumps end
 *     at the chain (the honest net reads 'unscoped', never a guessed
 *     verdict);
 *   - the culprit-naming law (the ring's own purpose: the last activity
 *     names the blocker): the chain's segments ('label @<age>s', joined by
 *     ' <- ') read in order and the FIRST segment whose label is not
 *     'other' names the freeze, verbatim (zero transformation - the age's
 *     raw '+-4.7' double sign is the dump's own bytes); a chain of nothing
 *     but 'other' segments names 'none' (unlabeled ticks name nothing);
 *   - the position law: the freeze pairs with the most recent
 *     'b] n=<k> ts=<s>s' pulse gauge BEFORE it (the heartbeat prints the
 *     gauge, then the blackbox dump rides the same unfreeze pass) - a
 *     freeze with no preceding gauge carries no '@ts' segment (the honest
 *     net, never a guessed position);
 *   - the junk laws: '~0s' is not a freeze (the dump's own threshold is
 *     5s), a line missing the 'last: ' prefix or carrying an empty chain
 *     never counts, prose mentioning the phrase never counts;
 *   - the healthy silence inverted (the runs-row law): a face with no
 *     freeze still prints its row - 'no main freeze' IS the verdict (the
 *     v0.660.0 additive filter's honest zero).
 */

/** The '[blackbox] main freeze' dump's shape: the seconds, the chain, and
 *  the optional v0.77.0 loop-scope tail. */
export const MAIN_FREEZE_LINE_RE = /^\[blackbox\] main freeze ~(\d+)s; last: (.+?)(?:; loop: timers=(\d+) imm=(\d+)\/(\d+)s \(([^)]+)\))?$/

/** The heartbeat's pulse gauge: the freeze's position anchor. The real
 *  line reads '[hb] n=<k> ts=<s>s rss=...' - the unanchored 'b]' stem is
 *  the family's own read (stormcensus's HB_RE shape), it matches the
 *  bracketed head and any bare-era variant alike. */
export const MAIN_FREEZE_GAUGE_RE = /b\] n=\d+ ts=(\d+)s rss=\d+M late=\d+ms mainLate=\d+ms/

/** The unlabeled tick's label - a segment that names nothing. */
export const MAIN_FREEZE_OTHER_LABEL = 'other'

/** The chain's segment split. */
const SEG_SPLIT = ' <- '

function namedFromChain (chain) {
  const segs = chain.split(SEG_SPLIT)
  for (const seg of segs) {
    // the age rides the dump's own bytes ('@+0.0s', the double-sign
    // '@+-1.2s' = 1.2s before the freeze) - the label is the only read,
    // the age never parses into a number (zero transformation)
    const m = seg.match(/^(.*) @(.+)s$/)
    if (!m) return seg // a torn segment still names itself verbatim
    if (m[1] !== MAIN_FREEZE_OTHER_LABEL) return seg
  }
  return 'none'
}

/**
 * (v0.661.0) The main-thread freeze census, pure. Reads the log's lines in
 * order, pairs each blackbox dump with the most recent pulse gauge, names
 * each freeze by its ring chain's first non-'other' segment, and composes
 * the row. Junk-safe per the laws above.
 * @param {string[]} lines
 * @returns {{freezes: Array<{seconds:number, named:string, loopVerdict:string, ts:number|null}>, row:string}}
 */
export function mainFreezeCensus (lines) {
  const freezes = []
  let lastTs = null
  for (const line of (Array.isArray(lines) ? lines : [])) {
    if (typeof line !== 'string') continue
    const g = line.match(MAIN_FREEZE_GAUGE_RE)
    if (g) {
      lastTs = Number(g[1])
      continue
    }
    const m = line.match(MAIN_FREEZE_LINE_RE)
    if (!m) continue
    const seconds = Number(m[1])
    if (!(seconds >= 1)) continue // the dump's own threshold is 5s; ~0s is junk
    const chain = m[2]
    const named = chain && chain.length > 0 ? namedFromChain(chain) : 'none'
    freezes.push({
      seconds,
      named,
      loopVerdict: m[6] != null && m[6] !== '' ? m[6] : 'unscoped',
      ts: lastTs
    })
  }
  return { freezes, row: mainFreezeRow(freezes) }
}

/**
 * (v0.661.0) The row composer, pure - split from the census so the tests
 * and the decompose row share the exact grammar. Face order (the clock's
 * own order), each freeze one token:
 *   '~<s>s' + optional ' @ts<n>' + ' named \'<seg>\'' + ' (loop <verdict>)'.
 * @param {Array<{seconds:number, named:string, loopVerdict:string, ts:number|null}>} freezes
 * @returns {string}
 */
export function mainFreezeRow (freezes) {
  if (!Array.isArray(freezes) || freezes.length === 0) {
    return 'main freeze census: no main freeze'
  }
  const n = freezes.length
  const head = n === 1 ? '1 freeze:' : `${n} freeze(s):`
  const toks = freezes.map((f) => {
    const s = f && Number.isFinite(f.seconds) ? f.seconds : 0
    const tsPart = f && Number.isFinite(f.ts) ? ` @ts${f.ts}s` : ''
    const named = f && typeof f.named === 'string' && f.named ? f.named : 'none'
    const loop = f && typeof f.loopVerdict === 'string' && f.loopVerdict ? f.loopVerdict : 'unscoped'
    return `~${s}s${tsPart} named '${named}' (loop ${loop})`
  })
  return `main freeze census: ${head} ${toks.join(', ')}`
}
