// (v0.852.0) THE CHEST DOOR'S OWN BOT BILL - the chest door choke's WHO+WHERE read.
//
// The bank's docket (v0.700.0) priced the door leg's aggregates (face 127:
// the door's rate 5.9% of 135 visit-lines, chest unreachable 7 - the choke's
// FOURTH face, 12% -> 5.9% the worst read yet) and the decide door's own book
// (v0.720.0) names the shared dead chest for decide rides only. Nobody reads
// WHO rode the chest-unreachable verdict and WHICH CHEST refused them - the
// door's own crowd and the door's own seat.
//
// chestDoorBill(lines) folds the chest-unreachable rides per bot per lane
// shape (the doorstepStormCensus signature law: parsed cells in, one shape
// out, no new skin grammar - the rides' own bytes):
//   the hop shape:  'F9 [F9] hop: chest at [-155,70,404] d=9 zero: chest unreachable (No path to the goal!)'
//   the bank shape: 'F9 bank: chest unreachable (No path to the goal!) (32 blocks from yard) - walking back'
// The hop ride carries the chest's own position (the WHERE cell); the bank
// ride carries no position (the walk-back verdict, the WHERE honestly absent).
//
// The verdict split rides the message's own words (no new grammar): 'No path'
// -> noPath, 'Took to long' -> decide, 'budget exhausted (walk floor)' ->
// budgetFloor (v0.861.0 - the door's own second seat), else other.
//
// A chest-door-free face reads the honest silence (null).
//
// (v0.861.0) THE DOOR'S OWN WHYS - the bill's own blind spot repaired (the
// v0.851.0 lesson's own shape: the lens's filter hid the class it priced).
// Face 134 (run 37886112038): the docket's door leg read chest unreachable
// 39 of 43 (90.7%, the class's third face owning the leg) while the bill
// read only 24 rides with verdicts no-path 23 / other 1 - the hop regex's
// own '\([^)]+\)$' capture REJECTED the nested-paren why bytes (the budget
// floor's own message carries a second paren: 'chest unreachable (budget
// exhausted (walk floor))' - 10 hop rides + the bank zero's 2 + the bank
// fallback's 2 never parsed), and the verdict grammar lumped the survivors
// in 'other'. The repair: the hop capture reads greedy ('(.+)'), the bank
// capture reads non-greedy (the yard cell survives), the bank ZERO shape
// ('F1 bank: 0 (chest unreachable (...))' - the deposit family's own
// unreachable byte) joins the fold, and the verdict split names the budget
// floor (the door's own second seat). The bill's true face-134 page: 37
// rides - no-path 23 (62%) / budget-floor 12 (32%) - the class the 'other
// 1' byte rode unnamed owns a THIRD of the door. The fallback family's own
// bytes ('bank fallback: none (...)') stay with the docket's fallback leg
// (the bill reads the walk rides, the docket counts the visit-line
// outcomes - the join is named in the worklog, not forced here).
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only, the
// v0.379/.../v0.851.0 precedent).
//

// The hop ride's own byte: the bot token, the chest's position, the distance,
// the unreachable verdict with its message.
// (v0.861.0) the hop capture reads GREEDY - the why bytes carry nested
// parens ('budget exhausted (walk floor)', 'walk to chest (retry): timeout
// after Nms') and the old '[^)]+' capture rejected every one of them (the
// lens's own blind spot - face 134's 11 invisible rides).
const CHEST_DOOR_HOP_RE = /^(F\d+) \[F\d+\] hop: chest at \[(-?\d+),(-?\d+),(-?\d+)\] d=(\d+) zero: chest unreachable \((.+)\)$/

// The bank ride's own byte: no position (the WHERE absent), the optional
// blocks-from-yard cell and the walk-back tail. The message capture reads
// NON-GREEDY so the yard cell survives a nested-paren message.
const CHEST_DOOR_BANK_RE = /^(F\d+) bank: chest unreachable \((.+?)\)(?: \((\d+) blocks from yard\))?(?: - walking back)?$/

// The bank ZERO ride's own byte (v0.861.0): the deposit family's own
// unreachable verdict - the walk died inside the deposit attempt and the
// zero line names the why. No position, no yard cell (the bank family's
// own shape). Greedy capture: the message's own nested parens stay whole.
const CHEST_DOOR_BANK_ZERO_RE = /^(F\d+) bank: 0 \(chest unreachable \((.+)\)\)$/

function verdictOf (msg) {
  if (/No path/.test(msg)) return 'noPath'
  if (/Took to long/.test(msg)) return 'decide'
  if (/budget exhausted \(walk floor\)/.test(msg)) return 'budgetFloor'
  return 'other'
}

/**
 * chestDoorBill(lines) - the chest-unreachable rides, per bot, per shape,
 * per chest (the hop rides' WHERE join).
 *
 * @param {string[]|string|null} lines the face log (array or raw blob)
 * @returns {null|{n: number,
 *   hop: {n: number},
 *   bank: {n: number},
 *   byBot: Object<string, number>,
 *   repeats: Object<string, number>,
 *   chests: Object<string, {n: number, bots: Object<string, number>}>,
 *   distinctChests: number,
 *   sharedChests: number,
 *   verdicts: {noPath: number, decide: number, budgetFloor: number, other: number}}}
 *   null when the face rode no chest-unreachable verdict (the honest silence).
 */
