// Tests for the freeze black box in src/lib/blackbox.mjs.
// The measured failure this module closes: dispatch 35668657935 (the v0.61.0
// fleet) went ~150s without running its own timers (mainLate=150742ms) - the
// server keepalive-timed-out ALL 19 bots at once, paused itself empty for
// 60s, and the run's rate died in the relogin crawl. The log showed the
// freeze but could not name WHAT blocked the one shared event loop. The
// black box is a shared-memory ring of activity labels the heartbeat worker
// reads WHILE the main thread is frozen (postMessage is dead exactly then).
// These pins guard the ring roundtrip (through the REAL SharedArrayBuffer
// the worker will read), the label interning policy, the dump format and the
// threshold arithmetic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLACKBOX_FREEZE_MS, BLACKBOX_DUMP_EVERY_MS, BLACKBOX_LABEL_CAP,
  BLACKBOX_CAPACITY, BLACKBOX_LABEL_SLOT_LEN, BLACKBOX_OTHER_LABEL,
  blackboxByteLength, blackboxLabelAreaOffset,
  internLabel, createSharedBlackBox, readSharedBlackBox, dumpLine, blackboxDue,
  installNoteSink, noteGlobal
} from '../../src/lib/blackbox.mjs'

test('policy constants stay sane', () => {
  assert.equal(BLACKBOX_FREEZE_MS, 5000, 'a 5s timer gap is already fleet-visible (19 bots on one loop)')
  assert.equal(BLACKBOX_DUMP_EVERY_MS, 30000, 'the throttle keeps the log readable on a flapping loop')
  assert.equal(BLACKBOX_CAPACITY, 64, 'the ring holds a whole end-phase chain of labels')
  assert.equal(BLACKBOX_LABEL_CAP, 96, 'the label table is bounded - a runaway generator lands on "other"')
  assert.equal(BLACKBOX_LABEL_SLOT_LEN, 24, 'fixed-width ASCII slots, NUL-padded')
  assert.equal(BLACKBOX_OTHER_LABEL, 'other')
  assert.ok(blackboxByteLength(64) === 8 + 64 * 16 + 96 * 24, 'the SAB is header + entries + label slots')
  assert.equal(blackboxLabelAreaOffset(64), 8 + 64 * 16, 'the label area starts after the entries')
})

test('internLabel: first sight appends, repeats reuse, overflow lands on slot 0', () => {
  let table = [BLACKBOX_OTHER_LABEL]
  const first = internLabel(table, 'pf:goal walk to chest')
  assert.equal(first.idx, 1)
  assert.equal(first.table.length, 2)
  table = first.table
  assert.equal(internLabel(table, 'pf:goal walk to chest').idx, 1, 'repeat = same slot, SAME table reference')
  assert.equal(internLabel(table, 'water:rescue').idx, 2)
  // overflow: fill to the cap, the next NEW label reads 'other' (0)
  let full = ['other']
  for (let i = 1; i < BLACKBOX_LABEL_CAP; i++) full = internLabel(full, `label-${i}`).table
  assert.equal(full.length, BLACKBOX_LABEL_CAP)
  const overflow = internLabel(full, 'brand-new-label')
  assert.equal(overflow.idx, 0, 'the overflow label lands on "other"')
  assert.equal(overflow.table, full, 'and the table is untouched')
  // junk labels never crash
  assert.equal(internLabel(table, '').idx, 0)
  assert.equal(internLabel(table, null).idx, 0)
  assert.equal(internLabel(undefined, 'x').table[0], 'other')
})

test('createSharedBlackBox + readSharedBlackBox: the ring roundtrip the worker will read', () => {
  const box = createSharedBlackBox({})
  assert.ok(box.sab instanceof SharedArrayBuffer)
  const t0 = 1000000
  box.note('pf:queue bank', t0)
  box.note('pf:goal bank', t0 + 250)
  box.note('pf:done bank', t0 + 4500)
  // the READER is the standalone function (the worker's path - no closure)
  const entries = readSharedBlackBox(box.sab, {})
  assert.equal(entries.length, 3, 'all three notes survive the shared memory')
  assert.equal(entries[0].label, 'pf:done bank', 'newest first')
  assert.equal(entries[0].tsMs, t0 + 4500)
  assert.equal(entries[2].label, 'pf:queue bank', 'oldest last')
  // labels interned at runtime are visible to the standalone reader (the
  // table lives in the SAB - postMessage is dead during a freeze)
  assert.equal(entries[0].label.includes('pf:done'), true)
})

