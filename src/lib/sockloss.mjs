//
// sockloss.mjs - THE SOCKET LOSS'S OWN BOOK (v0.806.0)
//
// The fleet log carries a death certificate class every mining lens
// refused to own: when a client's TCP write dies, the logger prints a
// THREE-part burst - the raw stack header ('Error: write EPIPE' + the
// node internals the stack carries), then the bot-attributed pair
// ('F14 [F14] error: write EPIPE' and its twin 'F14 [F14] socket
// error: write EPIPE'). Face 89 (run 37715421436) carried 19 such
// losses - EPIPE x5 riding the duplicate-login kick churn, then a
// ECONNRESET x14 storm in the face's end phase - and no decompose row
// owned a single one. The runtime side has its own vocabulary
// (serverguard's SOCKET_LOSS_RE), but that is the fleet's guard, not
// the mine's read: the churn's client-side residue rode unread.
//
// sockLossCensus(lines) folds the fleet log's socket-loss bursts: the
// attributed 'error:' line is the loss (the first emission - the twin
// 'socket error:' line is the SAME loss's second certificate, never a
// second loss), folded per KIND (the errno byte, as the runtime's own
// SOCKET_LOSS_RE vocabulary spells it) and per BOT. Three reconciles
// ride the census honestly:
//   - the twin reconcile: every loss's 'socket error:' twin must exist
//     (missing = the certificate never landed; extra = a twin without
//     its loss - neither shape is silently absorbed);
//   - the raw reconcile: every burst's raw 'Error:' header counted by
//     kind; a raw kind count exceeding the attributed count is the
//     BLIND class (the stack died unattributed - the bot never named
//     itself) and never invents a bot;
//   - the log's own thirds clock: each loss rides early/mid/late by its
//     line position (the fleet log carries no wall clock - the line
//     index is the only clock the log owns; the end-phase teardown
//     burst's candidate signature is a LATE-dominated book).
// A loss-free, raw-free face reads the honest silence (null). A face
// with raw stacks but no attributed owner reads the blind book (n=0,
// the row still speaks - the fences never absorb evidence).
//

const SOCK_KINDS = 'EPIPE|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT'
const SOCK_LOSS_RE = new RegExp(`^(F\\d+) \\[\\1\\] error: (?:write |read )?(${SOCK_KINDS})$`)
const SOCK_TWIN_RE = new RegExp(`^(F\\d+) \\[\\1\\] socket error: (?:write |read )?(${SOCK_KINDS})$`)
const SOCK_RAW_RE = new RegExp(`^Error: (?:write |read )?(${SOCK_KINDS})$`)

/**
 * sockLossCensus(lines) - the socket-loss bursts' own census.
 * @param {string[]|null} [lines] the fleet19.log lines
 * @returns {null|{n: number, byKind: Object<string, number>,
 *   byBot: Object<string, number>, kinds: string[], total: number,
 *   thirds: {early: number, mid: number, late: number},
 *   twins: {n: number, missing: number, extra: number, holds: boolean},
 *   raw: {n: number, byKind: Object<string, number>, blind: number},
 *   verdict: null|{total: number, topKind: null|{cls: string, units: number,
 *     shareOfLosses: number, lever: string}, bad: number}}}
 *   the census (null on a loss-free, raw-free face)
 */
