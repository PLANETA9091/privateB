// The breath mirror (v0.248.0): when a bot drowns OUTSIDE the combat-flee
// context, the log must answer WHY the rescue lane stood down. Every hold in
// the sentry is a silent return (the controls owner, the cooldown, the
// dry-land backoff, the surface re-arm, the frozen gate), so a drowning death
// used to leave no trace of which gate held the page - or whether the sentry
// ever paged at all. The mirror classifies the sentry's live gate state at
// the killing tick, in the sentry's own gate order: climb/defend outrank
// everything; a fresh rescue outranks a bare swim owner (the rescue IS the
// swim - the rescue sets swimming=true at page time); then the holds in tick
// order; then no-page. MEASURED (run36325553310, the geometry face): the
// Drowned class returned as the death leader 4/6 and the shore law fired 0
// times - the drown deaths fell outside the flee context and the rescue
// lane's silence was total.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { breathMirror, RESCUE_MAX_MS } from '../../src/lib/drowning.mjs'

test('mirror gate: a non-drowning death kind is not-a-drown (the instrument knows its scope)', () => {
  const m = breathMirror({ deathKind: 'zombie', rescueAgeMs: 1000 })
  assert.equal(m.why, 'not-a-drown')
  assert.match(m.note, /not a drowning shape/)
})

test('mirror gate: the server kind drown passes the gate', () => {
  assert.equal(breathMirror({ deathKind: 'drown' }).why, 'no-page')
  assert.equal(breathMirror({ deathKind: 'drowning' }).why, 'no-page')
})

test('mirror gate: a junk death kind is unknown - the mirror refuses to guess', () => {
  assert.equal(breathMirror({ deathKind: null }).why, 'unknown')
  assert.equal(breathMirror({ deathKind: '' }).why, 'unknown')
  assert.equal(breathMirror({ deathKind: 7 }).why, 'unknown')
})

test('mirror gate: a bare call never throws (the body-guard law)', () => {
  assert.equal(breathMirror().why, 'unknown')
  assert.equal(breathMirror(null).why, 'unknown')
})

test('mirror: the rescue-ran class - the lane paged and the death beat it', () => {
  const m = breathMirror({ deathKind: 'drown', owner: 'swim', rescueAgeMs: 2000 })
  assert.equal(m.why, 'rescue-ran')
  assert.match(m.note, /paged 2s before death/)
})

test('mirror: rescue-ran with no owner read still names the lane', () => {
  const m = breathMirror({ deathKind: 'drowning', rescueAgeMs: 5000 })
  assert.equal(m.why, 'rescue-ran')
})

test('mirror: the rescue window closes at RESCUE_MAX_MS - an old rescue is not the owner', () => {
  const m = breathMirror({ deathKind: 'drown', rescueAgeMs: RESCUE_MAX_MS + 1000 })
  assert.equal(m.why, 'no-page')
})

test('mirror: climb owns the controls even over a fresh rescue (the live owner wins)', () => {
  const m = breathMirror({ deathKind: 'drown', owner: 'climb', rescueAgeMs: 1000 })
  assert.equal(m.why, 'controls-owned')
  assert.match(m.note, /wet-escape climb/)
})

test('mirror: defend owns the controls - the flee context owned the tick', () => {
  const m = breathMirror({ deathKind: 'drown', owner: 'defend', rescueAgeMs: null })
  assert.equal(m.why, 'controls-owned')
  assert.match(m.note, /combat defense/)
})

test('mirror: swim with no fresh rescue is the float class', () => {
  const m = breathMirror({ deathKind: 'drown', owner: 'swim', rescueAgeMs: null })
  assert.equal(m.why, 'controls-owned')
  assert.match(m.note, /float class/)
})

test('mirror: swim with a STALE rescue (past the window) is still the float class', () => {
  const m = breathMirror({ deathKind: 'drown', owner: 'swim', rescueAgeMs: RESCUE_MAX_MS + 5000 })
  assert.equal(m.why, 'controls-owned')
})

test('mirror: the dry-backoff class - the glitch-lie held the page', () => {
  const m = breathMirror({ deathKind: 'drown', noOpGateLeftMs: 5000, criticalOnDry: true, witnessed: false })
  assert.equal(m.why, 'dry-backoff')
  assert.match(m.note, /glitch-lie/)
})

test('mirror: the witness bypasses the dry-backoff (the gate requires un-witnessed)', () => {
  const m = breathMirror({ deathKind: 'drown', noOpGateLeftMs: 5000, criticalOnDry: true, witnessed: true })
  assert.equal(m.why, 'no-page')
})

test('mirror: dry-backoff needs the critical-on-dry shape - a wet critical reads through', () => {
  const m = breathMirror({ deathKind: 'drown', noOpGateLeftMs: 5000, criticalOnDry: false, witnessed: false })
  assert.equal(m.why, 'no-page')
})

test('mirror: the surface-hold class - the open-water float owns the pacing', () => {
  const m = breathMirror({ deathKind: 'drown', surfaceHoldLeftMs: 3000 })
  assert.equal(m.why, 'surface-hold')
})

test('mirror: the frozen-gate class - the wet-critical cycler held the page', () => {
  const m = breathMirror({ deathKind: 'drown', frozenGateLeftMs: 4000 })
  assert.equal(m.why, 'frozen-gate')
})

test('mirror: holds outrank no-page even with a stale rescue age', () => {
  assert.equal(breathMirror({ deathKind: 'drown', rescueAgeMs: RESCUE_MAX_MS + 9000, surfaceHoldLeftMs: 100 }).why, 'surface-hold')
})

test('mirror: no-page names the last verdict and the snapshot age (the decode-ready sentence)', () => {
  const m = breathMirror({ deathKind: 'drown', sentryVerdict: 'dry', sentryAgeMs: 1200, criticalOnDry: true })
  assert.equal(m.why, 'no-page')
  assert.match(m.note, /never paged/)
  assert.match(m.note, /'dry'/)
  assert.match(m.note, /snapshot 1\.2s old/)
  assert.match(m.note, /critical on dry contact/)
})

test('mirror: a junk snapshot verdict reads as unreadable, never invented', () => {
  const m = breathMirror({ deathKind: 'drown', sentryVerdict: 42, sentryAgeMs: -5 })
  assert.equal(m.why, 'no-page')
  assert.match(m.note, /'unreadable'/)
  assert.match(m.note, /no snapshot age/)
})

test('mirror: junk gate numbers read as NOT ARMED - junk must never invent a hold', () => {
  const m = breathMirror({ deathKind: 'drown', noOpGateLeftMs: 'soon', surfaceHoldLeftMs: -3, frozenGateLeftMs: NaN })
  assert.equal(m.why, 'no-page')
})

test('mirror: junk owner strings are not a controls owner', () => {
  const m = breathMirror({ deathKind: 'drown', owner: 'teleport', rescueAgeMs: null })
  assert.equal(m.why, 'no-page')
})
