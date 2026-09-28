// tests/unit/voidstamp.test.mjs
// (v0.277.0) THE VOID DEATH CONTEXT - TWO out-of-world deaths stand in the
// fleet's history, both mute: the rim-dig era's F12 'fell out of the world'
// at [117,-90,0] (kind=other, the first) and face 36392745638's F3 at
// [118,-148,2] - y MINUS 148, 84 blocks BELOW the world floor, 22u lost,
// ZERO telemetry lead (the lines before the death are other bots'). The
// stamp names the death cell (the recurrence signature - the ~17-block
// east-of-anchor column is the decode lead), the depth below the world
// floor, and the UNCONDITIONAL leg stamp - the v0.270.0 law carried over:
// a missing stamp can never masquerade as a deliberate omission. The server
// kind stays 'other' (the v0.117.0 law) - the branch gates on the VERB the
// server itself printed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { voidContextLine, VOID_FLOOR_Y } from '../../src/lib/statcarry.mjs'

test('voidContextLine: the F3 shape (the face 36392745638 death names itself off the line)', () => {
  const line = voidContextLine({ tag: 'F3', pos: { x: 118, y: -148, z: 2 }, leg: 'map trip gravel' })
  assert.equal(line, 'F3 death: void context (cell 118,-148,2, depth 84, leg map trip gravel)')
})

test('voidContextLine: the F12 history shape (the era\'s first void reads the same law)', () => {
  const line = voidContextLine({ tag: 'F12', pos: { x: 117, y: -90, z: 0 }, leg: 'rim dig' })
  assert.equal(line, 'F12 death: void context (cell 117,-90,0, depth 26, leg rim dig)', 'the recurrence pair renders identically shaped - the census pins the column')
  assert.equal(VOID_FLOOR_Y, -64, 'the floor is the overworld constant, not a guess')
})

test('voidContextLine: the junk family never mutes the class (the line NEVER returns null)', () => {
  assert.equal(voidContextLine({}), ' death: void context (cell unknown, depth unknown, leg unknown)')
  assert.equal(voidContextLine({ tag: 'F3', pos: null, leg: '' }), 'F3 death: void context (cell unknown, depth unknown, leg unknown)')
  assert.equal(voidContextLine({ tag: 'F4', pos: { x: '118', y: null, z: 2 }, leg: 42 }), 'F4 death: void context (cell unknown, depth unknown, leg unknown)', 'a string coordinate is not a measurement (the strict gate), a junk leg claims no walk')
  assert.equal(voidContextLine({ tag: 'F5', pos: { x: 118, y: '-148', z: 2 }, leg: 'next column' }), 'F5 death: void context (cell unknown, depth unknown, leg next column)', 'a string y is not a measurement - the cell refuses to half-print')
  assert.ok(voidContextLine().includes('cell unknown'), 'an empty call still stamps - the class has died in silence twice')
})

test('voidContextLine: the floor law (a junk floor reads unknown depth, the cell still prints; no clamping)', () => {
  assert.equal(voidContextLine({ tag: 'F7', pos: { x: 118, y: -148, z: 2 }, floorY: '-64' }), 'F7 death: void context (cell 118,-148,2, depth unknown, leg unknown)', 'a junk floor reads the depth unknown - the class reads from what IS readable')
  assert.equal(voidContextLine({ tag: 'F8', pos: { x: 0, y: -40, z: 0 }, floorY: -32 }), 'F8 death: void context (cell 0,-40,0, depth 8, leg unknown)')
  assert.equal(voidContextLine({ tag: 'F9', pos: { x: 0, y: -20, z: 0 }, floorY: -32 }), 'F9 death: void context (cell 0,-20,0, depth -12, leg unknown)', 'a y above the floor renders the negative depth honestly - the contradiction is the datum, never clamped')
})

test('the void stamp is wired: the death handler reads it, the verb gates it, the filter key carries it (v0.277.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const statSrc = readFileSync(new URL('../../src/lib/statcarry.mjs', import.meta.url), 'utf8')
  assert.ok(statSrc.includes('export function voidContextLine'), 'the pure layer exports the stamp')
  assert.ok(statSrc.includes('export const VOID_FLOOR_Y'), 'the floor constant exports (the one-renderer law)')
  assert.ok(minerSrc.includes('voidContextLine'), 'the miner imports the stamp')
  assert.ok(minerSrc.includes("serverDeath.kind === 'other'"), 'the branch gates on the server kind (the v0.117.0 authority law - the kind is never rewritten)')
  assert.ok(minerSrc.includes('/fell out of the world/i'), 'the branch gates on the VERB the server printed - kind=other alone would catch the magic/kinetic family')
  const mobAt = minerSrc.indexOf("/^drowned$/i.test(serverDeath.attacker ?? '')")
  const voidAt = minerSrc.indexOf('/fell out of the world/i')
  assert.ok(mobAt > 0 && voidAt > mobAt, 'the void branch joins the kind dispatch AFTER the drowned-kill family (the tail precedent)')
  assert.ok(minerSrc.includes('leg: bot._gotoSafeLabel ?? null'), 'the leg stamp rides the new context too (the unconditional-token law)')
  assert.ok(fleetSrc.includes('void context'), "the 'void context' filter key rides fleet19")
  const headBand = fleetSrc.slice(fleetSrc.indexOf('/combat|'), fleetSrc.indexOf('wood trip'))
  assert.ok(!headBand.includes('void'), 'the new key rides the TAIL band - the verbatim head-band pins stay whole (the v0.249.0 sequence law)')
  const tailBand = fleetSrc.slice(fleetSrc.indexOf('wood trip'), fleetSrc.indexOf('smelt tithe'))
  assert.ok(tailBand.indexOf('void context') > tailBand.indexOf('drowned-kill context'), 'the key joins behind the context family (the tail sequence law)')
})
