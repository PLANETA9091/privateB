// Drop-collection targets (v0.173.0): dropTargets' contract + the vein sweep
// wiring. The measured reason - run74's F13 vein sweep dug 9 ores and its pocket
// read ZERO coal at every snapshot: an ore's drop lands inside the freed cell,
// 2-4 blocks away, beyond the ~1.5-block auto-pickup radius, and the sweep was
// the fleet's only digger that never walked its drops (sweep() and chopReachable
// both do). coal_ore=175 mined fleet-wide, ~23 in pockets - the fuel front
// starved between the dig and the pocket.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { dropTargets, SWEEP_DROP_REACH, SWEEP_DROP_CAP, SWEEP_DROP_TIMEOUT_MS, SWEEP_DROP_TOTAL_MS } from '../../src/lib/drops.mjs'

const pos = (x, y, z) => ({ x, y, z })
const item = (x, y, z, name = 'item') => ({ name, position: pos(x, y, z) })
const FROM = pos(100, 50, 100)

test('dropTargets: the plain-object entity index (bot.entities IS a plain object - the v0.172.0 lesson)', () => {
  const entities = { // mineflayer's index shape: numeric string keys, values are entities
    12: item(101, 50, 100), // 1.0 away
    13: item(100, 50, 103), // 3.0 away
    14: item(104, 50, 100) // 4.0 away
  }
  const t = dropTargets(entities, FROM)
  assert.equal(t.length, 3)
  assert.deepEqual(t[0], pos(101, 50, 100), 'nearest first - the walk the bot is already facing')
  assert.deepEqual(t[1], pos(100, 50, 103))
  assert.deepEqual(t[2], pos(104, 50, 100))
})

test('dropTargets: an array of entities works the same', () => {
  const t = dropTargets([item(102, 50, 100), item(101, 50, 100)], FROM)
  assert.equal(t.length, 2)
  assert.deepEqual(t[0], pos(101, 50, 100))
})

test('dropTargets: maxDistance filters, cap truncates the nearest', () => {
  const entities = [item(103, 50, 100), item(102, 50, 100), item(101, 50, 100), item(100, 50, 104)]
  assert.equal(dropTargets(entities, FROM, { maxDistance: 2.5 }).length, 2, 'only the <=2.5 family')
  const capped = dropTargets(entities, FROM, { cap: 2 })
  assert.equal(capped.length, 2)
  assert.deepEqual(capped[0], pos(101, 50, 100), 'the cap keeps the NEAREST')
  assert.deepEqual(capped[1], pos(102, 50, 100))
  assert.equal(dropTargets(entities, FROM).length, 4, 'defaults keep everything within reach')
  assert.ok(SWEEP_DROP_REACH === 8 && SWEEP_DROP_CAP === 8, 'the sweep constants pin')
  assert.ok(SWEEP_DROP_TIMEOUT_MS === 8000 && SWEEP_DROP_TOTAL_MS === 24000, 'the walk budgets pin')
})

test('dropTargets: non-item entities are skipped (mob, arrow, xp orb classes)', () => {
  const entities = [
    { name: 'zombie', position: pos(101, 50, 100) },
    { name: 'experience_orb', position: pos(101, 50, 101) },
    item(100, 50, 102)
  ]
  const t = dropTargets(entities, FROM)
  assert.equal(t.length, 1)
  assert.deepEqual(t[0], pos(100, 50, 102))
})

test('dropTargets: the junk battery never throws, never claims a drop', () => {
  assert.deepEqual(dropTargets(null, FROM), [])
  assert.deepEqual(dropTargets(undefined, FROM), [])
  assert.deepEqual(dropTargets(42, FROM), [])
  assert.deepEqual(dropTargets('items', FROM), [])
  assert.deepEqual(dropTargets([null, 3, 'x', {}, { name: 'item' }, { name: 'item', position: { x: 'a', y: 1, z: 1 } }], FROM), [],
    'junk entries and nameless/positionless items are skipped')
  assert.deepEqual(dropTargets([item(101, 50, 100)], null), [], 'a junk collector position yields []')
  assert.deepEqual(dropTargets([item(101, 50, 100)], { x: NaN, y: 1, z: 1 }), [], 'a NaN position yields []')
  assert.deepEqual(dropTargets([item(NaN, 50, 100), item(Infinity, 50, 100), item(101, 50, 100)], FROM).length, 1,
    'non-finite drop coordinates are skipped, the finite one stays')
})

// ---- THE WIRING PINS: the sweep must WALK what it digs ----

test('REGRESSION PIN: the vein sweep harvests its drops (the v0.173.0 cure)', async () => {
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const sweepAt = minerSrc.indexOf('async function veinSweep')
  assert.ok(sweepAt > 0, 'veinSweep found in miner.mjs')
  const boreAt = minerSrc.indexOf('async function bore (')
  assert.ok(boreAt > sweepAt, 'the sweep body region is bracketed')
  const sweepBody = minerSrc.slice(sweepAt, boreAt)
  assert.ok(sweepBody.includes('dropTargets(bot.entities'), 'the sweep reads the plain-object entity index through the pure pick')
  assert.ok(sweepBody.includes("'sweep drops'"), 'the drop walk labels itself for the run logs')
  assert.ok(sweepBody.includes('SWEEP_DROP_TOTAL_MS'), 'the drop walk is fenced by a total budget')
  assert.ok(sweepBody.includes('SWEEP_DROP_TIMEOUT_MS'), 'each drop walk has its own short timeout')
  assert.ok(sweepBody.includes('inventoryLoad(bot).units'), 'the pickup read is the honest pocket delta')
  assert.ok(sweepBody.includes('walked from the drops'), 'the harvest names itself for the run logs')
  assert.ok(sweepBody.includes('map?.take(blk.name, pos)'), 'a swept ore leaves the shared map (no re-steer at a mined-out cell)')
})

test('REGRESSION PIN: the tunnel keeps the same map hygiene (the steer eats its own records)', async () => {
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const tunnelAt = minerSrc.indexOf('async function tunnel (')
  assert.ok(tunnelAt > 0, 'tunnel found in miner.mjs')
  const sweepAt = minerSrc.indexOf('async function veinSweep')
  const tunnelBody = minerSrc.slice(tunnelAt, sweepAt)
  assert.ok(tunnelBody.includes("map?.take(feetB.name, feetCell)"), 'the feet cell leaves the map')
  assert.ok(tunnelBody.includes('map?.take(headB.name, feetCell.offset(0, 1, 0))'), 'the head cell leaves the map')
  // the import rides along - a missing import would throw the whole miner at boot
  assert.ok(minerSrc.includes("from '../lib/drops.mjs'"), 'the drops import is present in miner.mjs')
})