export function sockLossCensus (lines) {
  if (!Array.isArray(lines)) return null
  const total = lines.length
  const byKind = {}
  const byBot = {}
  const lossKeys = {}
  const thirds = { early: 0, mid: 0, late: 0 }
  let n = 0
  for (let i = 0; i < total; i++) {
    const m = SOCK_LOSS_RE.exec(typeof lines[i] === 'string' ? lines[i] : '')
    if (!m) continue
    n++
    byKind[m[2]] = (byKind[m[2]] || 0) + 1
    byBot[m[1]] = (byBot[m[1]] || 0) + 1
    const key = `${m[1]}|${m[2]}`
    lossKeys[key] = (lossKeys[key] || 0) + 1
    thirds[i < total / 3 ? 'early' : i < (2 * total) / 3 ? 'mid' : 'late']++
  }
  const twinKeys = {}
  let twins = 0
  for (let i = 0; i < total; i++) {
    const m = SOCK_TWIN_RE.exec(typeof lines[i] === 'string' ? lines[i] : '')
    if (!m) continue
    twins++
    const key = `${m[1]}|${m[2]}`
    twinKeys[key] = (twinKeys[key] || 0) + 1
  }
  let missing = 0
  let extra = 0
  for (const k of Object.keys(lossKeys)) missing += Math.max(0, lossKeys[k] - (twinKeys[k] || 0))
  for (const k of Object.keys(twinKeys)) extra += Math.max(0, twinKeys[k] - (lossKeys[k] || 0))
  const rawByKind = {}
  let raw = 0
  for (let i = 0; i < total; i++) {
    const m = SOCK_RAW_RE.exec(typeof lines[i] === 'string' ? lines[i] : '')
    if (!m) continue
    raw++
    rawByKind[m[1]] = (rawByKind[m[1]] || 0) + 1
  }
  let rawBlind = 0
  for (const [k, v] of Object.entries(rawByKind)) rawBlind += Math.max(0, v - (byKind[k] || 0))
  if (!n && !raw) return null
  return {
    n,
    byKind,
    byBot,
    kinds: Object.keys(byKind).sort(),
    total,
    thirds,
    twins: { n: twins, missing, extra, holds: missing === 0 && extra === 0 },
    raw: { n: raw, byKind: rawByKind, blind: rawBlind },
    verdict: sockLossVerdict(byKind), // (v0.806.0) the seat rides additively - the kickkinds precedent
  }
}

// (v0.806.0) THE SOCKET LOSS'S OWN SEAT - the census's verdict leg. THE
// KIND LAW (the byKind cells only, zero re-parsing - the v0.758.0 seat
// precedent): the top kind rides under the strict-majority law (a tie
// owns nothing - the storm-has-no-seat precedent) with the lever table's
// own front. The levers name the front without re-pricing it: EPIPE is
// the kick churn's residue candidate (the kicked client's socket dies
// writing), ECONNRESET is the connection's own reset (the end-phase
// teardown's signature candidate when the thirds clock rides late).
// Junk never invents a verdict: an empty mix reads null; non-finite or
// negative counts are skipped and counted (the count's own junk law -
// never priced, never silently dropped).
export const SOCK_LOSS_LEVERS = {
  EPIPE: 'the write pipe\'s own death - the kick churn\'s residue candidate (the kicked client\'s socket dies writing)',
  ECONNRESET: 'the connection\'s own reset - the end-phase teardown\'s signature candidate when the thirds clock rides late',
}

export function sockLossVerdict (byKind) {
  const mix = (byKind && typeof byKind === 'object' && !Array.isArray(byKind)) ? byKind : {}
  let total = 0
  let bad = 0
  let topUnits = 0
  let topCls = null
  for (const [k, v] of Object.entries(mix)) {
    if (!Number.isFinite(v) || v < 0) { bad++; continue }
    total += v
    if (v > topUnits) { topUnits = v; topCls = k }
  }
  if (total === 0) return null
  const leverFor = (k) => SOCK_LOSS_LEVERS[k] || 'the socket kind\'s own detail is the front'
  const topKind = topCls !== null && topUnits > total - topUnits
    ? { cls: topCls, units: topUnits, shareOfLosses: +(topUnits / total).toFixed(3), lever: leverFor(topCls) }
    : null
  return { total, topKind, bad }
}

// (v0.808.0) THE CHURN JOIN'S OWN REACH - the socket book's churn leg. The
// v0.806.0 levers named two candidates - EPIPE as the kick churn's residue,
// ECONNRESET as the end-phase teardown's own front - and both rode the word
// 'candidate'. The join prices them: every loss looks back within the
// WINDOW for its own bot's KICKED line (the burst's own reach - face 89's
// kick-to-loss gap rode 16 lines, the raw stack between them eats the
// slack), and every kick with no same-bot loss within the window after it
// rides bare (the kick whose socket never died - or whose loss sits beyond
// the reach). The fleet log carries no wall clock, so the line index is
// the only reach the join owns - the window is the burst's own anatomy,
// not a time claim. The counts stay raw on both sides (a kick within reach
// of two losses serves both honestly - nothing is silently absorbed); the
// one-truth pin: the join's per-kind cells must sum back to the census's
// own byKind (the WIRING test holds the two folds together).
export const SOCK_JOIN_WINDOW = 20
const SOCK_KICK_RE = /^(F\d+) \[\1\] KICKED: /
// (v0.812.0) the bare seat's own kind byte - the translate value, exactly
// the vocabulary kickkinds.mjs reads (v0.730.0): the fleet log's KICKED
// line carries the server's own reason string, and the bare fold reads
// the byte's own word or nothing (a kindless kick line rides nowhere -
// the cells'-own-sum law keeps the seat's book honest).
const SOCK_KICK_KIND_RE = /"translate":\{"type":"string","value":"([^"]+)"\}\}\}$/

