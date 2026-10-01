// v0.423.0 THE VOID CENSUS - the out-of-world stamp's field read.
//
// THE TERM, established from the record (never assumed): "void" is the
// PHYSICAL event - a bot falls out of the world below the overworld floor
// (VOID_FLOOR_Y = -64, statcarry.mjs, vanilla 26.2) and the server prints
// 'fell out of the world [kind=other]'. "stamp" is the TELEMETRY the death
// handler prints for it since v0.277.0: the 'void context' snapshot line
// (voidContextLine, statcarry.mjs) naming the death CELL, the DEPTH below
// the world floor, and the UNCONDITIONAL leg stamp (which walk owned the
// death). The emitter's branch gates on the server kind='other' PLUS the
// verb /fell out of the world/i (miner.mjs) - the kind is never rewritten
// (the v0.117.0 law), so the verb is the class's voice.
//
// THE CLASS'S RECORD: two void deaths, both MUTE (pre-stamp trees) - the
// rim-dig era's F12 at [117,-90,0] (depth 26) and face 36392745638's F3 at
// [118,-148,2] (depth 84, 22u lost, zero telemetry lead). The recurrence
// signature: both cells sit ~17 blocks east of the dragon-zone anchor
// [100,49,1] (x 117-118, z 0-2) - a COLUMN the fleet keeps dying into, and
// the stamp's cell+depth+leg read is what completes the decode (bedrock
// breach vs pathfinder fall vs frozen-client drop).
//
// THE OPEN FRONT THIS LENS CLOSES: the stamp has been ARMED-SILENT in every
// field face since (zero 'void context' lines - no void death occurred), and
// no census read it: a future void death would surface as one raw line a
// miner must grep by hand. This lens makes the read mechanical: the stamps
// (per bot, per leg, per planar column, the depth pricing), the KNOWN COLUMN
// verdict (the recurrence signature repeat), the server-verb cross-check
// (a void death with ZERO stamp lines = THE MUTE FLAG - a pre-v0.277.0 tree
// is legitimately mute, anything else opens the emit-site front), and the
// unparsed escape hatch (the never-lose-a-line law).
//
// ONE PARSER PER EMITTER (the v0.409.0 law): the 'void context' line belongs
// to voidContextLine (statcarry.mjs), the 'died - respawning (cause: server:
// fell out of the world ...)' line to the death handler's own cause print -
// this lens reads both emitters and nothing else (the drown/suffocate/
// drowned-kill contexts are their own lenses' lines). Junk-safe, honest
// zeros, pure: reads, never mutates.

// The stamp line: `${tag} death: void context (cell X,Y,Z, depth D, leg L)`
// (voidContextLine's own shape - tag may be EMPTY, the never-null law: the
// junk call still stamps as ' death: void context (...)'). The fleet log
// carries the pump's own prefix in front ('F3 [F3] death: ...' - fleet19's
// name + the miner's bracketed tag), so the bot reads from either the plain
// or the bracketed group (the empty-tag junk call prints ' death: ...' - the
// leading space is part of the emitter's never-null shape), the cell is
// three integers or the literal
// 'unknown', the depth an integer (NEGATIVE = above the floor - the
// contradiction is the datum, never clamped) or 'unknown', the leg is
// everything up to the closing paren (greedy - a paren inside a leg label
// must not truncate the read).
export const VOID_CONTEXT_RE = /^\s*(?:(F\d+)\s)?(?:\[(F\d+)\]\s)?death: void context \(cell (?:(-?\d+),(-?\d+),(-?\d+)|unknown), depth (-?\d+|unknown), leg (.+)\)$/

