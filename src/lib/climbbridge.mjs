// (v0.607.0) THE BRIDGE REFUSAL BOOK - the climb bridge's own refusal ledger
// (the walkfail book's parse-only precedent, zero wiring). The face 37188370162
// (f83b64f = v0.606.0, the per-level law's first flight) funded the ascents and
// the fleet answered with 19 failed climb cycles (stalled 11 of 19, the doom
// census's own read) - but the doom row names the STALL, never the stall's own
// refusal class. The bridge speaks its refusals per attempt
// ('F14 [F14] climb bridge: unavailable (no solid floor underfoot)') and the
// face carried 125 of them (floor 67 / pocket 58) plus 4 landed fills. This
// book censuses the refusals and names which class owns the climb tax: a
// single class over the half boundary names ITS cure (the support-under-self
// fill, the carried fill); the classes scatter -> the climbs stall for many
// reasons. The landed fills ride the row as the transport's own proof: the
// bridge PLACED when the pocket had blocks - the refusal is the pocket's, not
// the transport's.

const TAG_OPT = '(?:F\\d+ (?:\\[[A-Za-z0-9]+\\] )?)?'
export const BRIDGE_SHARE = 0.5

// Greedy capture to the LAST ')' - the why may nest its own parens
// ('the step cells are not clear (the dig ladder owns this level)',
//  'the bridge budget is spent (3/8)').
const BOOK_RE = new RegExp('^' + TAG_OPT + 'climb bridge: unavailable \\((.*)\\)$')

// The torn sweep: a line that STARTS like a member but failed the full
// grammar rides unparsed (the honest sweep - the v0.595.0 law).
export const BRIDGE_BOOK_TORN_RE = /climb bridge: unavailable \(/

// The landed fill: 'F1 [F1] climb bridge: placed cobblestone at [-111,17,425]
// (pit) - the step re-judges'. The block name and the fill kind ride the
// census's own grain (the transport's proof, the diag's 3-level cadence).
// (v0.610.0) the 'self' kind joins: the support-under-self fill (the bridge's
// own support geometry applied to the SELF cell - the floor class's priced
// cure) lands its own kind so the next face can count the cure firing.
const PLACE_RE = new RegExp('^' + TAG_OPT + 'climb bridge: placed ([a-z_]+) at \\[(-?\\d+),(-?\\d+),(-?\\d+)\\] \\((support|pit|self)\\) - the step re-judges$')

export function parseBridgeRefusal (line) {
  const m = String(line ?? '').match(BOOK_RE)
  if (!m) return null
  const b = String(line).match(/^F(\d+) /)
  return { kind: 'bridge', bot: b ? `F${b[1]}` : null, msg: m[1].trim() }
}

export function parseBridgeFill (line) {
  const m = String(line ?? '').match(PLACE_RE)
  if (!m) return null
  const b = String(line).match(/^F(\d+) /)
  return {
    kind: 'bridge-fill',
    bot: b ? `F${b[1]}` : null,
    block: m[1],
    cell: { x: Number(m[2]), y: Number(m[3]), z: Number(m[4]) },
    fill: m[5]
  }
}

// The refusal's own class (climbWhyClass's keyword-include law - the why may
// nest its own parens, the class rides a keyword, never an equality). The
// classes are the face's own taxonomy: floor 67, pocket 58, step 0, budget 0
// (fleet 37188370162). Junk (undefined, numbers, an empty string) falls to
// 'other' - a refusal that never names a class is still a refusal (the
// body-guard law: the count is the truth, the class is the read).
export function bridgeRefusalClass (msg) {
  const s = String(msg ?? '').toLowerCase()
  if (s.includes('no solid floor underfoot')) return 'floor'
  if (s.includes('no placeable block')) return 'pocket'
  if (s.includes('step cells are not clear')) return 'step'
  if (s.includes('bridge budget is spent')) return 'budget'
  if (s.includes('no geometry read')) return 'geometry'
  return 'other'
}

export function bridgeRefusalCensus (lines) {
  const c = { n: 0, bots: new Set(), byClass: {}, places: 0, fillKinds: {}, unparsed: 0 }
  for (const line of lines) {
    const p = parseBridgeRefusal(line)
    if (p) {
      c.n++
      if (p.bot) c.bots.add(p.bot)
      const cls = bridgeRefusalClass(p.msg)
      c.byClass[cls] = (c.byClass[cls] || 0) + 1
      continue
    }
    const f = parseBridgeFill(line)
    if (f) {
      c.places++
      c.fillKinds[f.fill] = (c.fillKinds[f.fill] || 0) + 1
      continue
    }
    if (BRIDGE_BOOK_TORN_RE.test(line)) c.unparsed++
  }
  c.botCount = c.bots.size
  return c
}

const pct = (part, whole) => whole > 0 ? Math.round(part * 100 / whole) : 0

// ONE always-print verdict; at most one class owns the half boundary:
//   floor   - 'no solid floor underfoot' over the half: the bot stands over
//             its own hole - the support-under-self fill is the front
//   pocket  - 'no placeable block in the pocket' over the half: the climb
//             arrives empty-handed - the carried fill is the front
//   step    - the dig ladder owns the level: the step's dig is the front
//   budget  - the fills spent: the cap is the front
//   geometry/other - that refusal's own cure is the front
// The class list rides descending count, ties by name ascending (the
// walkfail book's sort law). The landed fills lead the head: the transport
// works when the pocket has blocks - the refusal is the pocket's, not the
// transport's.
export function bridgeRefusalRow (c) {
  const places = c && Number.isFinite(c.places) && c.places > 0 ? Math.floor(c.places) : 0
  const n = c && Number.isFinite(c.n) && c.n > 0 ? Math.floor(c.n) : 0
  if (n === 0) {
    if (places === 0) return 'bridge refusal book: none refused, none placed (the bridge never spoke this run)'
    return `bridge refusal book: none refused, ${places} fill(s) placed (the climbs climbed clean)`
  }
  const classes = Object.entries(c.byClass || {})
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  const list = classes.map(([k, v]) => `${k} ${v} (${pct(v, n)}%)`).join(', ')
  const head = `bridge refusal book: ${n} refusal(s) across ${c.botCount || 0} bot(s), ${places} fill(s) placed - ${list}`
  const top = classes[0]
  const share = top ? pct(top[1], n) : 0
  if (share < 50 || !top) return `${head} - the refusals scatter (no class owns the climb tax)`
  if (top[0] === 'floor') return `${head} - the floor owns the climb tax (the bot stands over its own hole - the support-under-self fill is the front)`
  if (top[0] === 'pocket') return `${head} - the pocket owns the climb tax (the climb arrives empty-handed - the carried fill is the front)`
  if (top[0] === 'step') return `${head} - the dig ladder owns the level (the step's dig is the front)`
  if (top[0] === 'budget') return `${head} - the bridge budget owns the tax (the fills spent - the cap is the front)`
  if (top[0] === 'geometry') return `${head} - the geometry read is the front (the sensor, not the world)`
  return `${head} - that refusal's own cure is the front`
}
