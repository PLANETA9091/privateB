// Tests for the suffocation policy in src/lib/suffocate.mjs.
// run554 (dispatch 35974993311, the v0.139.0 fleet) named suffocation the TOP
// death class: SIX of 17 deaths read 'suffocated in a wall', all inside
// digging ops, four clustered around [-167,50,428] (two bots on the SAME cell
// class the fleet re-digs). These tests pin the block classification the
// watch executes and the head-first rescue order.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SUFFOCATE_WATCH_EVERY_TICKS, SUFFOCATE_DIG_MAX_TICKS, SUFFOCATE_SAFE_RE,
  suffocates, suffocateRescueTargets
} from '../../src/lib/suffocate.mjs'

test('watch constants: the cadence and the dig window are the measured shape', () => {
  assert.equal(SUFFOCATE_WATCH_EVERY_TICKS, 10, '10 ticks = 0.5s: a bury is seen before the second vanilla damage tick')
  assert.equal(SUFFOCATE_DIG_MAX_TICKS, 60, '3s of STOP spam covers a dry rescue dig; a failed dig re-plans on the next cadence')
})

test('suffocates: the measured bury classes (gravel/sand/dirt/stone) all read true', () => {
  for (const name of ['gravel', 'sand', 'dirt', 'stone', 'cobblestone', 'andesite', 'deepslate', 'oak_planks']) {
    assert.equal(suffocates({ name, boundingBox: 'block', transparent: false }), true, `${name} suffocates a buried bot`)
  }
})

test('suffocates: air, liquids, transparent lookalikes and the safe-name list never read true', () => {
  assert.equal(suffocates({ name: 'air', boundingBox: 'empty', transparent: true }), false)
  assert.equal(suffocates({ name: 'water', boundingBox: 'empty', transparent: true }), false, 'water is the swim lane, not a bury')
  for (const name of ['glass', 'oak_leaves', 'birch_leaves', 'cobweb', 'slime_block', 'honey_block', 'white_stained_glass_pane']) {
    assert.equal(suffocates({ name, boundingBox: 'block', transparent: false }), false, `${name} never suffocates (safe-name list, the belt-and-braces layer)`)
  }
  assert.equal(suffocates({ name: 'iron_bars', boundingBox: 'block', transparent: true }), false, 'the real mineflayer flags refuse iron_bars via the transparent read (a thin shape, no full cube)')
  assert.equal(suffocates({ name: 'glass', boundingBox: 'block', transparent: true }), false, 'the transparent flag alone also refuses glass')
})

test('suffocates: junk reads never dig on a guess', () => {
  assert.equal(suffocates(null), false)
  assert.equal(suffocates(undefined), false)
  assert.equal(suffocates('gravel'), false, 'raw strings are not block reads')
  assert.equal(suffocates({}), false, 'no boundingBox -> no bury')
  assert.equal(suffocates({ name: 'gravel', boundingBox: 'empty' }), false, 'empty collision = the bot is not inside it')
  assert.equal(suffocates({ boundingBox: 'block' }), true, 'a solid read with no name/transparent flags still reads a bury (digging it off the head is never wrong)')
})

test('suffocateRescueTargets: head first (the lethal cell), feet second, bedrock never', () => {
  const gravel = { name: 'gravel', boundingBox: 'block', transparent: false }
  const sand = { name: 'sand', boundingBox: 'block', transparent: false }
  const air = { name: 'air', boundingBox: 'empty', transparent: true }
  assert.deepEqual(suffocateRescueTargets({ headBlock: gravel, feetBlock: air }), ['head'], 'the head is the lethal cell')
  assert.deepEqual(suffocateRescueTargets({ headBlock: air, feetBlock: gravel }), ['feet'], 'a feet pin still digs')
  assert.deepEqual(suffocateRescueTargets({ headBlock: gravel, feetBlock: sand }), ['head', 'feet'], 'both buried: head first')
  assert.deepEqual(suffocateRescueTargets({ headBlock: air, feetBlock: air }), [], 'dry cells: nothing to dig')
  assert.deepEqual(suffocateRescueTargets({ headBlock: { name: 'bedrock', boundingBox: 'block', transparent: false }, feetBlock: null }), [], 'bedrock never plans a dig (the watch would spin on it)')
  assert.deepEqual(suffocateRescueTargets({}), [], 'junk inputs dig nothing')
})

test('REGRESSION PIN: the watch is wired into miner.mjs (the v0.140.0 bury lane)', async () => {
  const fs = await import('node:fs')
  const minerSrc = fs.readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  assert.ok(/bot\.on\('physicsTick'/.test(minerSrc), 'the watch rides the physics tick emitter')
  assert.ok(/suffocateRescueTargets\(\{ headBlock: headB, feetBlock: feetB \}\)/.test(minerSrc), 'the watch asks the pure classifier with both cell reads')
  assert.ok(/suffocate watch: \$\{which\} buried in/.test(minerSrc), 'the rescue line names the bury class for the run decode')
  assert.ok(/suffocateBusy = true/.test(minerSrc) && /finally \{ suffocateBusy = false \}/.test(minerSrc), 'one rescue at a time, the busy flag always drops')
  assert.ok(/swimming \|\| bot\._waterRescue/.test(minerSrc), 'the swim lane outranks the watch (the drowning rescue owns the controls)')
})
