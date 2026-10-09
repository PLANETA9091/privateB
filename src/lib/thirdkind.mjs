// (v0.854.0) THE LATE THIRD'S OWN KIND - the siege thirds' own kind join.
//
// Measured background (face 128, run 37867025314, the v0.852.0 tree): the
// siege's own thirds (v0.733.0) read early 0 / mid 4 / late 5 - the second
// consecutive late-heavy face (face 127: 0/2/4) - but the thirds lens never
// asked WHICH KIND owns the late third. The face's answer prices the front:
// the late third is MOB-CLEAN (5 of 5 mob - the drowned/skeleton storm at
// the face's end), the mid third mixes (drown 3 + mob 1). The mob front,
// not the wet front, owns the deadline's third on this face.
//
// The join rides the log's own adjacency (the death clock's v0.407.0 law by
// reuse): every 'died - respawning' announce carries the SERVER's own kind
// word (the v0.117.0 doctrine - the server kind stays the authority, the
// census never re-adjudicates), and the timestamp is the last heartbeat's
// ts seen before the announce (HB_RE, the one-parser law by reuse - the
// same clock sealdeath's thirds ride). The boundary second belongs to the
// LATER third (t < thirdS strict - the zero clock's own cut, the v0.733.0
// law). The clock never invents: no clock end (no hb) or no parsed kind
// reads the honest silence (null); an announce before the first hb stays
// untimed and rides 'unplaced'; an announce-shaped row the kind grammar
// cannot parse (the inferred-only family, v0.672.0) counts in 'unparsed'
// and never invents a kind.
//
// Pure: reads, never mutates. Junk-safe: non-string rows judge nothing;
// non-array/string input splits like the census convention.

// (v0.855.0) THE LATE MOB'S OWN ATTACKER - the kind join's own next leg.
// The v0.854.0 row named WHICH KIND owns the deadline's third; two faces
// running the answer is always 'mob' (face 127: late 4, face 128: late 5,
// late-mob-clean) - but the mob KIND is a family, and the family's own
// attacker dictés the front: face 128's late third rode Drowned 4 of 5
// (Skeleton 1) - the WATER-EDGE storm, not the night ring's zombies. The
// server's own attacker word ('kind=mob by Drowned') joins the same stamp
// (the v0.117.0 authority by reuse - the attacker stays the server's
// verdict, never re-adjudicated); non-mob kinds carry no attacker. The
// fence grows the attackers' own leg: a third's attackers sum can never
// EXCEED its mob count (unnamed mob rows ride the kind honestly - the
// attacker detail renders only when the family is fully named).

import { HB_RE } from './sealdeath.mjs'

/** The server-verdict announce's own kind word ('kind=drown', 'kind=mob by
 * Zombie') - the same server verdict deathkinds reads, read here only for
 * the kind bucket (the attacker stays the mob family's own read). */
const THIRD_KIND_ANNOUNCE_RE = /^F\d+ \[F\d+\] died - respawning \(cause: server: .+ \[kind=([a-z]+)(?: by ([^\]]+))?\]/

/** Announce-shaped rows that carry no server verdict (the inferred-only
 * family) - counted, never kinded. */
const THIRD_ANNOUNCE_SHAPE_RE = /^F\d+ \[F\d+\] died - respawning \(cause: /

/**
 * Join the face's server-kind deaths to the face's own clock thirds.
 * @param {string[]|string} [lines] the face log
 * @returns {null|{n: number, timed: number, unplaced: number, unparsed: number,
 *   clockEnd: number, thirdS: number,
 *   thirds: {early: {n: number, kinds: Object<string,number>},
 *            mid: {n: number, kinds: Object<string,number>},
 *            late: {n: number, kinds: Object<string,number>}},
 *   lateShare: number}} null = the honest silence (no clock end or no
 *   parsed kind); lateShare = round(100*late/timed). Junk-safe.
 */
export function thirdKindSplit (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  if (!Array.isArray(rows)) return null
  let lastT = null
  let clockEnd = null
  const timed = []
  let unplaced = 0
  let unparsed = 0
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const hm = l.match(HB_RE)
    if (hm) { lastT = Number(hm[1]); clockEnd = lastT; continue }
    if (!THIRD_ANNOUNCE_SHAPE_RE.test(l)) continue
    const km = l.match(THIRD_KIND_ANNOUNCE_RE)
    if (!km) { unparsed++; continue }
    if (lastT === null) { unplaced++; continue }
    timed.push({ ts: lastT, kind: km[1], attacker: km[2] || null })
  }
  if (clockEnd === null || timed.length === 0) return null
  const thirdS = clockEnd / 3
  const mk = () => ({ n: 0, kinds: {}, attackers: {} })
  const thirds = { early: mk(), mid: mk(), late: mk() }
  for (const r of timed) {
    const w = r.ts < thirdS ? 'early' : r.ts < 2 * thirdS ? 'mid' : 'late'
    const b = thirds[w]
    b.n++
    b.kinds[r.kind] = (b.kinds[r.kind] || 0) + 1
    if (r.kind === 'mob' && r.attacker) {
      b.attackers[r.attacker] = (b.attackers[r.attacker] || 0) + 1
    }
  }
  return {
    n: timed.length + unplaced,
    timed: timed.length,
    unplaced,
    unparsed,
    clockEnd,
    thirdS,
    thirds,
    lateShare: Math.round((100 * thirds.late.n) / timed.length)
  }
}

