// The wet churn governor's wiring pins (v0.223.0).
//
// The pure plan (src/lib/wetchurn.mjs) shipped in v0.222.0 from the storm's
// 2-run sentry anatomy (run32: F9+F19 printed 44 of 74 rescue starts; run33:
// the same two bots owned 1251 of 1413 air glitches while F11 read the same
// fleet calm). This fire wires it: the miner records the bot's OWN rescue
// starts (a capped sliding log), the runner's work loop consults the plan on
// EVERY pass and holds the wet-prone lanes while an evacuation is live. These
// pins read the SOURCE of both sides - the dusk wire's dead-wire class
// (run195: the pure family passed, the field wiring omitted an arg, the fence
// default 0 refused EVERY arm for its whole field life) is only catchable at
// the call site, so the pins name every scalar the call must carry.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { churnSwap, WET_CHURN_REST_MS, WET_CHURN_WOOD_MS, WET_CHURN_WOOD_MIN_MS, WET_CHURN_LOG_CAP } from '../../src/lib/wetchurn.mjs'

const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
const drowningSrc = readFileSync(new URL('../../src/lib/drowning.mjs', import.meta.url), 'utf8')

test('REGRESSION PIN: the miner records its own rescue starts (the plan per-bot input)', () => {
  assert.ok(minerSrc.includes('const wetRescueLog = []'), 'the recorder exists (per-instance, a capped sliding log)')
  assert.ok(minerSrc.includes('wetRescueLog.push(Date.now())'), 'a rescue START stamps the log (the armed section, not the page)')
  assert.ok(minerSrc.includes('WET_CHURN_LOG_CAP'), 'the cap rides the module constant (the recorder never grows unbounded)')
  assert.ok(minerSrc.includes("wetRescueEvents: () => wetRescueLog.slice()"),
    'the miner exposes the record to the runner (the runner decides, never the rescue handler)')
})

test('REGRESSION PIN: the record rides the ARMED section - a stand-down never reads as a rescue', () => {
  const armedAt = minerSrc.indexOf('    swimming = true\n    bot._waterRescue = true')
  const pushAt = minerSrc.indexOf('wetRescueLog.push(Date.now())')
  const standDownAt = minerSrc.indexOf('standing down, the walk machinery owns the exit')
  assert.ok(armedAt > -1 && pushAt > armedAt, 'the push sits AFTER the arm (the stand-down gate returns before it)')
  assert.ok(standDownAt > -1 && standDownAt < pushAt, 'the stand-down exit is textually BEFORE the record (a gated repeat page is not a rescue)')
  assert.ok(minerSrc.includes('stats.rescues++\n    wetRescueLog.push(Date.now())'),
    'the record rides the same statement block the fleet counter uses (one event, both readers)')
})

test('REGRESSION PIN: the fleet imports the pure plan and the swap (the import line grows with the wiring)', () => {
  assert.match(fleetSrc, /import \{ wetChurnPlan, churnSwap, WET_CHURN_WINDOW_MS, WET_CHURN_COOLDOWN_MS \} from '\.\.\/src\/lib\/wetchurn\.mjs'/,
    'the churn rides the import (the v0.207.0 precedent: the import line grows with the wiring)')
})

test('REGRESSION PIN: the churn call carries every scalar (the run195 dead-wire class)', () => {
  // (v0.293.0) TWO call sites now: the boundary consult (churnEvents) and
  // the intra-goal helper (events). Each must carry the bot's OWN log, the
  // caller's clock and the carry-clock.
  const calls = fleetSrc.match(/wetChurnPlan\(\{[\s\S]*?\}\)/g) || []
  assert.ok(calls.length >= 2, 'both the boundary consult and the intra-goal helper exist')
  const consult = calls.find(c => c.includes('churnEvents'))
  assert.ok(consult, 'the boundary consult call exists in the work loop')
  assert.match(consult, /rescueEvents:\s*churnEvents/, "the bot's OWN rescue log rides the call (the per-bot cadence is the premise)")
  for (const call of calls) {
    assert.match(call, /now:\s*Date\.now\(\)/, "the caller's clock rides the call (the plan never reads the wall clock)")
    assert.match(call, /evacUntil:\s*wetEvacUntil/, 'the wiring carry-clock rides the call (holding re-reads with the remaining time, never double-books)')
  }
})

