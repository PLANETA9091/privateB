//
// columntoll.mjs - THE COLUMN'S OWN TOLL (v0.838.0)
//
// The wet-ceiling ascend's cure priced against the death book. The
// v0.836.0 lens owns the climb lane's wet digs' shape; the v0.835.0 lens
// owns the deep-pocket ascend's shape - but NEITHER lens answers the cure
// question: did the dig SAVE the bot, or did the bot die in the band it
// was digging? Face 109 named the front by line order:
//   1943: F13 dig water [-135,51,410] (1/4)
//   1946: F13 dig stone [-135,53,410] (2/4)
//   1961: F13 dig water [-135,52,410] (3/4)
//   2014: F13 died - server: drowned, spot [-135,49,409], o2 reset(-1),
//         rescue never
// Three digs, then the drown death IN the same band (the death spot sits
// one cell off the dug column - the body falls where the ceiling opened;
// the sensor was dead so the rescue never knew). The dig is not always
// the exit.
//
// THE JOIN LAW: a death joins a dug column when the death's own (x,z)
// sits within TOLL_RADIUS (Chebyshev, the y-blind plane - the deathground
// v0.464.0 spatial-join precedent) of a column the wet lane had dug
// STRICTLY EARLIER in the face (line order = time order, the house clock;
// a death before any dig at that column is never the column's toll). The
// lens names NO cause (the trend law): the join is the toll's CANDIDATE -
// the sensor's own story (o2 reset(-1), rescue never) rides the o2-reset
// census (v0.379.0) and the toll (v0.707.0), not here.
//
// The death's own line: the `died - respawning` emitter's verdict shape
// (one writer) - the server kind cell and the inferred tail's own spot
// (`at [x,y,z]`). Junk-safe: a death line without a parseable kind or
// spot never joins (junk in null out). Non-array reads null (the o2gap
// convention). Pure: reads, never mutates. Zero fleet wiring
// (mining-surface only, the v0.379/.../v0.836.0 precedent).
//

const TOLL_DIG_RE = /^(F\d+) \[F\d+\] climb wet ascend: dug the ceiling (\S+) at \[(-?\d+),(-?\d+),(-?\d+)\] \(the water column owns every bearing - the vertical digs instead, (\d+)\/(\d+)\)$/
const TOLL_DEATH_RE = /^(F\d+) \[F\d+\] died - respawning \(cause: server: (.+?) \[kind=([^\]]+)\] \| inferred: (.*)$/
const TOLL_SPOT_RE = /at \[(-?\d+),(-?\d+),(-?\d+)\]/

/** The Chebyshev radius (x,z plane, y-blind) within which a death rides a dug column. */
export const TOLL_RADIUS = 2

/**
 * parseWetDigLine(line) - one climb wet ascend line's own join cells.
 * @returns {null|{bot: string, column: string, digs: number}}
 */
export function parseWetDigLine (line) {
  if (typeof line !== 'string') return null
  const m = line.match(TOLL_DIG_RE)
  if (!m) return null
  const [, bot, , , , z] = m
  return { bot, column: `${m[3]},${z}`, digs: Number(m[6]) }
}

/**
 * parseDeathVerdict(line) - one `died - respawning` verdict's own cells.
 * @returns {null|{bot: string, kind: string, spot: string}}
 */
export function parseDeathVerdict (line) {
  if (typeof line !== 'string') return null
  const m = line.match(TOLL_DEATH_RE)
  if (!m) return null
  const [, bot, , kind, tail] = m
  const s = tail.match(TOLL_SPOT_RE)
  if (!s) return null
  return { bot, kind, spot: `${s[1]},${s[2]},${s[3]}` }
}

/**
 * columnToll(lines) - the wet lane's digs joined to the death book.
 *
 * @param {string[]} [lines] the face log (array of lines)
 * @returns {null|{deaths: number, dugColumns: number, totalDigs: number,
 *   joined: number, kinds: Object<string, number>,
 *   heaviest: null|{column: string, digs: number, deaths: number}}}
 *   the toll census (null on non-array; heaviest = the most-tolled column,
 *   digs break the tie, byte order settles the rest)
 */