/** The kinds dict's own render: 'mob 5' / 'mob 5 (Drowned 4, Skeleton 1)' /
 * 'drown 3, mob 1 (Zombie 1)' / 'none'. The attacker detail renders only
 * when the mob family is FULLY named (the attackers' sum equals the mob
 * count - unnamed mob reads the bare kind honestly). */
function kindsText (bucket) {
  const kinds = bucket.kinds
  const ks = Object.entries(kinds)
  if (ks.length === 0) return 'none'
  return ks
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => {
      if (k !== 'mob') return `${k} ${v}`
      const atk = Object.entries(bucket.attackers || {})
      const sum = atk.reduce((s, [, n]) => s + n, 0)
      if (sum === 0 || sum !== v) return `mob ${v}`
      const detail = atk
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([name, n]) => `${name} ${n}`)
        .join(', ')
      return `mob ${v} (${detail})`
    })
    .join(', ')
}

/** THE CONSISTENCY FENCE - the row renders only when the shape agrees with
 * itself: the three thirds' n sum to the timed count, each third's kinds
 * sum to that third's n, unplaced+timed = n, and the late share prices
 * against the timed count. A self-inconsistent shape never renders (the
 * v0.852.0 fence law by reuse - the fence prices the lens, not the log). */
export function thirdKindRowConsistent (bill) {
  if (!bill || typeof bill !== 'object') return false
  const t = bill.thirds
  if (!t || !t.early || !t.mid || !t.late) return false
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0)
  if (t.early.n + t.mid.n + t.late.n !== bill.timed) return false
  if (bill.timed + bill.unplaced !== bill.n) return false
  for (const w of ['early', 'mid', 'late']) {
    if (sum(t[w].kinds) !== t[w].n) return false
    if (typeof t[w].n !== 'number' || t[w].n < 0) return false
    // (v0.855.0) the attackers' own leg: the named attackers can never
    // exceed the third's mob count (unnamed mob rides the kind honestly).
    if (sum(t[w].attackers || {}) > (t[w].kinds.mob || 0)) return false
  }
  if (bill.timed <= 0) return false
  if (bill.lateShare !== Math.round((100 * t.late.n) / bill.timed)) return false
  return true
}

/**
 * The row: 'the late third's own kind (v0.855.0): early 0 (none) / mid 4
 * (drown 3, mob 1) / late 5 (mob 5) - the late third owns 56% of 9 timed
 * death(s) - THE LATE KIND'S OWN SEAT: mob owns the face's end'. The seat
 * law: one kind owning >= 2/3 of the late third names the seat ('<kind>
 * owns the face's end'), a spread reads honestly. unplaced/unparsed append
 * their own honest notes. Inconsistent or null -> null (the honest
 * silence).
 */
export function thirdKindRow (bill) {
  if (!thirdKindRowConsistent(bill)) return null
  const t = bill.thirds
  const lateKinds = Object.entries(t.late.kinds)
  let seat
  if (lateKinds.length === 0) seat = "- the late third stayed empty - the face's end was clean"
  else {
    const [topKind, topN] = lateKinds.sort((a, b) => b[1] - a[1])[0]
    if (topN * 3 < t.late.n * 2) seat = "- the end's kinds spread - no kind owns the storm"
    else if (topKind !== 'mob') {
      seat = `- THE LATE KIND'S OWN SEAT: ${topKind} owns the face's end (${topN} of ${t.late.n})`
    } else {
      // (v0.855.0) the mob seat names its own top attacker when the family
      // is fully named - the water-edge storm vs the night ring's own read.
      const atk = Object.entries(t.late.attackers || {})
      const sum = atk.reduce((s, [, n]) => s + n, 0)
      if (sum === t.late.kinds.mob && atk.length > 0) {
        const [topAtk, topAtkN] = atk.sort((a, b) => b[1] - a[1])[0]
        seat = `- THE LATE KIND'S OWN SEAT: mob owns the face's end (${topN} of ${t.late.n}) - the attacker's own word: ${topAtk} ${topAtkN} of ${sum}`
      } else {
        seat = `- THE LATE KIND'S OWN SEAT: mob owns the face's end (${topN} of ${t.late.n})`
      }
    }
  }
  const notes = []
  if (bill.unplaced > 0) notes.push(`${bill.unplaced} unplaced`)
  if (bill.unparsed > 0) notes.push(`${bill.unparsed} unparsed`)
  const note = notes.length ? ` (${notes.join(', ')})` : ''
  return `the late third's own kind (v0.855.0): early ${t.early.n} (${kindsText(t.early)}) / mid ${t.mid.n} (${kindsText(t.mid)}) / late ${t.late.n} (${kindsText(t.late)}) - the late third owns ${bill.lateShare}% of ${bill.timed} timed death(s)${note} ${seat}`
}