test('REGRESSION PIN: the arm carries the plan exit clock, the wiring never extends it', () => {
  const arm = fleetSrc.match(/if \(churnPlan\.go\) \{[\s\S]*?\n        \}/)
  assert.ok(arm, 'the arm branch exists')
  assert.match(arm[0], /wetEvacUntil = churnPlan\.untilMs/, 'the plan owns the exit clock (the wiring only carries it)')
  assert.match(arm[0], /churnHoldAnnounced = true/, 'the arm announces (the hold passes stay silent - the lastNightLog shape)')
})

test('REGRESSION PIN: the hold gates the wet-prone lanes, never the bank lanes', () => {
  const consultAt = fleetSrc.indexOf('wetChurnPlan({ rescueEvents: churnEvents')
  const gateAt = fleetSrc.indexOf('if (!churnHolding) {')
  const shaftAt = fleetSrc.indexOf('await miner.digShaft(namesFor(hasPickNow())')
  const tunnelAt = fleetSrc.indexOf("await runSteeredTunnel('floor lock')")
  const bankAt = fleetSrc.indexOf('bank trip: ${tripPlanned ?')
  assert.ok(consultAt > -1 && gateAt > consultAt, 'the consult precedes the gate (every pass re-reads before the first voluntary lane)')
  assert.ok(shaftAt > gateAt && tunnelAt > gateAt, 'the shaft dig AND the steered tunnels sit inside the gate (the flooded quarry faces)')
  assert.ok(bankAt > gateAt, 'the bank lanes ride AFTER the gate block (the yard walk is dry ground - a valid evacuation lane, its own gates own it)')
})

test('REGRESSION PIN: the rescue machinery is untouchable (the plan never gates the ladder)', () => {
  assert.ok(!drowningSrc.includes('wetChurnPlan'), 'the rescue policy module never consults the governor (a rescue during an evacuation still runs)')
  assert.ok(!drowningSrc.includes('churnSwap'), 'the swap never prices anything inside the rescue machinery')
  assert.ok(minerSrc.includes('stats.rescues++'), 'the fleet counter keeps counting (the sentry anatomy stays honest)')
  const churnBlock = fleetSrc.match(/const churnEvents[\s\S]*?const churnHolding/)
  assert.ok(churnBlock, 'the churn lane exists')
  assert.ok(!/rescueFromWater|_waterRescue/.test(churnBlock[0]), 'the consult never touches the rescue controls (the ladder is airtight by construction)')
})

test('REGRESSION PIN: the rest slice is bounded by the swap AND the run clock', () => {
  const restLine = fleetSrc.match(/await new Promise\(r => setTimeout\(r, Math\.max\(0, Math\.min\(swap\.maxMs, deadline - Date\.now\(\)\)\)\)\)/)
  assert.ok(restLine, 'the deadline owns everything - the rest never rides past the hard kill')
})

test('churnSwap: daylight prices a wood slice capped by the hold remaining and the gather cap', () => {
  const s = churnSwap({ remainingMs: 90000, daylight: true })
  assert.equal(s.work, 'wood')
  assert.equal(s.maxMs, WET_CHURN_WOOD_MS, 'a full 90s hold prices the whole gather cap')
  const capped = churnSwap({ remainingMs: 20000, daylight: true })
  assert.equal(capped.work, 'wood')
  assert.equal(capped.maxMs, 20000, 'a short tail caps at the remaining time (the cooldown owns the exit)')
})

test('churnSwap: a tail below the gather floor rests out (fake gathers buy nothing)', () => {
  const s = churnSwap({ remainingMs: WET_CHURN_WOOD_MIN_MS - 1, daylight: true })
  assert.equal(s.work, 'rest')
  assert.equal(s.maxMs, WET_CHURN_REST_MS, 'the tail rests at the rest slice (below the floor a wood trip spends its whole slice walking)')
})

test('churnSwap: night rests (the v0.140.1 hold owns the dark surface)', () => {
  const s = churnSwap({ remainingMs: 90000, daylight: false })
  assert.equal(s.work, 'rest')
  assert.equal(s.maxMs, WET_CHURN_REST_MS, 'the night rest reads the rest slice, never the remaining tail (the plan re-reads each pass)')
})

