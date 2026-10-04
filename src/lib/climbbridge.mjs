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

// (v0.621.0) THE GATE'S OWN BOOK - the v0.619.0 underfoot gate's three new
// emitter forms (deliberately lens-safe at birth: PLACE_RE/REFUSED_RE/BOOK_RE
// match none) printed 53 lines on their FIRST field flight (fleet
// 37203144265's successor face 37205134738: 43 'reads', 9 'refuses', 1
// 'still waits') and the book did not see ONE of them - the gate's live
// behavior was invisible exactly when it started converting (the self fill's
// rate climbed 26% -> 48% on the same face). One parser, three verdicts:
//   reads   - 'the re-plan reads the <kind> fill' (the landed feet re-plan a
//             fill - the gate's whole point)
//   refuses - 'the re-plan refuses (<why>)' (the landed feet's own geometry
//             solved or refused the level: 'the support is already solid' =
//             the hole SELF-SOLVED under the gate)
//   waits   - 'the self fill still waits for ground - the ladder owns it'
//             (the bound expired afloat - the honest skip)
// The why may nest its own parens - greedy to the LAST ')', the book's own
// law. Junk-safe: null, never a throw.
const GATE_READS_RE = new RegExp('^' + TAG_OPT + 'climb bridge: the self fill waited and grounded - the re-plan reads the (self|support|pit) fill$')
const GATE_REFUSES_RE = new RegExp('^' + TAG_OPT + 'climb bridge: the self fill waited and grounded - the re-plan refuses \\((.*)\\)$')
const GATE_WAITING_RE = new RegExp('^' + TAG_OPT + 'climb bridge: the self fill still waits for ground - the ladder owns it$')

export function parseBridgeGateWait (line) {
  const s = String(line ?? '')
  const b = s.match(/^F(\d+) /)
  const bot = b ? `F${b[1]}` : null
  let m = s.match(GATE_READS_RE)
  if (m) return { kind: 'gate-wait', bot, result: 'reads', fill: m[1] }
  m = s.match(GATE_REFUSES_RE)
  if (m) return { kind: 'gate-wait', bot, result: 'refuses', why: m[1].trim() }
  m = s.match(GATE_WAITING_RE)
  if (m) return { kind: 'gate-wait', bot, result: 'still-waits' }
  return null
}

// The refusal's own class (climbWhyClass's keyword-include law - the why may
// nest its own parens, the class rides a keyword, never an equality). The
// classes are the face's own taxonomy: floor 67, pocket 58, step 0, budget 0
// (fleet 37188370162). Junk (undefined, numbers, an empty string) falls to
// 'other' - a refusal that never names a class is still a refusal (the
// body-guard law: the count is the truth, the class is the read).
// (v0.615.0) THE SERVER-REFUSED FILL - the self-fill's first flight (fleet
// 37196201457, cc64cf9 = v0.613.0) answered the v0.610.0 self-fill wiring with
// a NEW face: the server itself refuses the placement - 'F17 [F17] climb
// bridge: the server refused the support fill at [-116,43,409] - the rotate
// ladder owns it (held=cobblestone, 1.2b, ref=stone, post=? (re-read failed))'
// - 15 of them (self 9, support 6), and EVERY ONE carried 'post=? (re-read
// failed)': the post-placement re-read cannot speak after a refusal - the
// refusal IS the verdict, the re-read is dead weight. The two landed-fill
// shapes above have their parsers; this one has none - the one-parser-per-
// emitter law gives it this file (the 'climb bridge:' family's owner). The
// why tail may nest its own parens ('post=? (re-read failed)') - greedy to
// the LAST ')', the re-read flag rides a keyword test (climbWhyClass's law).
const REFUSED_RE = new RegExp('^' + TAG_OPT + 'climb bridge: the server refused the (self|support) fill at \\[(-?\\d+),(-?\\d+),(-?\\d+)\\] - the rotate ladder owns it \\(held=([a-z_]+), ([\\d.]+)b, ref=([a-z_]+), post=(.*)\\)$')

// The torn sweep for the refused form - a line that STARTS like a member but
// failed the full grammar rides refusedTorn (the honest sweep - the v0.595.0
// law, this form's own bucket).
export const BRIDGE_REFUSED_TORN_RE = /climb bridge: the server refused the/