export function chestDoorBill (lines) {
  const list = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : null)
  if (!list) return null
  const bill = {
    n: 0, hop: { n: 0 }, bank: { n: 0 },
    byBot: {}, repeats: {},
    chests: {}, distinctChests: 0, sharedChests: 0,
    verdicts: { noPath: 0, decide: 0, budgetFloor: 0, other: 0 }
  }
  for (const line of list) {
    if (typeof line !== 'string') continue
    const hop = line.match(CHEST_DOOR_HOP_RE)
    if (hop) {
      bill.n++
      bill.hop.n++
      const bot = hop[1]
      bill.byBot[bot] = (bill.byBot[bot] || 0) + 1
      const chest = `${hop[2]},${hop[3]},${hop[4]}`
      if (!bill.chests[chest]) bill.chests[chest] = { n: 0, bots: {} }
      bill.chests[chest].n++
      bill.chests[chest].bots[bot] = (bill.chests[chest].bots[bot] || 0) + 1
      bill.verdicts[verdictOf(hop[6])]++
      continue
    }
    const bank = line.match(CHEST_DOOR_BANK_RE)
    if (bank) {
      bill.n++
      bill.bank.n++
      const bot = bank[1]
      bill.byBot[bot] = (bill.byBot[bot] || 0) + 1
      bill.verdicts[verdictOf(bank[2])]++
      continue
    }
    const bankZero = line.match(CHEST_DOOR_BANK_ZERO_RE)
    if (bankZero) {
      bill.n++
      bill.bank.n++
      const bot = bankZero[1]
      bill.byBot[bot] = (bill.byBot[bot] || 0) + 1
      bill.verdicts[verdictOf(bankZero[2])]++
    }
  }
  if (bill.n === 0) return null
  for (const [bot, count] of Object.entries(bill.byBot)) {
    if (count >= 2) bill.repeats[bot] = count
  }
  bill.distinctChests = Object.keys(bill.chests).length
  for (const chest of Object.values(bill.chests)) {
    if (Object.keys(chest.bots).length >= 2) bill.sharedChests++
  }
  return bill
}

/**
 * chestDoorBillRow(bill) - the row, fenced.
 *
 * The consistency fence (the house law): the shape must agree with itself
 * before it renders - hop + bank === n, the byBot sum === n, the verdict
 * sums === n, the chests' n sum === hop.n, every chest's bots sum === its n.
 * A self-inconsistent shape never renders (null); a chest-door-free face
 * reads the honest silence (null).
 *
 * @param {null|object} bill the chestDoorBill result
 * @returns {null|string} null when nothing to say, else the row line
 */
export function chestDoorBillRow (bill) {
  if (!bill || typeof bill !== 'object') return null
  const finite = (x) => Number.isFinite(x)
  if (!finite(bill.n) || bill.n <= 0) return null
  if (!finite(bill.hop?.n) || !finite(bill.bank?.n)) return null
  if (bill.hop.n + bill.bank.n !== bill.n) return null
  const byBotSum = Object.values(bill.byBot || {}).reduce((a, b) => a + b, 0)
  if (byBotSum !== bill.n) return null
  const v = bill.verdicts || {}
  if (!finite(v.noPath) || !finite(v.decide) || !finite(v.budgetFloor) || !finite(v.other)) return null
  if (v.noPath + v.decide + v.budgetFloor + v.other !== bill.n) return null
  let chestSum = 0
  for (const chest of Object.values(bill.chests || {})) {
    if (!finite(chest.n) || chest.n <= 0) return null
    const botsSum = Object.values(chest.bots || {}).reduce((a, b) => a + b, 0)
    if (botsSum !== chest.n) return null
    chestSum += chest.n
  }
  if (chestSum !== bill.hop.n) return null
  const repeats = Object.entries(bill.repeats || {}).sort((a, b) => b[1] - a[1])
  const botCell = `bots ${Object.keys(bill.byBot).length}${repeats.length > 0 ? ` (repeats ${repeats.map(([k, c]) => `${k}=${c}`).join(' ')})` : ', no repeats'}`
  const shared = Object.entries(bill.chests)
    .filter(([, c]) => Object.keys(c.bots).length >= 2)
    .sort((a, b) => b[1].n - a[1].n)
  const chestCell = bill.distinctChests > 0
    ? `chests ${bill.distinctChests} distinct${shared.length > 0 ? ` (shared ${shared.length}: ${shared.map(([pos, c]) => `[${pos}] x${c.n} ${Object.keys(c.bots).sort().join('+')}`).join(', ')})` : ', none shared'}`
    : 'chests none (the hop rides absent)'
  const verdictCell = `verdicts no-path ${v.noPath} / decide ${v.decide}${v.budgetFloor > 0 ? ` / budget-floor ${v.budgetFloor}` : ''}${v.other > 0 ? ` / other ${v.other}` : ''}`
  return `the chest door's own bot bill (v0.861.0): ${bill.n} ride(s) - hop ${bill.hop.n} / bank ${bill.bank.n} - ${botCell} - ${chestCell} - ${verdictCell} - THE DOOR'S OWN CROWD: the repeats name the riders, the shared column names the dead chest`
}

