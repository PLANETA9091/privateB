// (v0.62.0) THE FREEZE BLACK BOX - naming the main-thread blocker.
//
// MEASURED (dispatch 35668657935, the v0.61.0 fleet): the ONE process that
// hosts all 19 bots went ~150s without running its own timers
// (mainLate=150742ms at ts=360s, after 399ms placeholders through the frozen
// window) - the server keepalive-timed-out ALL 19 clients at once, the server
// then paused itself empty for 60s, the relogins crawled back over 3 minutes
// and the run's rate died (0.16 b/s trough, 927 mined vs run59's 2241). The
// log shows the freeze but not WHAT froze: a synchronous A* exhaustion, a
// giant stringify, a packet-parse avalanche - indistinguishable after the
// fact.
//
// The black box is a fixed ring of activity labels the main thread writes
// (one store per call site, nanoseconds, zero allocation after warmup) into
// memory the heartbeat WORKER can read while the main thread is frozen. When
// the worker sees mainLate >= FREEZE_NOTE_MS it dumps the newest entries:
// the LAST activity before the gap names the blocker.
//
// EVERYTHING the reader needs lives in the SharedArrayBuffer - postMessage
// is dead while the main thread is frozen, so the label table is shared
// memory too (fixed-width ASCII slots; a label interned at runtime lands in
// the next slot and the frozen-time reader sees it):
//
//   byte 0..3              Int32 seq        (commit marker, written LAST)
//   byte 4..7              Int32 capacity   (write-once, the reader's map key)
//   byte 8..8+cap*16-1     entries: 16B each = Int32 labelIdx + Int32 reserved + Float64 tsMs
//   byte 8+cap*16...       label slots: LABEL_SLOT_LEN ASCII bytes each, NUL-padded;
//                          the LIVE count is the first Int32 of the label area
//                          (written AFTER the slot's chars - the commit order)
//
// The writer commits (chars -> count) for a new label and (labelIdx, ts ->
// seq) for a note, so the reader - a different thread - only trusts entries
// whose labelIdx is below the committed count; a torn ts on a racing slot
// just records a wrong timestamp for one entry (forensics, not telemetry).

export const BLACKBOX_FREEZE_MS = 5000
export const BLACKBOX_DUMP_EVERY_MS = 30000
export const BLACKBOX_LABEL_CAP = 96
export const BLACKBOX_CAPACITY = 64
export const BLACKBOX_LABEL_SLOT_LEN = 24

/** The escape-hatch label: interning past the cap lands here (slot 0), so a
 * runaway label generator can never blow the table. */
export const BLACKBOX_OTHER_LABEL = 'other'

const HEADER_BYTES = 8
const ENTRY_BYTES = 16

/** Byte offset of the label area (and of the Int32 live-label count). */
export function blackboxLabelAreaOffset (capacity = BLACKBOX_CAPACITY) {
  const cap = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : BLACKBOX_CAPACITY
  return HEADER_BYTES + cap * ENTRY_BYTES
}

/** Total SharedArrayBuffer size for `capacity` ring slots. */
export function blackboxByteLength (capacity = BLACKBOX_CAPACITY) {
  return blackboxLabelAreaOffset(capacity) + BLACKBOX_LABEL_CAP * BLACKBOX_LABEL_SLOT_LEN
}

/**
 * Intern `label` into a PLAIN table (the policy, CI-testable without shared
 * memory). Pure on append (returns a NEW table when the label is new and
 * there is room), reference-equal otherwise. Junk labels land on 'other'.
 * @param {string[]} table the label table (slot 0 is always 'other')
 * @param {string} label the call-site name
 * @param {number} [cap] max table size (default BLACKBOX_LABEL_CAP)
 * @returns {{idx: number, table: string[]}}
 */
export function internLabel (table, label, cap = BLACKBOX_LABEL_CAP) {
  const base = Array.isArray(table) && table.length ? table : [BLACKBOX_OTHER_LABEL]
  const name = typeof label === 'string' && label ? label : BLACKBOX_OTHER_LABEL
  const found = base.indexOf(name)
  if (found >= 0) return { idx: found, table: base }
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : BLACKBOX_LABEL_CAP
  if (base.length >= limit) return { idx: 0, table: base }
  const next = base.concat([name])
  return { idx: next.length - 1, table: next }
}

/**
 * The shared ring + the main-thread note sink. One instance per process,
 * created BEFORE the fleet boots and handed to startHeartbeat ({ blackbox }).
 * note() is try-wrapped: forensics must never be the thing that kills the
 * fleet.
 * @param {object} [p]
 * @param {number} [p.capacity] ring slots (default BLACKBOX_CAPACITY)
 * @returns {{sab: SharedArrayBuffer, capacity: number, note: Function, read: Function}}
 */
