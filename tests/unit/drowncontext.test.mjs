// (v0.249.0) THE DROWN-DEATH CONTEXT pins - the drowning-class telemetry gap.
// Run36325553310 measured the Drowned-class as the RETURNED death leader
// (4/6) with the shore law at ZERO firings - the drown deaths fell outside
// every water instrument's context. drownContextLine gives every env-drown
// death ONE snapshot line (o2, feet/head blocks + waterlogged flags, rescue
// relation) so the next decode splits the class by context BEFORE any cure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drownContextLine } from '../../src/lib/statcarry.mjs'

test('drownContextLine: the submerged-never-rescued shape (the F15/F18 class)', () => {
  const line = drownContextLine({
    tag: 'F15', oxygen: 0, feet: 'water', head: 'water',
    feetWaterlogged: false, headWaterlogged: false,
    rescueActive: false, lastRescueAt: null, now: 5000
  })
  assert.equal(line, 'F15 death: drown context (o2 0, feet water, head water, rescue never)')
})

test('drownContextLine: the active-rescue shape (the rescue was running at death)', () => {
  const line = drownContextLine({
    tag: 'F2', oxygen: 3, feet: 'water', head: 'water', rescueActive: true, lastRescueAt: 9999, now: 10000
  })
  assert.equal(line, 'F2 death: drown context (o2 3, feet water, head water, rescue active)')
})

test('drownContextLine: the Ns-ago shape + the waterlogged flags ride the blocks', () => {
  const line = drownContextLine({
    tag: 'F9', oxygen: 12, feet: 'water', head: 'air',
    feetWaterlogged: true, headWaterlogged: false,
    rescueActive: false, lastRescueAt: 3000, now: 10000
  })
  assert.equal(line, 'F9 death: drown context (o2 12, feet water wl, head air, rescue 7s ago)')
})

test('drownContextLine: the stale-bar junk shape renders ? (the 26.2 sensor lesson)', () => {
  const line = drownContextLine({
    tag: 'F18', oxygen: null, feet: null, head: 'water', now: 5000
  })
  assert.equal(line, 'F18 death: drown context (o2 ?, feet unknown, head water, rescue never)')
})

test('drownContextLine: the future lastRescueAt (a junk clock) reads never', () => {
  const line = drownContextLine({
    tag: 'F4', oxygen: 8, feet: 'water', head: 'air', rescueActive: false, lastRescueAt: 99999, now: 10000
  })
  assert.equal(line, 'F4 death: drown context (o2 8, feet water, head air, rescue never)')
})

test('drownContextLine: a fully junk world read refuses (null - nothing to say)', () => {
  assert.equal(drownContextLine({ tag: 'F1', oxygen: null, feet: null, head: null }), null)
  assert.equal(drownContextLine(null), null)
  assert.equal(drownContextLine({ oxygen: undefined, feet: undefined, head: undefined }), null)
})
