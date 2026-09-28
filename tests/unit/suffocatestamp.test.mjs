// tests/unit/suffocatestamp.test.mjs
// (v0.274.0) THE SUFFOCATE DEATH CONTEXT - face 36384223490's F1 died
// 'suffocated in a wall' at [-112,45,424] with a 153u pocket (gravel 39) and
// ZERO telemetry lead: the v0.249.0 context family is drown-kind only by
// design, so the suffocate class died mute and the decode needed inventory
// archaeology to hint the gravel-collapse class. The stamp names the head
// cell at death (a falling-block class reads 'gravel'/'sand' straight off
// the line), its waterlogged flag, the o2 bar, and the UNCONDITIONAL leg
// stamp - the v0.270.0 law carried over: a missing stamp can never masquerade
// as a deliberate omission.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { suffocateContextLine } from '../../src/lib/statcarry.mjs'

test('suffocateContextLine: the F1 gravel-collapse shape (the class names itself off the line)', () => {
  const line = suffocateContextLine({ tag: 'F1', head: 'gravel', headWaterlogged: false, oxygen: 20, leg: 'next column' })
  assert.equal(line, 'F1 death: suffocate context (head gravel, o2 20, leg next column)')
})

test('suffocateContextLine: the waterlogged head and the -1 sentinel render named (the one-renderer law)', () => {
  const line = suffocateContextLine({ tag: 'F7', head: 'water', headWaterlogged: true, oxygen: -1, leg: 'fuel commons walk' })
  assert.equal(line, 'F7 death: suffocate context (head water wl, o2 reset(-1), leg fuel commons walk)')
  assert.equal(suffocateContextLine({ tag: 'F2', head: 'sand', oxygen: null, leg: null }), 'F2 death: suffocate context (head sand, o2 ?, leg unknown)')
})

test('suffocateContextLine: the junk family never mutes the class (the line NEVER returns null)', () => {
  assert.equal(suffocateContextLine({}), 'F1 death: suffocate context (head unknown, o2 ?, leg unknown)'.replace('F1', ''))
  assert.equal(suffocateContextLine({ tag: 'F3', head: null, oxygen: undefined, leg: '' }), 'F3 death: suffocate context (head unknown, o2 ?, leg unknown)')
  assert.equal(suffocateContextLine({ tag: 'F4', head: '   ', oxygen: '0', leg: 42 }), 'F4 death: suffocate context (head unknown, o2 ?, leg unknown)', 'a string o2 is not a measurement (the strict gate), a junk leg claims no walk')
  assert.ok(suffocateContextLine().includes('head unknown'), 'an empty call still stamps - the class already died in silence once')
})

test('the suffocate stamp is wired: the death handler reads it, the filter key carries it (v0.274.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const statSrc = readFileSync(new URL('../../src/lib/statcarry.mjs', import.meta.url), 'utf8')
  assert.ok(statSrc.includes('export function suffocateContextLine'), 'the pure layer exports the stamp')
  assert.ok(minerSrc.includes('suffocateContextLine'), 'the miner imports the stamp')
  assert.ok(minerSrc.includes("serverDeath.kind === 'suffocate'"), 'the handler gates on the server kind (the v0.117.0 authority law)')
  const drownAt = minerSrc.indexOf("serverDeath.kind === 'drown'")
  const suffAt = minerSrc.indexOf("serverDeath.kind === 'suffocate'")
  assert.ok(drownAt > 0 && suffAt > drownAt, 'the suffocate branch joins the kind dispatch AFTER the drown family (the tail precedent)')
  assert.ok(minerSrc.includes('leg: bot._gotoSafeLabel ?? null'), 'the leg stamp rides the new context too (the unconditional-token law)')
  assert.ok(fleetSrc.includes('suffocate context'), "the 'suffocate context' filter key rides fleet19")
  const headBand = fleetSrc.slice(fleetSrc.indexOf('/combat|'), fleetSrc.indexOf('wood trip'))
  assert.ok(!headBand.includes('suffocate'), 'the new key rides the TAIL band - the verbatim head-band pins stay whole (the v0.249.0 sequence law)')
})
