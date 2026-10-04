// (v0.601.0) THE WALKFAIL BOOK - the fuel commons walkfail class' own msg
// ledger (the mining-surface precedent, zero wiring). The face 37180720652
// (9771c5a = v0.598.0, the arc law's first flight) spiked the walkfail kind
// 4 -> 17 - one failed walk per bot - and the class's WHY stood unread: the
// line names its msg ('chest walk failed after the nudge (MSG)'), the msg is
// the diagnosis. This book censuses the msgs and names which one owns the
// class: a single msg over the half boundary names ITS cure (the decision
// clock, the dead net); the msgs scatter -> the walks fail for many reasons.
// The prefix law rides the v0.600.0 correction: the tag is optional, the
// grammar behind it strict.

const TAG_OPT = '(?:F\\d+ (?:\\[[A-Za-z0-9]+\\] )?)?'
export const WALKFAIL_SHARE = 0.5

// Greedy capture to the LAST ')' - the msg may nest its own parens
// ('iron commune walk @-12,7 (nudge retry)').
const BOOK_RE = new RegExp('^' + TAG_OPT + 'fuel commons: chest walk failed after the nudge \\((.*)\\)$')

// The torn sweep: a line that STARTS like a member but failed the full
// grammar rides unparsed (the honest sweep - the v0.595.0 law).
export const WALKFAIL_BOOK_TORN_RE = /chest walk failed after the nudge \(/

export function parseWalkFailBook (line) {
  const m = line.match(BOOK_RE)
  if (!m) return null
  const b = line.match(/^F(\d+) /)
  return { kind: 'walkfail', bot: b ? `F${b[1]}` : null, msg: m[1].trim() }
}

export function walkFailBookCensus (lines) {
  const c = { n: 0, bots: new Set(), byMsg: {}, unparsed: 0 }
  for (const line of lines) {
    const p = parseWalkFailBook(line)
    if (p) {
      c.n++
      if (p.bot) c.bots.add(p.bot)
      c.byMsg[p.msg] = (c.byMsg[p.msg] || 0) + 1
      continue
    }
    if (WALKFAIL_BOOK_TORN_RE.test(line)) c.unparsed++
  }
  c.botCount = c.bots.size
  return c
}

const pct = (part, whole) => whole > 0 ? Math.round(part * 100 / whole) : 0

// ONE always-print verdict; at most one msg owns the half boundary:
//   clock  - 'Took to long to decide path to goal!' over the half: the
//            pathfinder's decision clock is the walkfail front
//   net    - 'No path to the goal!' over the half: the net itself is the front
//   single - any other single msg over the half: that msg's own cure
//   mixed  - no msg owns the half
export function walkFailBookRow (c) {
  if (c.n === 0) return 'walkfail book: none (no ask walk failed this run)'
  const top = Object.entries(c.byMsg).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]
  const share = pct(top[1], c.n)
  const head = `walkfail book: ${c.n} failed walk(s) across ${c.botCount} bot(s) - top msg "${top[0]}" (${share}%)`
  if (share < 50) return `${head} - the walks fail for many reasons - no msg owns the face`
  if (/Took to long to decide/.test(top[0])) return `${head} - the decision clock is the front`
  if (/No path to the goal/.test(top[0])) return `${head} - the net itself is the front`
  return `${head} - that msg's own cure is the front`
}
