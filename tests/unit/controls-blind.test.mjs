import { breathMirror, BREATH_OWNER_STALE_MS } from '../../src/lib/drowning.mjs'
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// (v0.312.0) THE CONTROLS-BLIND DECODE - the F14 datum (fleet 36566021862,
// the first full-survival face): the mirror blessed the drowning death
// 'controls-owned' while the sentry's own snapshot was 35.8s OLD (o2 20 at
// it) - the o2 burned 20 -> 0 during the climb ownership with the sentry's
// sight dead for the whole burn. Past the horizon (15s) a climb-owned death
// is not an honest owner blessing: the decode must name the blindness.

test('constant pin: the horizon is 15000ms', () => {
  assert.strictEqual(BREATH_OWNER_STALE_MS, 15000)
})

test('the F14 datum: climb-owned + a 35.8s-stale snapshot = controls-blind', () => {
  const v = breathMirror({ deathKind: 'drown', owner: 'climb', sentryAgeMs: 35800 })
  assert.strictEqual(v.why, 'controls-blind')
  assert.ok(v.note.includes("the sentry's sight died 36s before death"), v.note)
  assert.ok(v.note.includes('the o2 burned unwatched'), v.note)
  assert.ok(v.note.includes('F14 36566021862'), v.note)
})

test('boundary: exactly the horizon reads blind, one tick under stays owned', () => {
  const at = breathMirror({ deathKind: 'drown', owner: 'climb', sentryAgeMs: 15000 })
  assert.strictEqual(at.why, 'controls-blind')
  const under = breathMirror({ deathKind: 'drown', owner: 'climb', sentryAgeMs: 14999 })
  assert.strictEqual(under.why, 'controls-owned')
  assert.match(under.note, /the wet-escape climb owned the controls at the killing tick/)
})

test('a FRESH climb-owned death keeps the honest owner blessing', () => {
  const v = breathMirror({ deathKind: 'drown', owner: 'climb', sentryAgeMs: 3000 })
  assert.strictEqual(v.why, 'controls-owned')
})

test('the defend class never reads blind (the flee story owns its burn)', () => {
  const v = breathMirror({ deathKind: 'drown', owner: 'defend', sentryAgeMs: 60000 })
  assert.strictEqual(v.why, 'controls-owned')
  assert.match(v.note, /the combat defense owned the controls/)
})

test('junk sentryAgeMs never invents blindness (missing evidence is not blindness)', () => {
  for (const age of [null, undefined, NaN, -5000, 'old']) {
    const v = breathMirror({ deathKind: 'drowning', owner: 'climb', sentryAgeMs: age })
    assert.strictEqual(v.why, 'controls-owned', `age ${age}`)
  }
})

test('the other classes keep their order: the blind split does not shadow rescue-ran or the holds', () => {
  // a fresh rescue outranks the owner blessing in the gate order - the blind
  // split lives INSIDE the owner branch and must not change that
  const ran = breathMirror({ deathKind: 'drown', owner: 'climb', rescueAgeMs: 5000, sentryAgeMs: 35800 })
  assert.strictEqual(ran.why, 'controls-blind', 'the owner branch outranks rescue-ran by position - the blind split keeps the branch')
  const dry = breathMirror({ deathKind: 'drown', owner: null, criticalOnDry: true, witnessed: false, noOpGateLeftMs: 5000 })
  assert.strictEqual(dry.why, 'dry-backoff')
  const none = breathMirror({ deathKind: 'drown', owner: null, sentryVerdict: 'dry', sentryAgeMs: 100 })
  assert.strictEqual(none.why, 'no-page')
})

test('junk discipline survives: not-a-drown and unknown keep their names', () => {
  assert.strictEqual(breathMirror({ deathKind: 'was slain by Spider' }).why, 'not-a-drown')
  assert.strictEqual(breathMirror({}).why, 'unknown')
})

test('wiring pin: the why rides the log bracket and sentryAgeMs is already passed live', () => {
  const miner = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.match(miner, /water: breath mirror \[\$\{mirror\.why\}\]/, 'the new class name renders with zero wiring changes')
  assert.match(miner, /sentryAgeMs: sentryLast \? now - sentryLast\.at : null/, 'the live snapshot age feeds the horizon')
})