export function columnToll (lines) {
  if (!Array.isArray(lines)) return null
  const c = {
    deaths: 0,
    dugColumns: 0,
    totalDigs: 0,
    joined: 0,
    kinds: {},
    heaviest: null
  }
  // the face's own column map: column -> { digs, deaths } in line order
  const cols = {}
  for (const line of lines) {
    const dig = parseWetDigLine(line)
    if (dig) {
      if (!cols[dig.column]) cols[dig.column] = { digs: 0, deaths: 0 }
      cols[dig.column].digs++
      c.totalDigs++
      continue
    }
    const d = parseDeathVerdict(line)
    if (!d) continue
    c.deaths++
    const [dx, , dz] = d.spot.split(',')
    // the join: a column dug STRICTLY EARLIER (line order) within the
    // toll radius on the y-blind plane; among the candidates the NEAREST
    // owns the death (Chebyshev asc), the dig mass breaks the tie, byte
    // order settles the rest (the deterministic read)
    let joinedColumn = null
    let bestCheb = Infinity
    let bestDigs = -1
    for (const col of Object.keys(cols).sort()) {
      if (cols[col].digs === 0) continue
      const [cx, cz] = col.split(',')
      const cheb = Math.max(Math.abs(Number(cx) - Number(dx)), Math.abs(Number(cz) - Number(dz)))
      if (cheb > TOLL_RADIUS) continue
      if (cheb < bestCheb || (cheb === bestCheb && cols[col].digs > bestDigs)) {
        joinedColumn = col
        bestCheb = cheb
        bestDigs = cols[col].digs
      }
    }
    if (joinedColumn != null) {
      cols[joinedColumn].deaths++
      c.joined++
      c.kinds[d.kind] = (c.kinds[d.kind] || 0) + 1
    }
  }
  c.dugColumns = Object.keys(cols).length
  // the heaviest toll column: deaths first, digs break the tie, byte
  // order settles the rest (the deterministic read - the same answer
  // every face, no map-order luck)
  let best = null
  for (const col of Object.keys(cols).sort()) {
    const cell = cols[col]
    if (cell.deaths === 0) continue
    if (best == null || cell.deaths > best.deaths || (cell.deaths === best.deaths && cell.digs > best.digs)) {
      best = { column: col, digs: cell.digs, deaths: cell.deaths }
    }
  }
  c.heaviest = best
  return c
}

/**
 * columnTollRow(c) - the toll census's own byte-exact row.
 *
 * @param {Object|null} [c] a columnToll result
 * @returns {string|null} the row (null on junk cells or the honest
 *   silence - a face the death book never wrote prints nothing)
 */
export function columnTollRow (c) {
  if (c == null || typeof c !== 'object' || Array.isArray(c)) return null
  if (!Number.isFinite(c.deaths) || !Number.isFinite(c.joined) || !Number.isFinite(c.totalDigs)) return null
  if (c.kinds == null || typeof c.kinds !== 'object') return null
  if (c.deaths <= 0) return null // the honest silence: no deaths, no toll question
  const kinds = Object.keys(c.kinds).sort().map((k) => `${k} x${c.kinds[k]}`).join(', ')
  if (c.joined <= 0) {
    return `the column's own toll (v0.838.0): 0 of ${c.deaths} death(s) rode a dug column (${c.totalDigs} wet dig(s) across the face) - the wet lane's cure held`
  }
  if (c.heaviest == null || !Number.isFinite(c.heaviest.digs) || !Number.isFinite(c.heaviest.deaths)) return null
  return `the column's own toll (v0.838.0): ${c.joined} of ${c.deaths} death(s) rode a dug column (${kinds}), the heaviest [${c.heaviest.column}] owned ${c.heaviest.digs} dig(s) then ${c.heaviest.deaths} death(s)`
}