/**
 * sockChurnJoin(lines, [window]) - the socket losses' churn join.
 * @param {string[]|null} [lines] the fleet19.log lines
 * @param {number} [window] the burst's own reach in lines
 * @returns {null|{window: number, losses: {n: number, joined: number,
 *   unjoined: number}, joinedByKind: Object<string, number>,
 *   unjoinedByKind: Object<string, number>,
 *   joinedPairs: string[], kicks: {n: number, bare: number},
 *   verdict: null|Object<string, {n: number, joined: number,
 *   unjoined: number, word: string}>}}
 *   the join (null on a kick-free, loss-free face)
 */
export function sockChurnJoin (lines, window = SOCK_JOIN_WINDOW) {
  if (!Array.isArray(lines)) return null
  const kicks = {} // bot -> [line indexes]
  const losses = [] // { i, bot, kind }
  for (let i = 0; i < lines.length; i++) {
    const s = typeof lines[i] === 'string' ? lines[i] : ''
    const km = SOCK_KICK_RE.exec(s)
    if (km) {
      const b = km[1]
      ;(kicks[b] = kicks[b] || []).push(i)
      continue
    }
    const lm = SOCK_LOSS_RE.exec(s)
    if (lm) losses.push({ i, bot: lm[1], kind: lm[2] })
  }
  if (!losses.length && !Object.keys(kicks).length) return null
  const joinedByKind = {}
  const unjoinedByKind = {}
  const joinedPairs = []
  const lossIdx = {} // bot -> [loss line indexes] (the bare read's own side)
  let joined = 0
  for (const { i, bot, kind } of losses) {
    unjoinedByKind[kind] = (unjoinedByKind[kind] || 0) + 1
    ;(lossIdx[bot] = lossIdx[bot] || []).push(i)
    const own = kicks[bot] || []
    let gap = null
    for (let j = own.length - 1; j >= 0; j--) {
      const d = i - own[j]
      if (d >= 1 && d <= window) { gap = d; break }
      if (d > window) break
    }
    if (gap !== null) {
      unjoinedByKind[kind]--
      joinedByKind[kind] = (joinedByKind[kind] || 0) + 1
      joined++
      joinedPairs.push(`${bot}@${gap}`)
    }
  }
  let bare = 0
  let kicksN = 0
  const bareByKind = {} // (v0.812.0) the bare kick's own kinds - the translate byte
  const bareByBot = {} // (v0.812.0) the bare kick's own bots - the whale's measure
  for (const [b, idxs] of Object.entries(kicks)) {
    kicksN += idxs.length
    const ownLosses = lossIdx[b] || []
    for (const k of idxs) {
      // bare iff NO same-bot loss sits inside the window after the kick
      // (the loss beyond the reach never serves it - face 89's F17 shape:
      // the timeout kick, then the EPIPE loss 171 lines later - bare)
      const within = ownLosses.some((li) => li > k && li - k <= window)
      if (!within) {
        bare++
        // (v0.812.0) the bare kick folds its own kind (the translate byte,
        // kickkinds' own vocabulary) and its own bot; a kick line without
        // the byte rides nowhere here - the cells'-own-sum law keeps the
        // seat's book honest (sum(bareByKind) <= bare, the WIRING pin).
        const km = SOCK_KICK_KIND_RE.exec(typeof lines[k] === 'string' ? lines[k] : '')
        if (km) bareByKind[km[1]] = (bareByKind[km[1]] || 0) + 1
        bareByBot[b] = (bareByBot[b] || 0) + 1
      }
    }
  }
  return {
    window,
    losses: { n: losses.length, joined, unjoined: losses.length - joined },
    joinedByKind,
    unjoinedByKind,
    joinedPairs,
    kicks: { n: kicksN, bare },
    bareByKind, // (v0.812.0) the bare kick's own kinds ride additively
    bareByBot, // (v0.812.0) the bare kick's own bots ride additively
    verdict: sockJoinVerdict(joinedByKind, unjoinedByKind), // (v0.808.0) the kinds' own words ride additively
  }
}