// (v0.856.0) THE DECIDE DOOR'S OWN DISTANCE - the walk-budget front's own
// read. The bot bill priced WHO rode the door's refusals and WHICH chest
// refused them two faces running (face 128: decide 6/11, face 129: decide
// 11/15 - the 'Took to long' class is the door's own seat now) - but the
// decide rides' own DISTANCE rode unnamed: are the decide chests the
// FARTHER chests (the walk budget dies on the long approach), or the same
// range as the no-path rides (the budget dies everywhere)? The hop ride's
// own byte carries the answer ('d=N' - the same regex the bill reads, the
// one-parser law: no new grammar, no re-lexing); the bank byte carries no
// distance and stays honestly out (the bank family's own shape).
//
// Pure helper over the same hop ride regex - reads the lines once, keeps
// the per-verdict distance lists, never mutates, junk-safe (a hop line
// that fails the ride grammar judges nothing - the escape hatch is the
// bill's own unparsed law).
export function chestDoorDistance (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  if (!Array.isArray(rows)) return null
  const ds = { noPath: [], decide: [], budgetFloor: [], other: [] }
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const hop = l.match(CHEST_DOOR_HOP_RE)
    if (!hop) continue
    ds[verdictOf(hop[6])].push(Number(hop[5]))
  }
  const mk = (list) => list.length === 0
    ? null
    : {
        n: list.length,
        min: Math.min(...list),
        max: Math.max(...list),
        avg: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10
      }
  const shape = { decide: mk(ds.decide), noPath: mk(ds.noPath), budgetFloor: mk(ds.budgetFloor), other: mk(ds.other) }
  if (shape.decide === null && shape.noPath === null && shape.budgetFloor === null && shape.other === null) return null
  return shape
}

/** THE CONSISTENCY FENCE - the row renders only when the shape agrees with
 * itself: every bucket's n matches its list length... the shape carries
 * the folded stats, so the fence re-checks the arithmetic the fold
 * promised: min <= avg <= max, n >= 1, and at least one side present. A
 * self-inconsistent shape never renders (the v0.852.0 fence law). */
export function chestDoorDistanceRowConsistent (shape) {
  if (!shape || typeof shape !== 'object') return false
  const ok = (b) => b === null || (Number.isFinite(b.n) && b.n >= 1 &&
    Number.isFinite(b.min) && Number.isFinite(b.max) && Number.isFinite(b.avg) &&
    b.min <= b.avg && b.avg <= b.max)
  if (!ok(shape.decide) || !ok(shape.noPath) || !ok(shape.budgetFloor) || !ok(shape.other)) return false
  return shape.decide !== null || shape.noPath !== null || shape.budgetFloor !== null || shape.other !== null
}

/** The row: 'the decide door's own distance (v0.858.0): decide rides d
 * 12..30 (avg 20.8 of 5) vs no-path rides d 8..16 (avg 11 of 5) - THE
 * DECIDE'S OWN SEAT: the decide chests walk farther'. Both sides needed
 * for the seat comparison; a solo class reads its own honest row. The
 * (v0.858.0) THIN SEAT'S OWN GUARD: a seat never names off a solo ride -
 * either side at n=1 reads the sample note and the seat waits (face
 * 131's own page: n=1 vs n=1 named THE DECIDE'S OWN SEAT, the seat
 * face 129's fuller page denied - the comparison needs both sides at
 * n>=2 before it prices the front). */
export function chestDoorDistanceRow (shape) {
  if (!chestDoorDistanceRowConsistent(shape)) return null
  const cell = (b, name) => b === null ? `${name} rides none` : `${name} rides d ${b.min}..${b.max} (avg ${b.avg} of ${b.n})`
  const head = `the decide door's own distance (v0.861.0): ${cell(shape.decide, 'decide')} vs ${cell(shape.noPath, 'no-path')}${shape.budgetFloor !== null ? ` vs budget-floor rides d ${shape.budgetFloor.min}..${shape.budgetFloor.max} (avg ${shape.budgetFloor.avg} of ${shape.budgetFloor.n})` : ''}${shape.other !== null ? ` vs other rides d ${shape.other.min}..${shape.other.max} (avg ${shape.other.avg} of ${shape.other.n})` : ''}`
  let seat
  if (shape.decide === null || shape.noPath === null) seat = '- THE DISTANCE READ: one class rode alone - the comparison waits'
  else if (shape.decide.n < 2 || shape.noPath.n < 2) seat = `- THE SEAT'S OWN SAMPLE: decide n=${shape.decide.n} vs no-path n=${shape.noPath.n} - the thin side waits for its second ride`
  else if (shape.decide.avg > shape.noPath.avg) seat = "- THE DECIDE'S OWN SEAT: the decide chests walk farther - the walk budget dies on the long approach"
  else if (shape.decide.avg < shape.noPath.avg) seat = "- THE NO-PATH'S OWN SEAT: the no-path chests walk farther - the geometry owns the door, not the clock"
  else seat = '- THE DISTANCES AGREE: the budget dies everywhere, not on the approach'
  return `${head} ${seat}`
}

// (v0.860.0) THE NO-PATH'S OWN RING - the door's no-path refusals' own
// distance-band read. The no-path class INVERTED the door two faces
// running (face 133: decide 0, face 134: no-path 23 of 24 rides = 96% -
// the decide-majority faces 128/129 named) - and the front's own question
// rode unnamed: are the refused chests OUTSIDE the ring's honest reach
// (the walk cannot arrive - the v0.823.0 preflight's own law: the walk
// that cannot arrive should never rent the clock), or INSIDE it (the
// geometry - water, terrain - owns the door, not the distance)? The
// refusal's own d rides the answer through the SAME hop regex the bill
// reads (the one-parser law - no new grammar), banded by the kill-dist
// ruler's own shape: close d<=10, mid 11..25, far 26+.
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only).
export function chestNoPathRing (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  if (!Array.isArray(rows)) return null
  const ds = { close: [], mid: [], far: [] }
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const hop = l.match(CHEST_DOOR_HOP_RE)
    if (!hop) continue
    if (verdictOf(hop[6]) !== 'noPath') continue
    const d = Number(hop[5])
    if (!Number.isFinite(d)) continue
    if (d <= 10) ds.close.push(d)
    else if (d <= 25) ds.mid.push(d)
    else ds.far.push(d)
  }
  const n = ds.close.length + ds.mid.length + ds.far.length
  if (n === 0) return null
  const mk = (list) => list.length === 0
    ? null
    : {
        n: list.length,
        min: Math.min(...list),
        max: Math.max(...list),
        avg: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10
      }
  return { n, close: mk(ds.close), mid: mk(ds.mid), far: mk(ds.far) }
}