// The server's own verdict line: the death handler prints
// `${tag} died - respawning (cause: server: fell out of the world [kind=other] | ...)`
// and the pump prefixes the name the same way. The [kind=other] suffix is
// the field's recorded shape for the void verb (both history deaths); a
// 'fell out of the world' with a DIFFERENT kind still counts as a void
// death but honestly drops out of the kindOther share.
export const VOID_SERVER_DEATH_RE = /^\s*(?:(F\d+)\s)?(?:\[(F\d+)\]\s)?died - respawning \(cause: server: fell out of the world\b/

// The fleet's recorded recurrence column (the worklog's decode lead): F12
// [117,-90,0] and F3 [118,-148,2] - x 117..118, z 0..2, ~17 blocks east of
// the dragon-zone anchor [100,49,1] (dragonzone.mjs's own anchor read).
export const VOID_KNOWN_COLUMN = { minX: 117, maxX: 118, minZ: 0, maxZ: 2 }

/**
 * Parse one 'void context' stamp line. Returns null on every non-match
 * (junk, prose, the other context lanes' lines). The cell reads as ints
 * (the emitter floors), the depth as Number (null on 'unknown'), the leg
 * as the raw captured text ('unknown' rides as-is - the line said it).
 */
export function parseVoidContext (line) {
  const m = typeof line === 'string' ? line.match(VOID_CONTEXT_RE) : null
  if (!m) return null
  const bot = m[1] ?? m[2] ?? null
  const cell = (m[3] !== undefined) ? { x: Number(m[3]), y: Number(m[4]), z: Number(m[5]) } : null
  const depth = (m[6] !== undefined && m[6] !== 'unknown') ? Number(m[6]) : null
  return { bot, cell, depth, leg: m[7] }
}

/**
 * Parse one server void-death verdict line. Returns null on every
 * non-match; a match reads { bot, kindOther } (kindOther false = the verb
 * matched but the kind suffix is not the recorded [kind=other] shape).
 */
export function parseServerVoidDeath (line) {
  const m = typeof line === 'string' ? line.match(VOID_SERVER_DEATH_RE) : null
  if (!m) return null
  return { bot: m[1] ?? m[2] ?? null, kindOther: /\[kind=other\]/.test(line) }
}

const onKnownColumn = (cell) =>
  cell.x >= VOID_KNOWN_COLUMN.minX && cell.x <= VOID_KNOWN_COLUMN.maxX &&
  cell.z >= VOID_KNOWN_COLUMN.minZ && cell.z <= VOID_KNOWN_COLUMN.maxZ

/**
 * The census: every stamp + every server void verdict into one junk-safe
 * read.
 * - stamps/byBot/byLeg: the stamp volume split (the legs' histogram names
 *   which walk owned each death - the v0.270.0 unconditional-stamp law's
 *   payoff).
 * - cells/byColumn: the planar column grouping (x,z) with the cells in
 *   encounter order - the recurrence read the stamp was built for.
 * - knownColumn: stamps landing on VOID_KNOWN_COLUMN (the signature repeat).
 * - depths: the below-floor pricing (n/min/max raw - a negative min is the
 *   above-floor contradiction kept honest) + the 'unknown' share (a junk
 *   floor read).
 * - serverVoidDeaths/serverKindOther: the server's own voice - the class's
 *   count even on pre-stamp trees.
 * - muted: a server void death with ZERO stamp lines (the emit site's
 *   health read; false when no death or the stamp spoke).
 * - unparsed: lines carrying 'void context' the strict regex refused (the
 *   honest escape hatch - never silently dropped).
 */
export function voidCensus (lines) {
  const c = {
    stamps: 0,
    byBot: {},
    byLeg: {},
    cells: [],
    byColumn: {},
    depths: { n: 0, min: null, max: null, unknown: 0 },
    knownColumn: 0,
    serverVoidDeaths: 0,
    serverKindOther: 0,
    muted: false,
    unparsed: 0
  }
  if (!Array.isArray(lines)) return c
  for (const line of lines) {
    if (typeof line !== 'string') continue
    const s = parseVoidContext(line)
    if (s) {
      c.stamps++
      if (s.bot) c.byBot[s.bot] = (c.byBot[s.bot] || 0) + 1
      c.byLeg[s.leg] = (c.byLeg[s.leg] || 0) + 1
      if (s.cell) {
        c.cells.push(s.cell)
        const key = `${s.cell.x},${s.cell.z}`
        c.byColumn[key] = (c.byColumn[key] || 0) + 1
        if (onKnownColumn(s.cell)) c.knownColumn++
      }
      if (s.depth === null) c.depths.unknown++
      else {
        c.depths.n++
        if (c.depths.min === null || s.depth < c.depths.min) c.depths.min = s.depth
        if (c.depths.max === null || s.depth > c.depths.max) c.depths.max = s.depth
      }
      continue
    }
    const d = parseServerVoidDeath(line)
    if (d) {
      c.serverVoidDeaths++
      if (d.kindOther) c.serverKindOther++
      continue
    }
    if (line.includes('void context')) c.unparsed++
  }
  c.muted = c.serverVoidDeaths > 0 && c.stamps === 0
  return c
}