// (v0.808.0) THE JOIN'S OWN WORDS - the per-kind classification (the
// levers' candidates priced): a kind whose every loss sits inside a kick's
// reach rides the churn (the residue class); a kind the churn never
// touched rides its own front; anything between reads the mix (the
// residue and the own-front both ride). Junk never invents a word:
// non-finite or negative counts are skipped and counted.
export function sockJoinVerdict (joinedByKind, unjoinedByKind) {
  const j = (joinedByKind && typeof joinedByKind === 'object' && !Array.isArray(joinedByKind)) ? joinedByKind : {}
  const u = (unjoinedByKind && typeof unjoinedByKind === 'object' && !Array.isArray(unjoinedByKind)) ? unjoinedByKind : {}
  const kinds = new Set([...Object.keys(j), ...Object.keys(u)])
  const out = {}
  let bad = 0
  for (const k of kinds) {
    const a = Number.isFinite(j[k]) && j[k] >= 0 ? j[k] : (j[k] !== undefined ? (bad++, 0) : 0)
    const b = Number.isFinite(u[k]) && u[k] >= 0 ? u[k] : (u[k] !== undefined ? (bad++, 0) : 0)
    const n = a + b
    if (!n) continue
    const word = a === n
      ? 'rides the kick churn - the residue class'
      : a === 0
        ? 'rides its own front - the churn never touched it'
        : 'the mix is the shape - the residue and the own-front both ride'
    out[k] = { n, joined: a, unjoined: b, word }
  }
  if (bad) out.bad = bad
  return Object.keys(out).length ? out : null
}

// (v0.809.0) THE JOIN'S OWN SEAT - the reach's own book priced. The v0.808.0
// join counts raw on both sides (face 89 rode joined 2 of 19, face 90 rode
// joined 1 of 20) but no row ever said WHICH side owns the book - face 90's
// read inverted face 89's (20 duplicate_login kicks, 1 loss: the churn's
// sockets mostly survive the reach) and the inversion rode unnamed. The seat
// law (the v0.802.0 orphan seat's own shape): the join's own two cells
// (joined / unjoined) only, zero re-parsing; the book is the cells' own sum;
// the strict-majority law, a tie owns nothing (the storm-has-no-seat
// precedent); junk never invents a side - a non-finite or negative cell is
// skipped and counted (the honest-skip law, the real cells still tally). The
// words name the front: a joined majority is the residue's own shape (the
// kicked client's socket dies writing within the window), an unjoined
// majority is the churn's own exception (the loss's own front - the
// teardown's candidate side - rides the unjoined book).
export function sockJoinSeat (losses) {
  const c = (losses && typeof losses === 'object' && !Array.isArray(losses)) ? losses : {}
  let bad = 0
  const cell = (v) => {
    if (v === undefined) return 0
    if (!Number.isFinite(v) || v < 0) { bad++; return 0 }
    return v
  }
  const joined = cell(c.joined)
  const unjoined = cell(c.unjoined)
  const total = joined + unjoined
  if (!total) return null
  const owner = joined > unjoined ? 'joined' : unjoined > joined ? 'unjoined' : null
  const units = owner === 'joined' ? joined : owner === 'unjoined' ? unjoined : 0
  const word = owner === 'joined'
    ? 'the loss rides the churn\'s own reach - the residue is the shape (the kicked client\'s socket dies writing within the window)'
    : owner === 'unjoined'
      ? 'the churn\'s sockets survive the reach - the loss is its own exception (the teardown\'s front rides the unjoined book)'
      : null
  return { total, owner, units, share: total ? +(units / total).toFixed(3) : 0, word, bad }
}