/** THE CONSISTENCY FENCE (the v0.852.0 fence law): the bands' n sum to
 * the ring's n, every present band obeys min <= avg <= max with n >= 1.
 * A self-inconsistent ring never renders. */
export function chestNoPathRingConsistent (ring) {
  if (!ring || typeof ring !== 'object') return false
  if (!Number.isFinite(ring.n) || ring.n < 1) return false
  let sum = 0
  for (const b of [ring.close, ring.mid, ring.far]) {
    if (b === null || b === undefined) continue
    if (!Number.isFinite(b.n) || b.n < 1) return false
    if (!Number.isFinite(b.min) || !Number.isFinite(b.max) ||
      !Number.isFinite(b.avg)) return false
    if (b.min > b.avg || b.avg > b.max) return false
    sum += b.n
  }
  return sum === ring.n
}

/** The row: 'the no-path ring's own reach (v0.860.0): 18 refusal(s) -
 * close 0 / mid 14 (d 13..25 avg 16.9) / far 4 (d 32..40 avg 36.3) - THE
 * MID'S OWN RING: the refusals ride inside the reach - the geometry
 * (water, terrain), not the distance, owns the door'. The seat needs a
 * MAJORITY band (> n/2) - a spread reads the tie law honestly. */
export function chestNoPathRingRow (ring) {
  if (!chestNoPathRingConsistent(ring)) return null
  const cell = (b, name) => b === null
    ? `${name} 0`
    : `${name} ${b.n} (d ${b.min}..${b.max} avg ${b.avg})`
  const head = `the no-path ring's own reach (v0.860.0): ${ring.n} refusal(s) - ${cell(ring.close, 'close')} / ${cell(ring.mid, 'mid')} / ${cell(ring.far, 'far')}`
  const half = ring.n / 2
  let seat
  if (ring.far !== null && ring.far.n > half) seat = "- THE FAR'S OWN SEAT: the refusals ride the ring's edge - the walk that cannot arrive should never rent (the v0.823.0 preflight's own law)"
  else if (ring.mid !== null && ring.mid.n > half) seat = "- THE MID'S OWN RING: the refusals ride inside the reach - the geometry (water, terrain), not the distance, owns the door"
  else if (ring.close !== null && ring.close.n > half) seat = "- THE CLOSE'S OWN RING: the refusals ride the home ring - the doorstep owns the door"
  else seat = '- THE SPREAD IS THE SHAPE: no band owns the refusals - the tie law held'
  return `${head} ${seat}`
}

// (v0.862.0) THE STUCK CHEST'S OWN BOOK - the no-path refusals' own
// per-chest repeat fold. The ring (v0.860.0) banded the refusals' d and
// named the geometry the door's owner (face 134: mid 14 of 18) - but the
// fold rode band-aggregate only: WHICH chest refused, and WHICH chest
// refused AGAIN, rode unnamed. The exclude front's own question rode with
// it: a chest that refuses no-path TWICE is the exclude machinery's own
// candidate (the v0.853.0 swap voice's exclude-one-candidate bound -
// the twice-refused chest should never re-rent its walk), while a chest
// refused once is the ring's noise. The refusal's own d rides the walk
// the chest rented - so the repeats' ride-share prices the cure BEFORE
// the fleet wiring: walks rented on repeats / all no-path walks.
//
// Reads through the SAME hop regex the bill and the ring read (the
// one-parser law - no new grammar), filters the no-path verdict (the
// class that owns the door - face 134: 23 of 24), folds per chest:
// the rides, the bots, the d stats, the band split (the ring's own
// ruler: close d<=10, mid 11..25, far 26+ - the one-ruler law).
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only).
export function chestNoPathRepeats (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  if (!Array.isArray(rows)) return null
  const bandOf = (d) => d <= 10 ? 'close' : (d <= 25 ? 'mid' : 'far')
  const chests = {}
  let n = 0
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const hop = l.match(CHEST_DOOR_HOP_RE)
    if (!hop) continue
    if (verdictOf(hop[6]) !== 'noPath') continue
    const d = Number(hop[5])
    if (!Number.isFinite(d)) continue
    n++
    const pos = `${hop[2]},${hop[3]},${hop[4]}`
    if (!chests[pos]) chests[pos] = { n: 0, bots: {}, ds: [], bands: { close: 0, mid: 0, far: 0 } }
    const c = chests[pos]
    c.n++
    c.bots[hop[1]] = (c.bots[hop[1]] || 0) + 1
    c.ds.push(d)
    c.bands[bandOf(d)]++
  }
  if (n === 0) return null
  const mkD = (ds) => ({
    n: ds.length,
    min: Math.min(...ds),
    max: Math.max(...ds),
    avg: Math.round((ds.reduce((a, b) => a + b, 0) / ds.length) * 10) / 10
  })
  const shaped = {}
  for (const [pos, c] of Object.entries(chests)) {
    shaped[pos] = {
      n: c.n,
      bots: { ...c.bots },
      d: mkD(c.ds),
      bands: { ...c.bands },
      bandCell: ['close', 'mid', 'far'].filter(b => c.bands[b] > 0).join('+')
    }
  }
  const repeatChests = Object.entries(shaped)
    .filter(([, c]) => c.n >= 2)
    .map(([pos, c]) => ({ pos, ...c }))
    .sort((a, b) => b.n - a.n ||
      Object.keys(b.bots).length - Object.keys(a.bots).length ||
      a.pos.localeCompare(b.pos))
  const repeatRides = repeatChests.reduce((a, c) => a + c.n, 0)
  return {
    n,
    chests: shaped,
    distinctChests: Object.keys(shaped).length,
    repeatChests,
    repeatRides,
    soloRides: n - repeatRides
  }
}

