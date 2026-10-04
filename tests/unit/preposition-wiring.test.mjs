// The pre-position census wiring pins (v0.645.0).
//
// Face 37239853197 (the v0.644.0 fleet): the walk-home seat (prePositionNow())
// armed 10 bots, landed 3 (+378u: F2 +114, F4 +187, F12 +77), and the failed
// class rode the deadline (F19's 231u whale strand) - while the arm census
// still read the seat's bots 'never armed' (the seat's wanted pass was
// invisible to bankArmSpoke; F19 pre-positioned with 231u aboard and the row
// claimed silence). The cure rides the wiring: the spoke add at the seat, the
// landed/failed records at the outcomes, the row beside the arm census, and
// the pure parser (src/lib/bankcensus.mjs, unit-pinned in
// bank-census.test.mjs). The DEAD WIRING class (the census family's own
// history: a row prints but the field never feeds it, or the feed rides a
// branch the failure path never takes) is only catchable at the source - the
// pins name every seam the wire must touch and the order it must ride in.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { parsePrePositionCensus } from '../../src/lib/bankcensus.mjs'

const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')

test('REGRESSION PIN: the seat adds BOTH spokes at the arm, before the chain runs', () => {
  const seatAt = fleetSrc.indexOf('if (prePositionNow()) {')
  assert.ok(seatAt > -1, 'the walk-home seat exists (the v0.36.0 block)')
  const armAddAt = fleetSrc.indexOf('prePositionArmed.add(name)')
  const spokeAddAt = fleetSrc.indexOf('bankArmSpoke.add(name) // (v0.645.0) the arm census stops lying')
  const chainAt = fleetSrc.indexOf('smeltThenBank(miner, { yardGoal, budgetMs: preBudget })')
  assert.ok(armAddAt > seatAt, "the seat's own spoke rides at the arm")
  assert.ok(spokeAddAt > seatAt, 'the arm-census spoke rides at the arm (the census reads the full family)')
  assert.ok(chainAt > -1, 'the pre-position chain call exists')
  assert.ok(chainAt > armAddAt && chainAt > spokeAddAt,
    'both spokes ride BEFORE the chain call (a failed chain still spoke - the face\'s own F19 read)')
})

test('REGRESSION PIN: the outcomes feed the census records (both branches)', () => {
  assert.ok(fleetSrc.includes('prePositionLanded.push(res.deposited)'),
    'the landed units ride the + branch (the seat\'s own conversion)')
  assert.ok(fleetSrc.includes("prePositionFailed.push(String(res.reason || 'unknown'))"),
    'the honest reason rides the 0 branch (the next face splits the classes)')
  assert.ok(fleetSrc.includes("prePositionFailed.push('surface refused')"),
    'the surface refusal rides its own class (the walk home\'s own gate)')
})

test('REGRESSION PIN: the census row prints beside the arm census, gated lean', () => {
  const armRowAt = fleetSrc.indexOf('bank arm census: ${silentArms.length}')
  const rowAt = fleetSrc.indexOf('pre-position census: armed ${prePositionArmed.size}')
  assert.ok(armRowAt > -1, 'the arm census row exists (the anchor)')
  assert.ok(rowAt > -1, 'the pre-position row exists')
  assert.ok(rowAt > armRowAt, 'the row rides beside the arm census (the end-phase family)')
  const gateAt = fleetSrc.lastIndexOf('if (prePositionArmed.size > 0) {', rowAt)
  assert.ok(gateAt > -1, 'the lean gate exists')
  assert.ok(gateAt < rowAt, 'the lean gate rides the row (no armed seat, no row - the healthy silence)')
})

test('REGRESSION PIN: the declarations ride the fleet scope (the census outlives the dig loop)', () => {
  const declAt = fleetSrc.indexOf('const prePositionArmed = new Set()')
  const bankArmDeclAt = fleetSrc.indexOf('const bankArmSpoke = new Set()')
  assert.ok(declAt > -1, 'the armed set exists at fleet scope')
  assert.ok(bankArmDeclAt > -1, 'the arm census scope exists (the anchor)')
  assert.ok(declAt > bankArmDeclAt, 'the seat\'s census lives beside the arm census (one family, one scope)')
  assert.ok(fleetSrc.includes('const prePositionLanded = []'), 'the landed record exists')
  assert.ok(fleetSrc.includes('const prePositionFailed = []'), 'the failed record exists')
})

test('REGRESSION PIN: the parser reads the emitter\'s own row byte for byte', () => {
  const e = parsePrePositionCensus('pre-position census: armed 10, landed 3 (+378u), failed 3 (top why: chest unreachable x2) - the seat\'s own delivery, first priced')
  assert.deepEqual(e, { armed: 10, landed: 3, landedUnits: 378, failed: 3, topWhy: 'chest unreachable', topWhyCount: 2 })
  assert.equal(parsePrePositionCensus('pre-position census: armed 1, landed 1 (+5u), failed 0 - the seat\'s own delivery, first priced BOOM'), null,
    'an imagined suffix is a junk line (the anatomy law)')
})