export function createSharedBlackBox ({ capacity = BLACKBOX_CAPACITY } = {}) {
  const cap = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : BLACKBOX_CAPACITY
  const sab = new SharedArrayBuffer(blackboxByteLength(cap))
  const head = new Int32Array(sab, 0, 2) // [0]=seq, [1]=capacity
  head[1] = cap
  const entries = new Int32Array(sab, HEADER_BYTES, cap * 4) // 4 x i32 per entry (idx, pad, ts lo, ts hi)
  const f64 = new Float64Array(sab)
  const labelCount = () => new Int32Array(sab, blackboxLabelAreaOffset(cap), 1)[0]

  const state = { seq: 0 }
  const encoder = new TextEncoder()
  // per-instance label cache: skip the slot scan for repeat labels (the hot path)
  const readLabelCache = new Map()

  // slot 0 is always 'other' (the overflow label) - pre-registered so the
  // SAB table matches internLabel's policy from the first note
  writeLabelSlot(0, BLACKBOX_OTHER_LABEL)
  new Int32Array(sab, blackboxLabelAreaOffset(cap), 1)[0] = 1

  function writeLabelSlot (idx, name) {
    const off = blackboxLabelAreaOffset(cap) + 4 + idx * BLACKBOX_LABEL_SLOT_LEN
    const bytes = encoder.encode(name.slice(0, BLACKBOX_LABEL_SLOT_LEN - 1))
    const u8 = new Uint8Array(sab)
    for (let k = 0; k < BLACKBOX_LABEL_SLOT_LEN; k++) u8[off + k] = k < bytes.length ? bytes[k] : 0
  }

  function readLabelSlot (idx) {
    if (idx < 0 || idx >= labelCount()) return null
    const off = blackboxLabelAreaOffset(cap) + 4 + idx * BLACKBOX_LABEL_SLOT_LEN
    const u8 = new Uint8Array(sab)
    let s = ''
    for (let k = 0; k < BLACKBOX_LABEL_SLOT_LEN && u8[off + k] !== 0; k++) {
      const c = u8[off + k]
      s += c >= 32 && c < 127 ? String.fromCharCode(c) : '?'
    }
    return s || null
  }

  const box = {
    sab,
    capacity: cap,
    note (label, tsMs = Date.now()) {
      try {
        const name = typeof label === 'string' && label ? label : BLACKBOX_OTHER_LABEL
        let idx = -1
        const seen = readLabelCache.get(name)
        if (seen != null && seen < labelCount()) idx = seen
        if (idx < 0) {
          // scan the live slots (the boot-time set is small; the ring stays cheap)
          for (let j = 0; j < labelCount(); j++) {
            if (readLabelSlot(j) === name) { idx = j; break }
          }
        }
        if (idx < 0) {
          const count = labelCount()
          if (count < BLACKBOX_LABEL_CAP) {
            idx = count
            writeLabelSlot(idx, name)
            new Int32Array(sab, blackboxLabelAreaOffset(cap), 1)[0] = count + 1 // commit the count AFTER the chars
          } else {
            idx = 0 // 'other'
          }
        }
        readLabelCache.set(name, idx)
        const i = state.seq % cap
        entries[i * 4] = idx
        entries[i * 4 + 1] = 0
        f64[(HEADER_BYTES + i * ENTRY_BYTES + 8) / 8] = Number.isFinite(tsMs) ? tsMs : Date.now()
        state.seq++
        head[0] = state.seq // commit marker LAST
      } catch { /* forensics never kills the fleet */ }
    },
    read (max = 8) {
      const seq = head[0]
      const want = Number.isFinite(max) && max > 0 ? Math.floor(max) : 8
      const n = Math.min(cap, seq, want)
      const out = []
      for (let k = 1; k <= n; k++) {
        const i = ((seq - k) % cap + cap) % cap
        const ts = f64[(HEADER_BYTES + i * ENTRY_BYTES + 8) / 8]
        const label = readLabelSlot(entries[i * 4])
        if (label != null && Number.isFinite(ts) && ts > 0) out.push({ label, tsMs: ts, slot: i })
      }
      return out
    }
  }
  return box
}

/**
 * Read the newest entries DIRECTLY from shared memory (the worker's path -
 * no closure, no main-thread objects). Mirrors createSharedBlackBox's
 * layout byte for byte; kept standalone so the CJS heartbeat worker can
 * inline the same arithmetic.
 * @param {SharedArrayBuffer|ArrayBuffer} sab
 * @param {object} [p]
 * @param {number} [p.max] newest-first entry count (default 8)
 * @returns {Array<{label: string, tsMs: number, slot: number}>}
 */