/** THE CONSISTENCY FENCE (the v0.852.0 fence law): the chests' n sum to
 * the book's n, every chest's bots sum to its n, the d stats obey
 * min <= avg <= max with n >= 1 and match the chest's ride count, the
 * band counts sum to the chest's n, the repeats' ride-share arithmetic
 * closes (repeatRides + soloRides === n, every repeat at n >= 2). A
 * self-inconsistent book never renders. */
export function chestNoPathRepeatsConsistent (book) {
  if (!book || typeof book !== 'object') return false
  if (!Number.isFinite(book.n) || book.n < 1) return false
  if (!Number.isFinite(book.distinctChests) || book.distinctChests < 1) return false
  if (!Number.isFinite(book.repeatRides) || !Number.isFinite(book.soloRides)) return false
  if (book.repeatRides + book.soloRides !== book.n) return false
  let sum = 0
  for (const c of Object.values(book.chests || {})) {
    if (!Number.isFinite(c.n) || c.n < 1) return false
    const botsSum = Object.values(c.bots || {}).reduce((a, b) => a + b, 0)
    if (botsSum !== c.n) return false
    const d = c.d || {}
    if (!Number.isFinite(d.n) || d.n !== c.n) return false
    if (!Number.isFinite(d.min) || !Number.isFinite(d.max) || !Number.isFinite(d.avg)) return false
    if (d.min > d.avg || d.avg > d.max) return false
    const bandSum = ['close', 'mid', 'far'].reduce((a, b) => a + (c.bands?.[b] || 0), 0)
    if (bandSum !== c.n) return false
    sum += c.n
  }
  if (sum !== book.n) return false
  if (Object.keys(book.chests || {}).length !== book.distinctChests) return false
  let repeatSum = 0
  for (const r of book.repeatChests || []) {
    if (!Number.isFinite(r.n) || r.n < 2) return false
    const src = book.chests[r.pos]
    if (!src || src.n !== r.n) return false
    repeatSum += r.n
  }
  return repeatSum === book.repeatRides
}

/** The row: 'the no-path repeats' own book (v0.862.0): 18 refusal(s) on
 * 13 distinct chest(s) - repeats 3 ([-117,70,414] x4 F1+F19+F3 d 14..32
 * avg 21.3 mid+far, ...) - walks rented on repeats 8 of 18 (44%) - THE
 * EXCLUDE'S OWN CANDIDATES: the twice-refused chest re-rents its walk -
 * the cross-bot repeat names the swap list, the same-bot repeat names
 * the memory hole'. The seat law: a MAJORITY of the walks rented on
 * repeats (> n/2) names the rent the exclude machinery would stop; a
 * clean face (every chest refused once) reads the honest once. */
export function chestNoPathRepeatsRow (book) {
  if (!chestNoPathRepeatsConsistent(book)) return null
  const head = `the no-path repeats' own book (v0.862.0): ${book.n} refusal(s) on ${book.distinctChests} distinct chest(s)`
  const repeatsCell = book.repeatChests.length > 0
    ? `- repeats ${book.repeatChests.length} (${book.repeatChests.map(r => `[${r.pos}] x${r.n} ${Object.keys(r.bots).sort().join('+')} d ${r.d.min}..${r.d.max} avg ${r.d.avg} ${r.bandCell}`).join(', ')})`
    : '- repeats none (every chest refused once)'
  const pct = Math.round((book.repeatRides / book.n) * 100)
  const priceCell = `- walks rented on repeats ${book.repeatRides} of ${book.n} (${pct}%)`
  let seat
  if (book.repeatChests.length === 0) seat = "- THE HONEST ONCE: the ring's noise owns, the repeats wait for their second face"
  else if (book.repeatRides > book.n / 2) seat = "- THE REPEAT'S OWN RENT: the majority of the walks rented on chests that had already refused - the exclude machinery's own front"
  else seat = "- THE EXCLUDE'S OWN CANDIDATES: the twice-refused chest re-rents its walk - the cross-bot repeat names the swap list, the same-bot repeat names the memory hole"
  return `${head} ${repeatsCell} ${priceCell} ${seat}`
}

// (v0.869.0) THE EXCLUDE'S OWN CANDIDATE LIST - the repeats book's own
// pricing artifact. The row (v0.862.0) names the front: the twice-refused
// chest re-rents its walk (face 138: 18 refusals on 13 chests, repeats 3
// cross-bot, walks rented on repeats 8 of 18 = 44% - the face-134 storm
// signature back). The list prices the CANDIDATES: the book's own order
// (the heaviest chest, then the widest bot crowd, then the position)
// rides as the priority, the kind reads from the crowd - a cross-bot
// repeat names the SWAP LIST (different bots paid the same door: the
// fleet's shared truth, the v0.23.1 swap's next-chest ring prices it
// out), a same-bot repeat names the MEMORY HOLE (one bot came BACK to
// the refused chest: the private loop, the TTL's own class). THE BOUND
// (the v0.853.0 swap voice's exclude-one-candidate law): the list prices
// AT MOST ONE candidate per face - a face that names many has not priced
// any; the top candidate rides, the rest stay the honest spread.
// Junk-safe: an inconsistent book prices nothing (the fence law), a
// clean face prices nothing (the honest once).
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only) -
// the fleet wire (the candidate riding the deposit chain's own exclude)
// waits for the pricing's own field verdict.
// @param {object} book - the chestNoPathRepeats fold
// @returns {null | {pos: string, n: number, bots: object, d: object,
//   bands: object, bandCell: string, kind: string, why: string}}
export function chestExcludeCandidate (book) {
  if (!chestNoPathRepeatsConsistent(book)) return null
  const top = (book.repeatChests || [])[0]
  if (!top) return null
  const botNames = Object.keys(top.bots || {})
  const crowd = botNames.length
  if (crowd >= 2) return { ...top, kind: 'swap-list', why: `${crowd} bots paid the same door - the v0.23.1 swap's next-chest ring prices it out` }
  return { ...top, kind: 'memory-hole', why: `${botNames[0] ?? 'the bot'} came BACK to the refused chest - the private loop, the TTL's own class` }
}