test('churnSwap: junk and empty remaining read rest (avoidance errs toward resting)', () => {
  for (const remainingMs of [0, -5, NaN, undefined, null]) {
    const s = churnSwap({ remainingMs, daylight: true })
    assert.equal(s.work, 'rest', `remaining ${String(remainingMs)} rests`)
    assert.equal(s.maxMs, WET_CHURN_REST_MS)
  }
})

test('REGRESSION PIN: the recorder constants stay in the module (the wiring reads them, never redefines)', () => {
  assert.equal(WET_CHURN_LOG_CAP, 64, 'the cap is storm-proof headroom (the worst client printed 25 starts in 600s)')
  assert.equal(WET_CHURN_REST_MS, 5000, 'the rest slice re-reads the plan every ~5s at night')
  assert.equal(WET_CHURN_WOOD_MS, 40000, 'the gather cap rides the bootstrap lane shape')
  assert.equal(WET_CHURN_WOOD_MIN_MS, 15000, 'the gather floor keeps the swap honest')
})

// (v0.293.0) THE CHURN INTRA-GOAL READ - the boundary consult's blind spot.
// Face 36476752446: F3/F11/F13 took 12-17 rescues each in the flooded
// quarry while ZERO 'evacuation armed' lines printed - the drip strikes
// INSIDE one long digShaft (the water-table rotations keep the goal open),
// and a goal-boundary consult never reads a full window. The dig loops
// read the plan LIVE through their shouldStop hooks.
test('REGRESSION PIN: churnDueNow reads the plan LIVE (the run195 dead-wire class)', () => {
  assert.match(fleetSrc, /const churnDueNow = \(\) => \{/, 'the helper exists in the per-bot state block')
  const helper = fleetSrc.match(/const churnDueNow = \(\) => \{[\s\S]*?\n      \}/)
  assert.ok(helper, 'the helper body is readable')
  assert.match(helper[0], /miner\.wetRescueEvents\?\.\(\)/, 'the helper reads the bot LIVE record (the recorder updates during the dig)')
  assert.match(helper[0], /rescueEvents: events/, 'the events ride the call')
  assert.match(helper[0], /now:\s*Date\.now\(\)/, 'the caller clock rides the call (the plan never reads the wall clock itself)')
  assert.match(helper[0], /evacUntil:\s*wetEvacUntil/, 'the carry-clock rides the call (a holding evacuation reads .go=false - the dig never stops for churn mid-evacuation)')
  assert.match(helper[0], /return false/, 'junk reads false - the dig never stops on a churn read error')
})

test('REGRESSION PIN: the shaft and the tunnel read the churn inside their dig loops', () => {
  const shaftStop = fleetSrc.match(/shouldStop: \(\) => \{\n[\s\S]*?return false\n            \}/)
  assert.ok(shaftStop, 'the shaft shouldStop block is readable')
  assert.match(shaftStop[0], /if \(churnDueNow\(\)\) \{ interrupted = true; return true \}/,
    'the go verdict stops the shaft cooperatively (interrupted=true - the seal counter never reads a churn stop as an empty shaft)')
  const prePosAt = shaftStop[0].indexOf('prePositionNow()')
  const churnAt = shaftStop[0].indexOf('churnDueNow()')
  assert.ok(prePosAt > -1 && churnAt > prePosAt, 'the churn read rides AFTER the walk-home preempt (the existing due-order preserved)')
  assert.match(fleetSrc, /shouldStop: \(\) => Date\.now\(\) > deadline \|\| churnDueNow\(\)/,
    'the steered tunnel is the other wet-prone lane - the same live read')
})

test('REGRESSION PIN: the churn interrupt still rides the interrupted gate (the seal law)', () => {
  const shaftAt = fleetSrc.indexOf('await miner.digShaft(namesFor(hasPickNow())')
  const continueAt = fleetSrc.indexOf('if (interrupted) continue', shaftAt)
  const churnStopAt = fleetSrc.indexOf('if (churnDueNow()) { interrupted = true; return true }')
  assert.ok(shaftAt > -1 && continueAt > shaftAt && churnStopAt > -1, 'the blocks exist')
  assert.ok(churnStopAt < continueAt, 'the interrupt lands BEFORE the interrupted continue (the shaft break reads as preempted, never as an empty seal)')
})
