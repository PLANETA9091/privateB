// (v0.385.0) THE DELIVERABILITY ARM - the gate only compares, the field's
// own numbers price the terms. Tests feed the face-19 (36802577873) priced
// shapes verbatim (the F8 budget's 2433s need vs the granted 300s clamp; the
// 495u fleet pocket at the observed 2.1u/s), the leanness law (a covered
// pocket speaks nothing), the junk battery, and the strict-boundary law.
import { deliverableNow } from '../../src/lib/deliverability.mjs'
import assert from 'node:assert'
import { test } from 'node:test'

test('the clamp term: the face-19 budget need (2433s) outruns the granted clock (300s)', () => {
  const r = deliverableNow({ needS: 2433, grantedS: 300, timeLeftS: 600 })
  assert.equal(r.go, true)
  assert.equal(r.term, 'clamp')
  assert.equal(r.limitS, 300)
  assert.equal(r.needS, 2433)
})

test('the clock term: the 495u pocket at 2.1u/s (240s priced) outruns the time left (200s)', () => {
  const r = deliverableNow({ needS: 240, grantedS: Infinity, timeLeftS: 200 })
  assert.equal(r.go, true)
  assert.equal(r.term, 'clock')
  assert.equal(r.limitS, 200)
})

test('the leanness law: a covered pocket speaks nothing (need fits both limits)', () => {
  const r = deliverableNow({ needS: 240, grantedS: 300, timeLeftS: 600 })
  assert.equal(r.go, false)
  assert.equal(r.term, null)
  assert.equal(r.limitS, null)
})

test('the healthy pocket never arms: F1\'s 102u at the observed 2.1u/s prices 53s - covered mid-run', () => {
  const r = deliverableNow({ needS: 53, grantedS: 300, timeLeftS: 600 })
  assert.equal(r.go, false)
})

test('both terms due: the clamp term names first (the structural one)', () => {
  const r = deliverableNow({ needS: 2433, grantedS: 300, timeLeftS: 120 })
  assert.equal(r.go, true)
  assert.equal(r.term, 'clamp')
  assert.equal(r.limitS, 300)
})

test('the strict-boundary law: a need that exactly fits the limit is covered (need == limit fires nothing)', () => {
  assert.equal(deliverableNow({ needS: 300, grantedS: 300, timeLeftS: 600 }).go, false)
  assert.equal(deliverableNow({ needS: 300, grantedS: 600, timeLeftS: 300 }).go, false)
})

test('a one-second breach fires (need just past the limit)', () => {
  assert.equal(deliverableNow({ needS: 301, grantedS: 300, timeLeftS: 600 }).term, 'clamp')
  assert.equal(deliverableNow({ needS: 241, grantedS: Infinity, timeLeftS: 240 }).term, 'clock')
})

test('the junk battery: unreadable needs refuse', () => {
  for (const bad of [null, undefined, NaN, '', 'x', -5, 0]) {
    const r = deliverableNow({ needS: bad, grantedS: 300, timeLeftS: 600 })
    assert.equal(r.go, false, `needS=${String(bad)} must refuse`)
    assert.equal(r.term, null)
  }
})

test('a zero or negative granted clock cannot fire the clamp term (no chain may run is not every pocket overdue)', () => {
  // timeLeftS 3000 keeps the clock term out of play - only the clamp term
  // could fire, and a dead granted clock never fires it
  assert.equal(deliverableNow({ needS: 2433, grantedS: 0, timeLeftS: 3000 }).go, false)
  assert.equal(deliverableNow({ needS: 2433, grantedS: -1, timeLeftS: 3000 }).go, false)
})

test('a zero or negative time left cannot fire the clock term', () => {
  // grantedS 300 keeps the clamp term out of play (240 <= 300) - only the
  // clock term could fire, and a dead clock never fires it
  assert.equal(deliverableNow({ needS: 240, grantedS: 300, timeLeftS: 0 }).go, false)
  assert.equal(deliverableNow({ needS: 240, grantedS: 300, timeLeftS: -3 }).go, false)
})

test('partial inputs: a missing granted clock leaves the clock term live', () => {
  const r = deliverableNow({ needS: 240, grantedS: null, timeLeftS: 200 })
  assert.equal(r.go, true)
  assert.equal(r.term, 'clock')
})

test('partial inputs: a missing time left leaves the clamp term live', () => {
  const r = deliverableNow({ needS: 2433, grantedS: 300, timeLeftS: null })
  assert.equal(r.go, true)
  assert.equal(r.term, 'clamp')
})

test('partial inputs: no limits at all - the gate cannot fire on a naked need', () => {
  const r = deliverableNow({ needS: 2433 })
  assert.equal(r.go, false)
  assert.equal(r.needS, 2433)
})

test('a fractional need passes through and keeps its value (the caller priced it, the gate does not round)', () => {
  const r = deliverableNow({ needS: 240.7, grantedS: 300, timeLeftS: 200 })
  assert.equal(r.go, true)
  assert.equal(r.term, 'clock')
  assert.equal(r.needS, 240.7)
})