/** The candidate's own row: 'the exclude's own candidate (v0.869.0):
 * [-117,70,414] x4 F1+F19+F3 d 14..32 avg 21.3 mid+far - THE SWAP LIST'S
 * OWN CHEST: 3 bots paid the same door - the v0.23.1 swap's next-chest
 * ring prices it out'. The memory hole reads its own seat. Junk-safe: a
 * junk candidate, an unknown kind, a sub-repeat n or a missing cell
 * renders nothing. */
export function chestExcludeCandidateRow (cand) {
  if (!cand || typeof cand !== 'object') return null
  if (cand.kind !== 'swap-list' && cand.kind !== 'memory-hole') return null
  if (!Number.isFinite(cand.n) || cand.n < 2) return null
  if (typeof cand.pos !== 'string' || !cand.pos) return null
  const d = cand.d || {}
  if (!Number.isFinite(d.min) || !Number.isFinite(d.max) || !Number.isFinite(d.avg)) return null
  if (typeof cand.bandCell !== 'string' || !cand.bandCell) return null
  const botNames = Object.keys(cand.bots || {}).sort()
  if (botNames.length === 0) return null
  const head = `the exclude's own candidate (v0.869.0): [${cand.pos}] x${cand.n} ${botNames.join('+')} d ${d.min}..${d.max} avg ${d.avg} ${cand.bandCell}`
  const seat = cand.kind === 'swap-list'
    ? `- THE SWAP LIST'S OWN CHEST: ${cand.why}`
    : `- THE MEMORY HOLE'S OWN CHEST: ${cand.why}`
  return `${head} ${seat}`
}

// (v0.864.0) THE BUDGET-FLOOR'S OWN BOOK - the budget-floor rides' own
// WHO+WHERE fold. The whys lens (v0.861.0, the lane's) named the budget
// floor the door's own second seat (face 134: 12 of 37 = 32%) and its
// first live face INVERTED the door (face 136: budget-floor 21 of 38 =
// 55% - the class owns the door's majority now), but the fold rode
// verdict-aggregate only: WHICH bot's pocket ran dry, and WHICH chest
// priced the floor's death, rode unnamed. The distance row priced the
// class's own d (face 136: avg 26 vs the door's ~20 - the floor dies on
// the longer approach) - the book folds the same rides per bot per chest
// (the repeats book's own shape, the v0.862.0 law) and bands the d by
// the ring's own ruler (the one-ruler law: close d<=10, mid 11..25,
// far 26+). The rider's majority names the personal budget (the one
// bot's own floor), the band's majority names the distance lever (the
// floor needs the approach's length in its arithmetic).
//
// Reads through the SAME hop regex the bill, the ring and the repeats
// book read (the one-parser law - no new grammar), filters the
// budgetFloor verdict (the class that owns the door's majority - face
// 136: 21 of 38), folds per bot per chest: the rides, the bots, the d
// stats, the band split. The bank-side floor bytes carry no position
// and stay honestly out (the bank family's own shape - the bill keeps
// their verdict count).
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only).
export function chestBudgetFloorBook (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  if (!Array.isArray(rows)) return null
  const bandOf = (d) => d <= 10 ? 'close' : (d <= 25 ? 'mid' : 'far')
  const chests = {}
  const byBot = {}
  const bands = { close: 0, mid: 0, far: 0 }
  const ds = []
  let n = 0
  for (const l of rows) {
    if (typeof l !== 'string') continue
    const hop = l.match(CHEST_DOOR_HOP_RE)
    if (!hop) continue
    if (verdictOf(hop[6]) !== 'budgetFloor') continue
    const d = Number(hop[5])
    if (!Number.isFinite(d)) continue
    n++
    const bot = hop[1]
    byBot[bot] = (byBot[bot] || 0) + 1
    ds.push(d)
    bands[bandOf(d)]++
    const pos = `${hop[2]},${hop[3]},${hop[4]}`
    if (!chests[pos]) chests[pos] = { n: 0, bots: {}, ds: [] }
    const c = chests[pos]
    c.n++
    c.bots[bot] = (c.bots[bot] || 0) + 1
    c.ds.push(d)
  }
  if (n === 0) return null
  const mkD = (list) => ({
    n: list.length,
    min: Math.min(...list),
    max: Math.max(...list),
    avg: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10
  })
  const shaped = {}
  for (const [pos, c] of Object.entries(chests)) {
    shaped[pos] = { n: c.n, bots: { ...c.bots }, d: mkD(c.ds) }
  }
  const repeatChests = Object.entries(shaped)
    .filter(([, c]) => c.n >= 2)
    .map(([pos, c]) => ({ pos, ...c }))
    .sort((a, b) => b.n - a.n ||
      Object.keys(b.bots).length - Object.keys(a.bots).length ||
      a.pos.localeCompare(b.pos))
  const repeatRides = repeatChests.reduce((a, c) => a + c.n, 0)
  return {
    n,
    byBot: { ...byBot },
    d: mkD(ds),
    bands: { ...bands },
    chests: shaped,
    distinctChests: Object.keys(shaped).length,
    repeatChests,
    repeatRides,
    soloRides: n - repeatRides
  }
}

