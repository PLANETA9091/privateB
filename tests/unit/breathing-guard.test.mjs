// The self-only oxygen guard (v0.18.6): mineflayer's entity_metadata handler
// set bot.oxygenLevel from ANY entity's air_supply - a nearby drowned at air 0
// made dry bots "drown" on land. Fleet #122 counted 173 air-bar glitches,
// #128 (a ~3000-entity world) counted 783; and through the v0.16.0 trust
// classifier's WET branch (feet in shallow water - trusted) mob air fired real
// rescue cycles (rescues 8 -> 72). The fix is an upstream patch applied by
// scripts/setup-26.2.mjs; these tests pin the transform's contract.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyBreathingGuard,
  BREATHING_GUARD_MARKER,
  UNGUARDED,
  GUARDED
} from '../../src/lib/breathing-guard.mjs'

// The exact mineflayer block (entities.js, breathing section) as shipped.
const SHIPPED = `      // Breathing (formerly in breath.js)
      if (metas.air_supply != null) {
        bot.oxygenLevel = Math.round(metas.air_supply / 15)
        bot.emit('breath')
      }
`

test('breathing guard: patches the shipped unguarded condition', () => {
  const out = applyBreathingGuard(SHIPPED)
  assert.ok(out.includes(GUARDED), 'guarded condition must appear')
  assert.ok(out.includes(BREATHING_GUARD_MARKER), 'marker must be present')
  // the rest of the block is untouched
  assert.ok(out.includes("bot.oxygenLevel = Math.round(metas.air_supply / 15)"), 'assignment line intact')
  assert.ok(out.includes("bot.emit('breath')"), 'emit line intact')
  assert.ok(!out.includes(UNGUARDED + '\n') || out.includes(GUARDED), 'no bare unguarded condition remains')
})

test('breathing guard: the guarded expression only admits the bot own entity', () => {
  // semantic check of the emitted expression, evaluated against mocks
  const cond = GUARDED.slice(GUARDED.indexOf('if (') + 4, GUARDED.lastIndexOf(')'))
  const self = { entity: { id: 7 } }
  assert.equal(new Function('entity', 'bot', `return (${cond})`)( { id: 7 }, self), true, 'self packet passes')
  assert.equal(new Function('entity', 'bot', `return (${cond})`)( { id: 99 }, self), false, 'mob packet blocked')
  assert.equal(new Function('entity', 'bot', `return (${cond})`)( { id: 7 }, {}), false, 'missing bot.entity never crashes')
})

test('breathing guard: idempotent (second application is a no-op)', () => {
  const once = applyBreathingGuard(SHIPPED)
  const twice = applyBreathingGuard(once)
  assert.equal(twice, once)
})

test('breathing guard: drift fails LOUD, not silent', () => {
  // a mineflayer upgrade that renames the field must not pass unnoticed
  assert.throws(() => applyBreathingGuard("if (metas.breath != null) { bot.oxygen = 1 }"), /expected exactly 1 unguarded air_supply line/)
  // zero occurrences (already-refactored file shape) is also a loud error
  assert.throws(() => applyBreathingGuard('nothing to see here'), /expected exactly 1 unguarded air_supply line/)
  // two occurrences would make the replace ambiguous - loud error as well
  const doubled = SHIPPED + '\n' + SHIPPED
  assert.throws(() => applyBreathingGuard(doubled), /expected exactly 1 unguarded air_supply line/)
})

test('breathing guard: non-string input is a TypeError', () => {
  assert.throws(() => applyBreathingGuard(null), /source must be a string/)
  assert.throws(() => applyBreathingGuard(42), /source must be a string/)
})