// (v0.809.0) the seat's row - the prose lives only in the lib, the
// decompose rides the builder. A tie reads the no-owner row (the v0.806.0
// seat's own else-branch law, one row never both); an empty book reads the
// honest silence (null).
export function sockJoinSeatRow (join) {
  if (!join || typeof join !== 'object' || Array.isArray(join)) return null
  const seat = sockJoinSeat(join.losses)
  if (!seat) return null
  if (!seat.owner) return 'no solo side owns the reach\'s book (the tie owns nothing)'
  return `${seat.owner} owns ${seat.units} of ${seat.total} socket loss(es) (${(seat.share * 100).toFixed(1)}%) - THE REACH'S OWN SEAT: ${seat.word}`
}

// (v0.809.0) THE OWN-FRONT'S OWN KINDS - the unjoined book's riders (the
// v0.803.0 ask riders' own law): measure-not-owner (the riders price the
// teardown front's own mix, they never own the book), >=2 classes only (the
// solo-class fence - a lone kind's measure is the seat row's own story), the
// byte order decides the ranked ties, junk never invents a kind (a
// non-finite or negative cell is skipped and counted, the real cells still
// tally the unjoined book).
export function sockJoinRiders (unjoinedByKind) {
  const u = (unjoinedByKind && typeof unjoinedByKind === 'object' && !Array.isArray(unjoinedByKind)) ? unjoinedByKind : {}
  const cells = []
  let bad = 0
  for (const [k, v] of Object.entries(u)) {
    if (!Number.isFinite(v) || v < 0) { if (v !== undefined) bad++; continue }
    if (v === 0) continue
    cells.push([k, v])
  }
  if (cells.length < 2) return null
  cells.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const total = cells.reduce((s, [, v]) => s + v, 0)
  const top = cells.slice(0, 2)
  const sum = top.reduce((s, [, v]) => s + v, 0)
  return { total, top: top.map(([cls, units]) => ({ cls, units })), sum, share: +(sum / total).toFixed(3), bad }
}

// (v0.809.0) the riders' row - fires only when the unjoined book holds two
// or more kinds (the solo-class fence); face 90's unjoined-zero book reads
// the honest silence.
export function sockJoinRidersRow (join) {
  if (!join || typeof join !== 'object' || Array.isArray(join)) return null
  const r = sockJoinRiders(join.unjoinedByKind)
  if (!r) return null
  const pair = r.top.map(({ cls, units }) => `${cls} x${units}`).join(' + ')
  return `${pair} own ${r.sum} of ${r.total} unjoined loss(es) (${(r.share * 100).toFixed(1)}%) - THE OWN-FRONT'S OWN KINDS: the teardown front's own mix rides measured, not owning (the seat's measure-not-owner law)`
}

// (v0.812.0) THE BARE KICK'S OWN SEAT - the churn-without-death's own book
// priced. Face 90's 20 kicks carried ONE socket loss - 19 rode bare, and
// the join's bare side had no seat of its own (the inversion of face 89's
// 2-of-19 shape rode unnamed; face 91 rode the bare 7 of 8). The seat law
// (the v0.802.0 seat's own shape, the v0.809.0 join seat's own words): the
// join's own bareByKind cells only, zero re-parsing; the book is the
// cells' own sum; the strict-majority law, a tie owns nothing; junk never
// invents a kind - a non-finite or negative cell is skipped and counted,
// the real cells still tally. The words ride the kickkinds lever table's
// own fronts: a duplicate_login majority is the churn's own re-entry shape
// (the relog lane's residue candidate - the session the churn rebuilds),
// a timeout majority is the client's own stall.
/**
 * sockBareSeat(bareByKind) - the bare kick's own seat.
 * @param {Object<string, number>|null} [bareByKind] the join's own bare kinds
 * @returns {null|{total: number, owner: null|string, units: number,
 *   share: number, word: null|string, bad: number}}
 *   the seat (null on an empty book)
 */