/** THE CONSISTENCY FENCE (the v0.852.0 fence law): the bots' n sum to the
 * book's n, the chests' n sum to n, the bands sum to n, the d stats obey
 * min <= avg <= max with matching n, the repeats' ride-share arithmetic
 * closes (repeatRides + soloRides === n, every repeat at n >= 2 with a
 * matching chest entry). A self-inconsistent book never renders. */
export function chestBudgetFloorBookConsistent (book) {
  if (!book || typeof book !== 'object') return false
  if (!Number.isFinite(book.n) || book.n < 1) return false
  if (!Number.isFinite(book.distinctChests) || book.distinctChests < 1) return false
  if (!Number.isFinite(book.repeatRides) || !Number.isFinite(book.soloRides)) return false
  if (book.repeatRides + book.soloRides !== book.n) return false
  const botSum = Object.values(book.byBot || {}).reduce((a, b) => a + b, 0)
  if (botSum !== book.n) return false
  const d = book.d || {}
  if (!Number.isFinite(d.n) || d.n !== book.n) return false
  if (!Number.isFinite(d.min) || !Number.isFinite(d.max) || !Number.isFinite(d.avg)) return false
  if (d.min > d.avg || d.avg > d.max) return false
  const bandSum = ['close', 'mid', 'far'].reduce((a, b) => a + (book.bands?.[b] || 0), 0)
  if (bandSum !== book.n) return false
  let sum = 0
  for (const c of Object.values(book.chests || {})) {
    if (!Number.isFinite(c.n) || c.n < 1) return false
    const botsSum = Object.values(c.bots || {}).reduce((a, b) => a + b, 0)
    if (botsSum !== c.n) return false
    const cd = c.d || {}
    if (!Number.isFinite(cd.n) || cd.n !== c.n) return false
    if (!Number.isFinite(cd.min) || !Number.isFinite(cd.max) || !Number.isFinite(cd.avg)) return false
    if (cd.min > cd.avg || cd.avg > cd.max) return false
    sum += c.n
  }
  if (sum !== book.n) return false
  if (Object.keys(book.chests || {}).length !== book.distinctChests) return false
  let repeatSum = 0
  for (const r of book.repeatChests || []) {
    if (!Number.isFinite(r.n) || r.n < 2) return false
    const src = book.chests[r.pos]
    if (!src || src.n !== r.n) return false
    repeatSum += r.n
  }
  return repeatSum === book.repeatRides
}

/** The row: 'the budget floor's own book (v0.864.0): 20 floor ride(s) -
 * bots 1 (F19=20) - chests 11 distinct (repeats 9: ...) - d 23..29 avg
 * 26 - bands close 0 / mid 7 / far 13 - THE ONE BOT'S OWN FLOOR: the
 * floor rides F19's pocket - the personal budget, not the shared law'.
 * The seat law ranks the rider's majority first (a single bot owning
 * most of the floor rides names the personal budget), then the band's
 * majority (the distance lever), else the tie law honestly. */