test('the ring wraps: seq > capacity keeps the newest window', () => {
  const box = createSharedBlackBox({ capacity: 8 })
  for (let i = 0; i < 20; i++) box.note(`label-${i % 7}`, 1000 + i * 10)
  const entries = readSharedBlackBox(box.sab, { max: 8 })
  assert.equal(entries.length, 8)
  assert.equal(entries[0].tsMs, 1000 + 19 * 10, 'the newest entry survives the wrap')
  assert.equal(entries[7].tsMs, 1000 + 12 * 10, 'the window is exactly 8 deep')
})

test('readSharedBlackBox: junk memory and poisoned slots read safe (forensics never throws)', () => {
  assert.deepEqual(readSharedBlackBox(null, {}), [])
  assert.deepEqual(readSharedBlackBox(new SharedArrayBuffer(64), {}), [], 'a too-small buffer reads empty')
  const box = createSharedBlackBox({})
  box.note('pf:goal walk', 1000)
  box.note('pf:done walk', 2000)
  // poison the OLDEST slot's label index (past the committed label count):
  // the reader skips it instead of throwing or returning garbage labels
  const cap = new Int32Array(box.sab, 4, 1)[0]
  new Int32Array(box.sab, 8 + 0 * 16, 1)[0] = 999
  const entries = readSharedBlackBox(box.sab, {})
  assert.equal(entries.length, 1, 'the poisoned slot is skipped')
  assert.equal(entries[0].label, 'pf:done walk')
  // the seq window itself stays readable after the poison
  for (const e of entries) {
    assert.ok(typeof e.label === 'string' && e.label.length > 0)
    assert.ok(Number.isFinite(e.tsMs) && e.tsMs > 0)
  }
})

test('dumpLine: newest-first ages, relative to the newest timestamp', () => {
  const t0 = 5000000
  const line = dumpLine([
    { label: 'pf:goal bank', tsMs: t0 },
    { label: 'water:rescue', tsMs: t0 - 1400 },
    { label: 'climb', tsMs: t0 - 5000 }
  ], t0)
  assert.equal(line, 'pf:goal bank @+0.0s <- water:rescue @+-1.4s <- climb @+-5.0s')
  assert.equal(dumpLine([], t0), '', 'an empty ring prints nothing')
  assert.equal(dumpLine([{ label: 'x', tsMs: NaN }], t0), '', 'junk timestamps are dropped')
})

test('blackboxDue: the freeze threshold and the dump throttle', () => {
  assert.equal(blackboxDue({ mainLateMs: 4999, sinceDumpMs: Infinity }), false, '4999ms is a stall, not a freeze')
  assert.equal(blackboxDue({ mainLateMs: BLACKBOX_FREEZE_MS, sinceDumpMs: Infinity }), true, 'AT the threshold fires (>=)')
  assert.equal(blackboxDue({ mainLateMs: 150742, sinceDumpMs: Infinity }), true, "run60's magnitude fires")
  assert.equal(blackboxDue({ mainLateMs: 150742, sinceDumpMs: 20000 }), false, 'a fresh dump throttles (30s window)')
  assert.equal(blackboxDue({ mainLateMs: 150742, sinceDumpMs: BLACKBOX_DUMP_EVERY_MS }), true, 'the throttle opens at exactly the window')
  assert.equal(blackboxDue({ mainLateMs: NaN, sinceDumpMs: Infinity }), false, 'junk mainLate never fires')
  assert.equal(blackboxDue({ mainLateMs: 0, sinceDumpMs: NaN }), false, 'junk sinceDump never fires')
})

test('noteGlobal: a no-op before the heartbeat installs the sink, live after', () => {
  // uninstall (test isolation) then note - must not throw
  installNoteSink(null)
  assert.doesNotThrow(() => noteGlobal('pf:goal walk'))
  const box = createSharedBlackBox({})
  installNoteSink(box)
  noteGlobal('water:rescue', 7777)
  const entries = readSharedBlackBox(box.sab, {})
  assert.equal(entries.length, 1)
  assert.equal(entries[0].label, 'water:rescue')
  installNoteSink(null) // restore for the other tests
})
