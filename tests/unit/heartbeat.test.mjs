// Worker heartbeat (v0.18.15): the 380s reporter gap inside fleet #126 carried
// 338 activity lines - the log could not tell "main thread's timers starved"
// from "process frozen", and the treatments differ completely. The heartbeat
// worker writes straight to the real stdout fd (fd 1 is shared by all threads;
// the raw syscall bypasses both the main loop and the worker->parent stdout
// piping a starving main thread would leave undrained). These tests pin: the
// wire format, the gap-annotation contract, the injectable-worker wiring
// (unref, error guard, throw-proof onBeat), the stop contract (idempotent,
// terminate fallback), and a REAL worker smoke (boots, beats, exits).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { heartbeatLine, gapNote, startHeartbeat, stopHeartbeat, HEARTBEAT_WORKER_SRC } from '../../src/lib/heartbeat.mjs'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// A Worker double that records the construction contract and the calls.
class FakeWorker {
  constructor (src, opts) {
    FakeWorker.last = this
    this.src = src
    this.opts = opts
    this.unrefed = false
    this.messages = []
    this.terminated = false
    this.listeners = new Map()
  }

  on (event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event).push(fn)
  }

  emit (event, arg) {
    for (const fn of this.listeners.get(event) ?? []) fn(arg)
  }

  unref () { this.unrefed = true }

  postMessage (m) { this.messages.push(m) }

  terminate () { this.terminated = true; return Promise.resolve(0) }
}

test('heartbeat line: the exact wire format the log readers will parse', () => {
  // (v0.48.0) prefix-tolerant: the [h vs b] wire prefix is a live two-writer
  // file - the CONTRACT is the tail: counters, late, and mainLate on every line
  assert.match(heartbeatLine({ n: 3, tsSec: 61, rssMb: 112, lateMs: 4 }), /^(b\]|\[hb\]) n=3 ts=61s rss=112M late=4ms mainLate=0ms$/)
  assert.match(heartbeatLine({ n: 1, tsSec: 20, rssMb: 90 }), /^(b\]|\[hb\]) n=1 ts=20s rss=90M late=0ms mainLate=0ms$/, 'late defaults to 0')
  // (v0.48.0) mainLate rides every line: the main-thread stall magnitude,
  // one beat late by design (evidence, not alarm) - a 50s sync spin prints it.
  assert.match(heartbeatLine({ n: 14, tsSec: 281, rssMb: 406, lateMs: 238, mainLateMs: 50230 }), /^(b\]|\[hb\]) n=14 ts=281s rss=406M late=238ms mainLate=50230ms$/, 'a 50s sync spin prints its magnitude')
})