export function parseServerRefusedFill (line) {
  const m = String(line ?? '').match(REFUSED_RE)
  if (!m) return null
  const b = String(line).match(/^F(\d+) /)
  const post = m[8].trim()
  return {
    kind: 'server-refused-fill',
    bot: b ? `F${b[1]}` : null,
    fill: m[1],
    cell: { x: Number(m[2]), y: Number(m[3]), z: Number(m[4]) },
    held: m[5],
    arm: Number(m[6]),
    ref: m[7],
    post,
    reReadFailed: /re-read failed/.test(post)
  }
}

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
  const c = { n: 0, bots: new Set(), byClass: {}, places: 0, fillKinds: {}, unparsed: 0,
    refused: 0, refusedKinds: {}, refusedReReadFailed: 0, refusedTorn: 0, refusedCellKeys: new Set(),
    gates: 0, gateReads: 0, gateRefuses: 0, gateStillWaits: 0, gateReadKinds: {}, gateRefuseWhys: {} }
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
    // (v0.615.0) the server-refused fill rides its own grain (the self-fill's
    // first flight priced it: 15 refusals, every re-read failed)
    // (v0.616.0) the CELL grain joins: refusedCellKeys tracks the distinct
    // refused cells - the v0.168.0 transient doctrine faces its own re-price
    // (a repeat cell is a GEOMETRY law - the rotate ladder truly owns it;
    // an all-unique face keeps the retry ladder honest - the server rolls
    // dice, the re-place converts). The dead-re-read cure decision rides
    // THIS split on the next field face.
    const r = parseServerRefusedFill(line)
    if (r) {
      c.refused++
      c.refusedKinds[r.fill] = (c.refusedKinds[r.fill] || 0) + 1
      if (r.reReadFailed) c.refusedReReadFailed++
      const key = `${r.cell.x},${r.cell.y},${r.cell.z}`
      c.refusedCellKeys.add(key)
      continue
    }
    // (v0.621.0) the gate's own grain: the underfoot gate's three forms join
    // the census (they fell through every parse and were DROPPED before - the
    // gate's live behavior was invisible to the book). The bots set stays the
    // refusal book's own (the gate tail carries its own story; the head
    // keeps its byte).
    const g = parseBridgeGateWait(line)
    if (g) {
      c.gates++
      if (g.result === 'reads') {
        c.gateReads++
        c.gateReadKinds[g.fill] = (c.gateReadKinds[g.fill] || 0) + 1
      } else if (g.result === 'refuses') {
        c.gateRefuses++
        c.gateRefuseWhys[g.why] = (c.gateRefuseWhys[g.why] || 0) + 1
      } else {
        c.gateStillWaits++
      }
      continue
    }
    if (BRIDGE_BOOK_TORN_RE.test(line)) c.unparsed++
    else if (BRIDGE_REFUSED_TORN_RE.test(line)) c.refusedTorn++
  }
  c.botCount = c.bots.size
  // (v0.616.0) the cell grain: the distinct mass names the law - repeats are
  // geometry (the rotate ladder owns the cell), all-unique is transient (the
  // re-place ladder converts - the v0.168.0 doctrine holds)
  c.refusedUniqueCells = c.refusedCellKeys.size
  c.refusedCellRepeats = c.refused - c.refusedUniqueCells
  return c
}

const pct = (part, whole) => whole > 0 ? Math.round(part * 100 / whole) : 0

// (v0.615.0) when the server refused placements, ONE tail clause rides the
// verdict (the mined face's own read - old faces byte-stable, the clause only
// speaks when the face carries refusals):
//   ' - the server refused N fill(s): self S, support P, R re-read(s) failed,
//     U distinct cell(s), W repeat(s) (the refusal is the verdict)'
// (v0.616.0) the cell grain rides the same clause - the repeats name the law:
// repeat(s) > 0 = the cell itself refuses (geometry - the rotate ladder owns
// it); repeat(s) = 0 = the server rolls dice (the v0.168.0 re-place ladder
// converts - the retry doctrine holds). The dead-re-read cure decision is
// priced by THIS split.
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
  // (v0.615.0) the server-refused tail rides EVERY verdict (the mass must
  // speak whatever class owns the unavailable book - the face's floor class
  // must not bury the refused fills)
  const base = n === 0
    ? (places === 0
        ? 'bridge refusal book: none refused, none placed (the bridge never spoke this run)'
        : `bridge refusal book: none refused, ${places} fill(s) placed (the climbs climbed clean)`)
    : (() => {
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
      })()
  return base + refusedTail(c) + blindMassTail(c) + fillRateTail(c) + geometryTail(c) + gateTail(c)
}