export function readSharedBlackBox (sab, { max = 8 } = {}) {
  const out = []
  if (!sab || typeof sab.byteLength !== 'number' || sab.byteLength < 8) return out
  // the capacity is the box's OWN header word (write-once at init) - the
  // reader never assumes a size: a capacity-8 test box must read as cleanly
  // as the fleet's capacity-64 ring
  const cap = new Int32Array(sab, 4, 1)[0]
  if (!Number.isFinite(cap) || cap <= 0 || sab.byteLength < blackboxByteLength(cap)) return out
  const seq = new Int32Array(sab, 0, 1)[0]
  const f64 = new Float64Array(sab)
  const u8 = new Uint8Array(sab)
  const count = new Int32Array(sab, blackboxLabelAreaOffset(cap), 1)[0]
  const want = Number.isFinite(max) && max > 0 ? Math.floor(max) : 8
  const n = Math.min(cap, Math.max(seq, 0), want)
  for (let k = 1; k <= n; k++) {
    const i = ((seq - k) % cap + cap) % cap
    const idx = new Int32Array(sab, HEADER_BYTES + i * ENTRY_BYTES, 1)[0]
    const ts = f64[(HEADER_BYTES + i * ENTRY_BYTES + 8) / 8]
    if (!(Number.isFinite(ts) && ts > 0)) continue
    if (idx < 0 || idx >= count || idx >= BLACKBOX_LABEL_CAP) continue
    const off = blackboxLabelAreaOffset(cap) + 4 + idx * BLACKBOX_LABEL_SLOT_LEN
    let label = ''
    for (let b = 0; b < BLACKBOX_LABEL_SLOT_LEN && u8[off + b] !== 0; b++) {
      const c = u8[off + b]
      label += c >= 32 && c < 127 ? String.fromCharCode(c) : '?'
    }
    out.push({ label: label || `lbl#${idx}`, tsMs: ts, slot: i })
  }
  return out
}

/**
 * Format a dump line. `entries` newest-first (readSharedBlackBox order);
 * ages are relative to the NEWEST entry's timestamp, or to `nowMs` when the
 * newest is missing/junk.
 * @param {Array<{label: string, tsMs: number}>} entries newest-first
 * @param {number} nowMs the dump moment
 * @returns {string} 'lblA @+0.0s <- lblB @+1.4s' | '' when nothing usable
 */
export function dumpLine (entries, nowMs) {
  if (!Array.isArray(entries) || !entries.length) return ''
  const now = Number.isFinite(nowMs) ? nowMs : Date.now()
  const base = Number.isFinite(entries[0]?.tsMs) ? entries[0].tsMs : now
  const parts = []
  for (const e of entries) {
    if (!e || typeof e.label !== 'string' || !Number.isFinite(e.tsMs)) continue
    parts.push(`${e.label} @+${((e.tsMs - base) / 1000).toFixed(1)}s`)
  }
  return parts.join(' <- ')
}

/**
 * Should the worker dump now? Pure, junk-safe: junk mainLate or a too-fresh
 * dump reads false (the 30s throttle keeps the log readable on a flapping
 * loop).
 * @param {object} [p]
 * @param {number} [p.mainLateMs] the main thread's own drift reading
 * @param {number} [p.sinceDumpMs] ms since the last dump (Infinity = never)
 * @param {number} [p.freezeMs] threshold (default BLACKBOX_FREEZE_MS)
 * @param {number} [p.everyMs] throttle (default BLACKBOX_DUMP_EVERY_MS)
 * @returns {boolean}
 */
export function blackboxDue ({ mainLateMs = 0, sinceDumpMs = Infinity, freezeMs = BLACKBOX_FREEZE_MS, everyMs = BLACKBOX_DUMP_EVERY_MS } = {}) {
  const late = Number.isFinite(mainLateMs) ? mainLateMs : 0
  const freeze = Number.isFinite(freezeMs) && freezeMs > 0 ? freezeMs : BLACKBOX_FREEZE_MS
  if (late < freeze) return false
  const since = Number.isFinite(sinceDumpMs) ? sinceDumpMs : Infinity
  const every = Number.isFinite(everyMs) && everyMs > 0 ? everyMs : BLACKBOX_DUMP_EVERY_MS
  return since >= every
}

// ---------------------------------------------------------------------------
// THE GLOBAL NOTE SINK - call sites note without wiring.
//
// The heartbeat lives in fleet19; the heavyweight call sites live in
// jobqueue/deposit/miner. A module-level sink installed by startHeartbeat
// lets every module `noteGlobal('pf:goal walk to chest')` with zero plumbing:
// before the box is installed it is a no-op (unit tests, smoke runs), after
// it is one interned-store per call.

const sink = { box: null }

/**
 * Install the process-wide sink (startHeartbeat does this once). Passing a
 * falsy box uninstalls (tests).
 * @param {{note: Function}|null} [box]
 */
export function installNoteSink (box = null) {
  sink.box = box && typeof box.note === 'function' ? box : null
}

/**
 * The call-site note. Never throws, never allocates beyond the first sight
 * of a label.
 * @param {string} label
 * @param {number} [tsMs]
 */
export function noteGlobal (label, tsMs = Date.now()) {
  const box = sink.box
  if (!box) return
  try { box.note(label, tsMs) } catch { /* forensics never kills the fleet */ }
}
