// (v0.437.0) THE WALK-OUT WITNESS LENS - the relog walk-out enforcer's own
// read. The v0.425.0 enforcer wired the promise's enforcement (the walk-out
// the relog line promises gets a witness and an escalation ladder: rung 1
// resets the walk gates, rung 2 releases the wedged goal slot, rung 3 names
// the honest shift exit); the decompose carries only a RAW counter
// ('stalled windows' + per-bot) - the window's own numbers rode unread.
// Attempt 4 is the fleet's first run with the wiring live: this lens reads
// the witness lines BEFORE the first one lands (the v0.433.0 hound
// precedent - the read ready when the field speaks, not after).
//
// THE EMITTER (one line, src/lib/relogwalkout.mjs's walkoutStallLine via
// miner.mjs's stalled branch - the walked-out verdict deletes the witness
// SILENTLY, the promise held needs no line):
//   F10 [F10] water: relog walk-out stalled (window 30s, 1.2 blocks of the
//   3.0 progress bar) - rung 1: the walk gates and stalls reset, the funnel
//   admits fresh walks
//   ... the unmeasured class (a lost position read never spends a rung -
//   the Number(null) lesson): '... , displacement unmeasured) - rung N: ...'
// The tag is the fleet's double anatomy (the harness prefixes the username;
// the miner's tag param is '[F10]'). The why tail is the rung's own prose
// (walkoutEscalation's vocabulary) - captured verbatim, never classified
// (the log already named it).
//
// THE FIELD QUESTIONS: (1) how DEEP does the ladder reach in the field
// (rung 3 on any face = the F10 shape reproduced, the shift exit named);
// (2) the displacement series against the printed progress bar - how CLOSE
// the wedged clients walk before the verdict; (3) the unmeasured share -
// how often the position read is lost at the exact moment the verdict needs
// it. One parser per emitter; mining-surface only: zero fleet wiring, zero
// new log lines (the v0.379.0 precedent).

const TAG = '^(F\\d+) \\[F\\d+\\] '

const WALKOUT_STALL_RE = new RegExp(TAG +
  'water: relog walk-out stalled \\(window (\\d+)s, (?:(\\d+(?:\\.\\d+)) blocks of the (\\d+(?:\\.\\d+)) progress bar|displacement unmeasured)\\) - rung (\\d+): (.+)$')

/**
 * Parse one walk-out stall witness line, or null.
 * @param {string} [line]
 * @returns {null|{bot: string, windowS: number, displacement: number|null, progressBar: number|null, rung: number, why: string}}
 */
export function parseWalkoutStall (line) {
  if (typeof line !== 'string') return null
  const m = line.match(WALKOUT_STALL_RE)
  if (!m) return null
  return {
    bot: m[1],
    windowS: Number(m[2]),
    // the unmeasured class rides null - the evidence, never a zero lie
    displacement: m[3] === undefined ? null : Number(m[3]),
    progressBar: m[4] === undefined ? null : Number(m[4]),
    rung: Number(m[5]),
    why: m[6]
  }
}

/**
 * The walk-out witness census over a whole face log (pure; the decompose
 * field read). Accepts an array of lines or a raw text blob.
 * @param {string[]|string} [lines] the face log
 * @returns {{windows: {n: number, byBot: {}, byRung: {}, windowS: {n: number, min: number|null, max: number|null, sum: number}, displacement: {n: number, min: number|null, max: number|null, sum: number, unmeasured: number}, barMax: number|null}, unparsed: number}}
 */
export function walkoutWitnessCensus (lines) {
  const rows = Array.isArray(lines)
    ? lines
    : (typeof lines === 'string' ? lines.split('\n') : [])
  const windows = {
    n: 0, byBot: {}, byRung: {},
    windowS: { n: 0, min: null, max: null, sum: 0 },
    displacement: { n: 0, min: null, max: null, sum: 0, unmeasured: 0 },
    barMax: null
  }
  let unparsed = 0
  for (const l of rows) {
    const p = parseWalkoutStall(l)
    if (p) {
      windows.n++
      windows.byBot[p.bot] = (windows.byBot[p.bot] || 0) + 1
      windows.byRung[p.rung] = (windows.byRung[p.rung] || 0) + 1
      if (windows.windowS.min === null || p.windowS < windows.windowS.min) windows.windowS.min = p.windowS
      if (windows.windowS.max === null || p.windowS > windows.windowS.max) windows.windowS.max = p.windowS
      windows.windowS.sum += p.windowS
      windows.windowS.n++
      if (p.displacement === null) {
        windows.displacement.unmeasured++
      } else {
        if (windows.displacement.min === null || p.displacement < windows.displacement.min) windows.displacement.min = p.displacement
        if (windows.displacement.max === null || p.displacement > windows.displacement.max) windows.displacement.max = p.displacement
        windows.displacement.sum += p.displacement
        windows.displacement.n++
      }
      if (p.progressBar !== null && (windows.barMax === null || p.progressBar > windows.barMax)) windows.barMax = p.progressBar
      continue
    }
    // the escape hatch: a walk-out-lane-shaped line every parser refused
    if (/^F\d+ \[F\d+\] water: relog walk-out/.test(l)) unparsed++
  }
  return { windows, unparsed }
}
