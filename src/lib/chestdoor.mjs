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
// -> noPath, 'Took to long' -> decide, else other.
//
// A chest-door-free face reads the honest silence (null).
//
// Pure: reads, never mutates. Zero fleet wiring (mining-surface only, the
// v0.379/.../v0.851.0 precedent).
//

// The hop ride's own byte: the bot token, the chest's position, the distance,
// the unreachable verdict with its message.
const CHEST_DOOR_HOP_RE = /^(F\d+) \[F\d+\] hop: chest at \[(-?\d+),(-?\d+),(-?\d+)\] d=(\d+) zero: chest unreachable \(([^)]+)\)$/

// The bank ride's own byte: no position (the WHERE absent), the optional
// blocks-from-yard cell and the walk-back tail.
const CHEST_DOOR_BANK_RE = /^(F\d+) bank: chest unreachable \(([^)]+)\)(?: \((\d+) blocks from yard\))?(?: - walking back)?$/

function verdictOf (msg) {
  if (/No path/.test(msg)) return 'noPath'
  if (/Took to long/.test(msg)) return 'decide'
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
 *   verdicts: {noPath: number, decide: number, other: number}}}
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
    verdicts: { noPath: 0, decide: 0, other: 0 }
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
  if (!finite(v.noPath) || !finite(v.decide) || !finite(v.other)) return null
  if (v.noPath + v.decide + v.other !== bill.n) return null
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
  const verdictCell = `verdicts no-path ${v.noPath} / decide ${v.decide}${v.other > 0 ? ` / other ${v.other}` : ''}`
  return `the chest door's own bot bill (v0.852.0): ${bill.n} ride(s) - hop ${bill.hop.n} / bank ${bill.bank.n} - ${botCell} - ${chestCell} - ${verdictCell} - THE DOOR'S OWN CROWD: the repeats name the riders, the shared column names the dead chest`
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
  const ds = { noPath: [], decide: [], other: [] }
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
  const shape = { decide: mk(ds.decide), noPath: mk(ds.noPath), other: mk(ds.other) }
  if (shape.decide === null && shape.noPath === null && shape.other === null) return null
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
  if (!ok(shape.decide) || !ok(shape.noPath) || !ok(shape.other)) return false
  return shape.decide !== null || shape.noPath !== null || shape.other !== null
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
  const head = `the decide door's own distance (v0.858.0): ${cell(shape.decide, 'decide')} vs ${cell(shape.noPath, 'no-path')}${shape.other !== null ? ` vs other rides d ${shape.other.min}..${shape.other.max} (avg ${shape.other.avg} of ${shape.other.n})` : ''}`
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