export function sockBareSeat (bareByKind) {
  const cells = []
  let bad = 0
  for (const [k, v] of Object.entries(bareByKind && typeof bareByKind === 'object' && !Array.isArray(bareByKind) ? bareByKind : {})) {
    if (!Number.isFinite(v) || v < 0) { if (v !== undefined) bad++; continue }
    if (v === 0) continue
    cells.push([k, v])
  }
  if (!cells.length) return null
  cells.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const total = cells.reduce((s, [, v]) => s + v, 0)
  const [topKind, topUnits] = cells[0]
  const tie = cells.length > 1 && cells[1][1] === topUnits
  const owner = tie ? null : topKind
  const units = tie ? 0 : topUnits
  const word = tie
    ? null
    : topKind.includes('duplicate_login')
      ? 'the churn\'s own re-entry shape - the session the churn rebuilds rides bare (the relog lane\'s residue candidate)'
      : topKind === 'disconnect.timeout'
        ? 'the client\'s own stall is the front - the server dropped the silence and the socket never died'
        : 'the kind\'s own front prices the book (the v0.763.0 lever table\'s own lane)'
  return { total, owner, units, share: total ? +(units / total).toFixed(3) : 0, word, bad }
}

// (v0.812.0) the bare seat's row - the prose lives only in the lib, the
// decompose rides the builder. A tie reads the no-owner row (one row never
// both); an empty book reads the honest silence (null).
/**
 * sockBareSeatRow(join) - the bare seat's row.
 * @param {Object|null} [join] the sockChurnJoin shape
 * @returns {null|string} the row (null on an empty book)
 */
export function sockBareSeatRow (join) {
  if (!join || typeof join !== 'object' || Array.isArray(join)) return null
  const seat = sockBareSeat(join.bareByKind)
  if (!seat) return null
  if (!seat.owner) return 'no solo kind owns the bare book (the tie owns nothing)'
  return `${seat.owner} owns ${seat.units} of ${seat.total} bare kick(s) (${(seat.share * 100).toFixed(1)}%) - THE BARE KICK'S OWN SEAT: ${seat.word}`
}

// (v0.812.0) THE BARE KICK'S OWN BOTS - the bare book's riders (the
// v0.809.0 riders' own law): measure-not-owner (the bots price the bare
// front's own mix, they never own the book - the whale's reach is the
// measure), >=2 classes only (the solo-class fence), the byte order
// decides the ranked ties ('F1' < 'F10' < 'F2' - the bot tag's own
// lexicographic byte), junk never invents a bot (a non-finite or negative
// cell is skipped and counted, the real cells still tally).
/**
 * sockBareRiders(bareByBot) - the bare book's bot riders.
 * @param {Object<string, number>|null} [bareByBot] the join's own bare bots
 * @returns {null|{total: number, top: {cls: string, units: number}[],
 *   sum: number, share: number, bad: number}}
 *   the riders (null under the solo-class fence)
 */
export function sockBareRiders (bareByBot) {
  const u = (bareByBot && typeof bareByBot === 'object' && !Array.isArray(bareByBot)) ? bareByBot : {}
  const cells = []
  let bad = 0
  for (const [k, v] of Object.entries(u)) {
    if (!Number.isFinite(v) || v < 0) { if (v !== undefined) bad++; continue }
    if (v === 0) continue
    cells.push([k, v])
  }
  if (cells.length < 2) return null
  cells.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const total = cells.reduce((s, [, v]) => s + v, 0)
  const top = cells.slice(0, 2)
  const sum = top.reduce((s, [, v]) => s + v, 0)
  return { total, top: top.map(([cls, units]) => ({ cls, units })), sum, share: +(sum / total).toFixed(3), bad }
}

// (v0.812.0) the bare riders' row - fires only when the bare book holds
// two or more bots (the solo-class fence); a one-bot bare book reads the
// honest silence (null).
/**
 * sockBareRidersRow(join) - the bare riders' row.
 * @param {Object|null} [join] the sockChurnJoin shape
 * @returns {null|string} the row (null under the solo-class fence)
 */
export function sockBareRidersRow (join) {
  if (!join || typeof join !== 'object' || Array.isArray(join)) return null
  const r = sockBareRiders(join.bareByBot)
  if (!r) return null
  const pair = r.top.map(({ cls, units }) => `${cls} x${units}`).join(' + ')
  return `${pair} own ${r.sum} of ${r.total} bare kick(s) (${(r.share * 100).toFixed(1)}%) - THE BARE KICK'S OWN CROWD: the bare front's own bots ride measured, not owning (the relog lane's reach is the measure)`
}