export function chestBudgetFloorBookRow (book) {
  if (!chestBudgetFloorBookConsistent(book)) return null
  const entries = Object.entries(book.byBot || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const botCell = `bots ${entries.length} (${entries.map(([k, c]) => `${k}=${c}`).join(' ')})`
  const repeatsCell = book.repeatChests.length > 0
    ? ` (repeats ${book.repeatChests.length}: ${book.repeatChests.map(r => `[${r.pos}] x${r.n} ${Object.keys(r.bots).sort().join('+')} d ${r.d.min}..${r.d.max} avg ${r.d.avg}`).join(', ')})`
    : ' (every chest priced once)'
  const head = `the budget floor's own book (v0.864.0): ${book.n} floor ride(s) - ${botCell} - chests ${book.distinctChests} distinct${repeatsCell} - d ${book.d.min}..${book.d.max} avg ${book.d.avg} - bands close ${book.bands.close} / mid ${book.bands.mid} / far ${book.bands.far}`
  const top = entries[0]
  let seat
  if (top && top[1] > book.n / 2) seat = `- THE ONE BOT'S OWN FLOOR: the floor rides ${top[0]}'s pocket - the personal budget, not the shared law`
  else if (book.bands.far > book.n / 2) seat = "- THE FAR'S OWN FLOOR: the budget dies on the far approach - the floor needs the distance in its arithmetic"
  else if (book.bands.mid > book.n / 2) seat = "- THE MID'S OWN FLOOR: the budget dies inside the reach - the approach's geometry owns the floor"
  else if (book.bands.close > book.n / 2) seat = "- THE CLOSE'S OWN FLOOR: the budget dies at the doorstep - the floor starves, not the walk"
  else seat = '- THE SPREAD IS THE SHAPE: no rider, no band owns the floor - the tie law held'
  return `${head} ${seat}`
}

// (v0.873.0) THE WALK FLOOR PREFLIGHT'S OWN BOOK - the gate's refusals own
// WHO+WHERE fold. The v0.872.0 preflight (deposit.mjs) prices the visit's
// own walk-floor verdict one gate earlier and refuses at the scan's own
// level ('chest skip (walk floor preflight: d=NN prices NNs beyond the NNs
// left - <the grace's own verdict>)') - the line rides the 'chest skip'
// filter-key the fleet already carries, so the face logs will speak, but a
// lens that cannot fold the class leaves the verdict unnamed (the
// v0.866.0 lesson: bytes visible, seats unowned). The book folds the
// preflight's own line shape: per bot (the WHO), the d/price/left bands
// (the WHERE and the two sides of the affordability question), and the
// clause's own majority (the grace's verdict names the seat). The seats:
//   the grace already rode          -> THE ONE-SHOT'S OWN EXHAUST
//   beyond the grace envelope (40)  -> THE ENVELOPE'S OWN DOOM GUARD
//   beyond the grace cap            -> THE CAP'S OWN DOOM GUARD
//   the distance reads junk         -> THE JUNK CELL'S OWN HONESTY
// A tie or an unknown clause reads THE SPREAD IS THE SHAPE (the tie law).
// Junk-safe: a non-matching line is not a refusal; a book with zero lines
// prices nothing (the honest silence); the fence law stands (an
// inconsistent book renders nothing).
// @param {string[]} [lines] the fleet log's lines (junk tolerated)
// @returns {null | {n: number, bots: object, d: object, priceS: object,
//   leftS: object, clauses: object, seat: string|null, seatClause: string|null}}
export function chestWalkPreflightBook (lines) {
  if (!Array.isArray(lines)) return null
  // the wrapper adds exactly ONE trailing ')' - the clause may or may not
  // carry its own (the grace-rode clause ends '(one-shot per chain)' and
  // rides the wrapper's paren as a second; the envelope's 'stands)' ends
  // with the wrapper's alone) - so the fold strips exactly ONE tail paren.
  const re = /\[([^\][]+)\] chest skip \(walk floor preflight: d=(-?\d+) prices (\d+)s beyond the (\d+)s left - (.+)$/
  const bots = Object.create(null)
  const clauses = Object.create(null)
  const ds = []
  const ps = []
  const ls = []
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const m = re.exec(line.trim())
    if (!m) continue
    const bot = m[1]
    const d = Number(m[2])
    const p = Number(m[3])
    const l = Number(m[4])
    if (!bot || !Number.isFinite(d) || !Number.isFinite(p) || !Number.isFinite(l)) continue
    bots[bot] = (bots[bot] || 0) + 1
    ds.push(d)
    ps.push(p)
    ls.push(l)
    const clause = m[5].replace(/\)$/, '').replace(/^\s*-\s*/, '')
    clauses[clause] = (clauses[clause] || 0) + 1
  }
  const n = ds.length
  if (n === 0) return null
  const band = arr => ({ min: Math.min(...arr), max: Math.max(...arr), avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 })
  let seat = null
  let seatClause = null
  let best = 0
  for (const [clause, count] of Object.entries(clauses)) {
    if (count > best) { best = count; seatClause = clause } else if (count === best) { seatClause = null }
  }
  if (seatClause != null) {
    if (/grace already rode/.test(seatClause)) seat = "THE ONE-SHOT'S OWN EXHAUST"
    else if (/beyond the grace envelope/.test(seatClause)) seat = "THE ENVELOPE'S OWN DOOM GUARD"
    else if (/beyond the grace cap/.test(seatClause)) seat = "THE CAP'S OWN DOOM GUARD"
    else if (/distance reads junk/.test(seatClause)) seat = "THE JUNK CELL'S OWN HONESTY"
    else seat = 'THE UNNAMED CLAUSE'
  }
  return { n, bots, d: band(ds), priceS: band(ps), leftS: band(ls), clauses, seat, seatClause }
}

/** The book's own consistency fence: n>=1, finite bands, >=1 bot, a clause
 * majority named. A tie (seatClause null) is the honest spread - the row
 * still renders with the tie's own seat. @returns {boolean} */
export function chestWalkPreflightBookConsistent (book) {
  if (!book || typeof book !== 'object') return false
  if (!Number.isFinite(book.n) || book.n < 1) return false
  for (const key of ['d', 'priceS', 'leftS']) {
    const b = book[key]
    if (!b || !Number.isFinite(b.min) || !Number.isFinite(b.max) || !Number.isFinite(b.avg)) return false
    if (b.min > b.max) return false
  }
  const bots = Object.keys(book.bots || {})
  if (bots.length === 0) return false
  const clauses = Object.keys(book.clauses || {})
  if (clauses.length === 0) return false
  return true
}

/** The book's own row: 'the walk floor preflight's own book (v0.873.0):
 * 5 refusal(s) by 2 bot(s), d 9..40 avg 26 - prices 30..30 s vs 1..4 s
 * left - THE ONE-SHOT'S OWN EXHAUST: the clause's own majority'. Junk-safe:
 * a junk candidate, an inconsistent book or a zero-refusal face renders
 * nothing (the fence law, the honest silence). */
export function chestWalkPreflightBookRow (book) {
  if (!chestWalkPreflightBookConsistent(book)) return null
  const botNames = Object.keys(book.bots || {}).sort()
  const d = book.d
  const ps = book.priceS
  const ls = book.leftS
  const seat = book.seatClause != null
    ? `${book.seat}: ${book.seatClause}`
    : 'THE SPREAD IS THE SHAPE: no clause owns the book - the tie law held'
  return `the walk floor preflight's own book (v0.873.0): ${book.n} refusal(s) by ${botNames.length} bot(s) (${botNames.join('+')}), d ${d.min}..${d.max} avg ${d.avg} - prices ${ps.min}..${ps.max} s vs ${ls.min}..${ls.max} s left - ${seat}`
}