// (v0.620.0) THE GEOMETRY VERDICT - the fleet 37203144265 face (the
// v0.618.0 clause's own first flight) gave the v0.616.0 cell grain its >0
// side at last: 40 refused fills, 36 distinct cells, 4 REPEATS - the first
// live repeat mass (F15 and F8 share [-91,59,398]; F12's self and support
// fills share [-117,65,395]). The v0.616.0 law named the split but the row
// never spoke the verdict: repeat(s) > 0 = the CELL itself refuses (a
// geometry law - the rotate ladder truly owns those cells; the retry ladder
// burns its budget on them), repeat(s) = 0 = the server rolls dice (the
// transient face - the re-place ladder converts). THE LAW: the clause speaks
// only when the repeat mass EXISTS (refusedCellRepeats > 0) - an all-unique
// face stays transient-quiet; the junk fallback (a census without the field,
// uniq=read) reads 0 repeats and is silent, never a lie. The clause rides
// LAST on the row (the refused family's closing verdict):
//   ' - the repeat(s) name the geometry law (the rotate ladder owns those cells)'
function geometryTail (c) {
  const rep = c && Number.isFinite(c.refusedCellRepeats) ? c.refusedCellRepeats : 0
  if (rep <= 0) return ''
  return ' - the repeat(s) name the geometry law (the rotate ladder owns those cells)'
}

// (v0.621.0) THE GATE TAIL - the underfoot gate's live behavior rides the
// row's very end (the family's newest evidence, after the geometry verdict):
//   ' - the gate waited N time(s): R reads, F refuses, S still waiting'
// The law: the clause speaks only when the gate SPOKE (gates > 0) - the old
// faces (no gate lines) stay byte-stable; the junk fallback (a census without
// the fields) reads zeros and stays silent, never a lie. The tail prices the
// v0.619.0 gate's conversion face to face: reads = the landed feet re-planned
// a fill (the gate's whole point), refuses = the landed feet's own geometry
// solved or refused the level ('the support is already solid' = the hole
// SELF-SOLVED), still waiting = the bound expired afloat (the honest skip).
function gateTail (c) {
  const n = c && Number.isFinite(c.gates) ? c.gates : 0
  if (n <= 0) return ''
  const reads = Number.isFinite(c.gateReads) ? c.gateReads : 0
  const refuses = Number.isFinite(c.gateRefuses) ? c.gateRefuses : 0
  const still = Number.isFinite(c.gateStillWaits) ? c.gateStillWaits : 0
  return ` - the gate waited ${n} time(s): ${reads} reads, ${refuses} refuses, ${still} still waiting`
}

// (v0.618.0) THE RE-READ BLIND MASS - the fleet 37200930827 face (the
// v0.616.0 tree's own flight) doubled the refused mass (15 -> 23: self 13,
// support 10) and the blind leg stayed WHOLE: 23 of 23 refusals carry
// 'post=? (re-read failed)' - 46 of 46 across the two faces now. The per-line
// tails carry ONE line's story, but the ROW never names the systematic face:
// when EVERY refusal's re-read failed, the re-read leg did not merely fail -
// it NEVER SPOKE on this face (the chunk read returns nothing at the recheck
// - the v0.172.0 blind leg, priced per face at last; the wiring cure - skip
// the ask or force a fresh read - rides THIS name). THE LAW: the clause
// speaks only when the face is WHOLLY blind (refused > 0 AND
// refusedReReadFailed === refused) - a mixed face's story stays on the
// per-line tails (a census without the field is the junk fallback: silent,
// never a lie). The clause rides INSIDE the refused family's evidence -
// after the count/cell grain, before the rate lever:
//   ' - the re-read never spoke (the blind leg owns the mass)'
function blindMassTail (c) {
  const refused = c && Number.isFinite(c.refused) ? c.refused : 0
  const rrf = c && Number.isFinite(c.refusedReReadFailed) ? c.refusedReReadFailed : 0
  if (refused <= 0 || rrf !== refused) return ''
  return ' - the re-read never spoke (the blind leg owns the mass)'
}

