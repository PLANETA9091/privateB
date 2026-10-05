//
// furnaceput.test.mjs - THE FURNACE PUT'S OWN PAIR (v0.664.0)
// The no-walk opener and the slot read-back counted. The docstring's
// own face rides verbatim; the honest zero, the pocket-keeps tail, the
// empty-slot voice and the junk battery pin the book.
//
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { furnacePut, FURNACE_NOWALK_OPEN_RE, FURNACE_PUT_RE } from '../../src/lib/furnaceput.mjs'

test('v0.664.0 the furnace put book: the docstring own face reads opens and the pairing whole', () => {
  const lines = [
    '[F7] furnace within reach - opening without a walk',
    '[F13] furnace slots after put: input=raw_copper fuel=coal',
    '[F5] blast_furnace within reach - opening without a walk',
    '[F13] furnace slots after put: input=sand fuel=stick',
    '[F13] furnace slots after put: input=raw_copper fuel=coal',
    '[F13] furnace slots after put: input=cobblestone fuel=stick (pocket keeps 2)'
  ]
  const r = furnacePut(lines)
  assert.ok(r && r.totals, 'the book reads')
  assert.equal(r.totals.opens, 2)
  assert.equal(r.totals.opensFurnace, 1)
  assert.equal(r.totals.opensBlast, 1)
  assert.equal(r.totals.puts, 4)
  assert.equal(r.totals.pairs['input=raw_copper fuel=coal'], 2)
  assert.equal(r.totals.pairs['input=sand fuel=stick'], 1)
  assert.equal(r.totals.pairs['input=cobblestone fuel=stick'], 1)
  assert.equal(r.bots.F13.opens, 0)
  assert.equal(r.bots.F13.puts, 4)
  assert.equal(r.bots.F7.opens, 1)
  assert.equal(r.bots.F5.opensBlast, 1)
  assert.equal(r.totals.putBots.F13, 4)
  assert.equal(r.totals.putBots.F7, 1)
})

test('v0.664.0 the pocket-keeps tail counts the batch the pocket could not afford whole', () => {
  const lines = [
    '[F2] furnace slots after put: input=oak_log fuel=stick (pocket keeps 3)',
    '[F2] furnace slots after put: input=sand fuel=oak_planks (pocket keeps 1)',
    '[F2] furnace slots after put: input=sand fuel=stick'
  ]
  const r = furnacePut(lines)
  assert.equal(r.totals.puts, 3)
  assert.equal(r.totals.pocketKeeps, 2)
  assert.equal(r.totals.pocketKept, 4)
  assert.equal(r.bots.F2.pocketKeeps, 2)
  assert.equal(r.bots.F2.pocketKept, 4)
})

test('v0.664.0 the empty slot voice: the read-back names the lie verbatim', () => {
  const lines = [
    '[F9] furnace slots after put: input=empty fuel=coal',
    '[F9] furnace slots after put: input=raw_copper fuel=empty'
  ]
  const r = furnacePut(lines)
  assert.equal(r.totals.puts, 2)
  assert.equal(r.totals.emptyInputs, 1)
  assert.equal(r.totals.emptyFuels, 1)
  assert.equal(r.totals.pairs['input=empty fuel=coal'], 1)
})

test('v0.664.0 the honest zero: a face with no furnace lines reads zero and no bots', () => {
  const lines = [
    'F9 [F9] craft torches: skip (no coal: sticks 4 coals 0)',
    'F13 [F13] smelting 1 x raw_copper in a blast_furnace (fuel: 1 x coal)'
  ]
  const r = furnacePut(lines)
  assert.ok(r && r.totals, 'the book still reads')
  assert.equal(r.totals.opens, 0)
  assert.equal(r.totals.puts, 0)
  assert.equal(Object.keys(r.bots).length, 0)
  assert.equal(Object.keys(r.totals.pairs).length, 0)
})

test('v0.664.0 the junk battery: malformed shapes never match the book', () => {
  assert.equal(furnacePut(null), null)
  assert.equal(furnacePut('nope'), null)
  const lines = [
    42,
    null,
    'F7 [F8] furnace within reach - opening without a walk',
    '[F7] blast_furnace within reach - opened with a walk',
    '[F7] furnace within reach - opening without a walk!',
    '[F7] furnace slots after put: input=raw_copper fuel=coal (pocket keeps x)',
    '[F7] furnace slots after put: fuel=coal',
    '[F7] furnace slots after put: input=raw_copper fuel=coal (extra tail)',
    '[F7] furnaces after put: input=raw_copper fuel=coal'
  ]
  const r = furnacePut(lines)
  assert.ok(r && r.totals)
  assert.equal(r.totals.opens, 0)
  assert.equal(r.totals.puts, 0)
})

test('v0.664.0 the exported pins: the regexes hold the emitter own words', () => {
  assert.ok(FURNACE_NOWALK_OPEN_RE.exec('[F4] furnace within reach - opening without a walk'))
  assert.ok(FURNACE_NOWALK_OPEN_RE.exec('[F4] blast_furnace within reach - opening without a walk'))
  assert.ok(!FURNACE_NOWALK_OPEN_RE.exec('F4 [F4] campfire within reach - opening without a walk'))
  assert.ok(FURNACE_PUT_RE.exec('[F4] furnace slots after put: input=raw_copper fuel=coal'))
  const keeps = FURNACE_PUT_RE.exec('[F4] furnace slots after put: input=sand fuel=stick (pocket keeps 2)')
  assert.equal(keeps[4], '2')
  assert.ok(!FURNACE_PUT_RE.exec('[F4] furnace slots before put: input=raw_copper fuel=coal'))
})