test('heartbeat source: writes STRAIGHT to fd 1 (the whole point of the design)', () => {
  // If this regresses to console.log or parent-piped stdout, a starving main
  // thread silences the evidence the module exists to provide.
  assert.match(HEARTBEAT_WORKER_SRC, /fs\.writeSync\(writeFd/)
  assert.match(HEARTBEAT_WORKER_SRC, /require\('node:worker_threads'\)/)
  assert.match(HEARTBEAT_WORKER_SRC, /postMessage\(\{ n: n/)
  assert.match(HEARTBEAT_WORKER_SRC, /m === 'stop'/, 'worker must self-exit on stop')
})

test('gap note: silent within tolerance, loud past it, never on bad clocks', () => {
  const IV = 15000
  assert.equal(gapNote(0, IV, IV), null, 'a normal tick is no gap')
  assert.equal(gapNote(0, 36000, IV), null, 'one skipped tick (2.4x) stays silent')
  assert.equal(gapNote(0, 37500, IV), null, 'exactly at tolerance is still silent')
  const note = gapNote(0, 40000, IV)
  assert.match(note, /^\[reporter\] 40s gap before this tick/)
  assert.match(note, /\[hb\] lines kept flowing/)
  assert.match(note, /timers starved/)
  assert.match(note, /froze/)
  assert.equal(gapNote(0, 37000, IV), null, '2.47x - just under tolerance stays silent')
  const big = gapNote(0, 380500, IV)
  assert.match(big, /^\[reporter\] 381s gap/, 'a 380s-class gap (fleet #126) is exactly the case this exists for')
  assert.equal(gapNote(NaN, 1000, IV), null)
  assert.equal(gapNote(0, NaN, IV), null)
  assert.equal(gapNote(0, 1000, 0), null)
  assert.equal(gapNote(0, 1000, -5), null)
  assert.equal(gapNote(1000, 500, IV), null, 'backwards clock stays silent - diagnostics must not lie')
})

test('start heartbeat: eval worker, unref, guarded listeners, injected ctor', () => {
  const beats = []
  const hb = startHeartbeat({
    intervalMs: 20000,
    WorkerCtor: FakeWorker,
    onBeat: b => beats.push(b)
  })
  const w = FakeWorker.last
  assert.equal(hb.worker, w)
  assert.equal(w.opts.eval, true, 'the worker ships as an eval source - no extra file on disk')
  // (v0.62.0) the blackbox rides workerData (bb: null without a box) - the
  // worker reads the shared ring DIRECTLY during a main-thread freeze
  assert.deepEqual(w.opts.workerData, { intervalMs: 20000, writeFd: 1, bb: null })
  assert.equal(w.unrefed, true, 'a heartbeat must never extend the fleet life (OOM path included)')
  assert.equal((w.listeners.get('error') ?? []).length, 1, 'an error listener must exist: dead heartbeat != dead fleet')
  // onBeat receives what the worker posts...
  w.emit('message', { n: 1, ts: 1000, late: 0, rssMb: 90 })
  assert.equal(beats.length, 1)
  assert.deepEqual(beats[0], { n: 1, ts: 1000, late: 0, rssMb: 90 })
  // ...and throwing inside it must not escape into the fleet: the guarded
  // listener swallows the boom and the callback still ran exactly once
  const safe = []
  const hb3 = startHeartbeat({ intervalMs: 10, WorkerCtor: FakeWorker, onBeat: () => { safe.push(1); throw new Error('boom') } })
  assert.doesNotThrow(() => FakeWorker.last.emit('message', { n: 2 }), 'a throwing onBeat must not escape the guarded listener')
  assert.equal(safe.length, 1, 'onBeat ran exactly once despite throwing')
  hb.stop(0)
  hb3.stop(0)
})

test('stop heartbeat: asks first, terminates after grace, idempotent', async () => {
  const hb = startHeartbeat({ intervalMs: 50, WorkerCtor: FakeWorker })
  const w = FakeWorker.last
  assert.equal(hb.stop(20), true, 'first stop works')
  assert.deepEqual(w.messages, ['stop'], 'the worker is asked to exit itself first')
  await sleep(60)
  assert.equal(w.terminated, true, 'a wedged worker is terminated after the grace period')
  assert.equal(hb.stop(20), false, 'second stop is a no-op')
  assert.deepEqual(w.messages, ['stop'], 'no duplicate stop posts')
})

test('stop heartbeat: survives a dead worker (postMessage throws)', () => {
  const hb = startHeartbeat({ intervalMs: 50, WorkerCtor: FakeWorker })
  const w = FakeWorker.last
  w.postMessage = () => { throw new Error('worker gone') }
  assert.equal(hb.stop(0), true, 'stop never throws on a dead worker')
})

test('stop heartbeat: never called twice through the public helper', () => {
  const hb = startHeartbeat({ intervalMs: 50, WorkerCtor: FakeWorker })
  const w = FakeWorker.last
  hb.stop()
  hb.stop()
  hb.stop()
  assert.deepEqual(w.messages, ['stop'])
})

test('REAL worker smoke: boots from the eval source, beats, and exits on stop', async () => {
  const beats = []
  const hb = startHeartbeat({ intervalMs: 60, writeFd: -1, onBeat: b => beats.push(b) })
  try {
    assert.equal(typeof hb.worker.on, 'function', 'the real Worker is in place')
    // (v0.19.2) load-tolerant window: a fixed 220ms sleep assumed an idle
    // runner - CI 35525359987 measured 0 beats in 220ms on an oversubscribed
    // 2-core box (worker boot alone can eat the whole window). Poll up to 5s
    // for 2 beats; the assertion still proves boot + tick + message plumbing,
    // without betting on scheduler latency.
    const deadline = Date.now() + 5000
    while (beats.length < 2 && Date.now() < deadline) await sleep(50)
    assert.ok(beats.length >= 2, `expected >=2 beats within 5s at 60ms interval, got ${beats.length}`)
    const b = beats[0]
    assert.equal(typeof b.n, 'number')
    assert.equal(typeof b.ts, 'number')
    assert.equal(typeof b.late, 'number')
    assert.equal(typeof b.rssMb, 'number')
  } finally {
    hb.stop(30)
  }
  // the worker self-exits; if it wedged, the terminate fallback catches it -
  // either way this await completing means the test process is not held hostage
  await sleep(120)
  assert.ok(hb.stopped)
})