// The v0.615.0 tail clause - the server-refused fill mass (the refusal IS the
// verdict: the re-read cannot speak after a refusal, 15 of 15 failed on the
// self-fill's first flight; v0.618.0 names the WHOLLY-blind face on the row)
function refusedTail (c) {
  const refused = c && Number.isFinite(c.refused) && c.refused > 0 ? Math.floor(c.refused) : 0
  if (refused === 0) return ''
  const s = (c.refusedKinds && c.refusedKinds.self) || 0
  const p = (c.refusedKinds && c.refusedKinds.support) || 0
  const rrf = (c && Number.isFinite(c.refusedReReadFailed)) ? c.refusedReReadFailed : 0
  const uniq = (c && Number.isFinite(c.refusedUniqueCells)) ? c.refusedUniqueCells : refused
  const rep = (c && Number.isFinite(c.refusedCellRepeats)) ? c.refusedCellRepeats : 0
  return ` - the server refused ${refused} fill(s): self ${s}, support ${p}, ${rrf} re-read(s) failed, ${uniq} distinct cell(s), ${rep} repeat(s) (the refusal is the verdict)`
}

// (v0.617.0) THE UNDERFOOT RATE - the refused mass's own lever evidence. The
// counts and the cell grain do not name the lever: the self-fill's first
// flight refused self 9 against support 6, but the REAL suspect is the RATE -
// the self fill landed 5 of its 14 attempts (36%) while the support fill
// landed 46 of 52 (88%) - a 5x gap. The self fill's target cell sits DIRECTLY
// BELOW the feet: the bot is falling (it stands over its own hole - the exact
// face the v0.611.0 cure serves), and by packet time a falling bot's AABB
// dips into the very cell the fill targets - the server keeps the block for
// entity collision. The support fill's target is lateral - never underfoot -
// and rides the vanilla reach untouched. THE LAW: the clause speaks only
// when the comparison EXISTS - the self family needs a landed fill AND a
// refusal (a rate without both is noise: a family that never placed is the
// pocket front's, a family that never refused has no lever to price); the
// support paren rides the same law. The verdict splits on the house's own
// half boundary: under the half -> 'the underfoot placement is the suspect'
// (the falling-AABB read); at or over -> 'the underfoot placement holds'.
// Junk census fields are silent, never a crash (the tail's own law).
function fillRateTail (c) {
  const selfPlaced = (c && c.fillKinds && Number.isFinite(c.fillKinds.self) && c.fillKinds.self > 0) ? c.fillKinds.self : 0
  const selfRefused = (c && c.refusedKinds && Number.isFinite(c.refusedKinds.self) && c.refusedKinds.self > 0) ? c.refusedKinds.self : 0
  if (selfPlaced === 0 || selfRefused === 0) return ''
  const selfA = selfPlaced + selfRefused
  const selfPct = Math.round(selfPlaced * 100 / selfA)
  const verdict = selfPct < 50 ? 'the underfoot placement is the suspect' : 'the underfoot placement holds'
  let s = ` - the self fill landed ${selfPlaced} of ${selfA} (${selfPct}%) - ${verdict}`
  const supPlaced = (c && c.fillKinds && Number.isFinite(c.fillKinds.support) && c.fillKinds.support > 0) ? c.fillKinds.support : 0
  const supRefused = (c && c.refusedKinds && Number.isFinite(c.refusedKinds.support) && c.refusedKinds.support > 0) ? c.refusedKinds.support : 0
  if (supPlaced > 0 && supRefused > 0) {
    const supA = supPlaced + supRefused
    s += ` (the support fill rides ${supPlaced} of ${supA} (${Math.round(supPlaced * 100 / supA)}%))`
  }
  return s
}
