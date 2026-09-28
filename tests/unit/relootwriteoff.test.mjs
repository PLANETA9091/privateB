// tests/unit/relootwriteoff.test.mjs
// (v0.280.0) THE RELOOT WRITE-OFF STAMP - the no-surface class's first voice.
// Face 36384223490's F1 lost 153u - THE BIGGEST SINGLE DROP THE FLEET HAS
// EVER MEASURED - and the reloot ladder ended mute: walk 'No path to the
// goal!' -> wide retry the same death -> surface scan refused 'no surface:
// land' (the surface leg is the WET-column cure; a dry unreachable column
// has no fourth leg), and the ONE terminal line said 'the drops stay lost'
// with NO stake, NO trace, NO age. The stamp names all three, so the census
// can split the write-off class by STAKE (the 153u scale vs the 22u scale)
// and by AGE (expired stranded vs alive stranded).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { relootWriteoffLine } from '../../src/lib/reloot.mjs'
import { deathDropLine, deathDropTotal } from '../../src/lib/statcarry.mjs'

test('relootWriteoffLine: the F1 shape (the biggest loss names its stake and its trace)', () => {
  const line = relootWriteoffLine({
    tag: 'F1',
    goal: { x: 112.4, y: 45.1, z: 424.7 },
    pocketU: 153,
    ageMs: 42000,
    despawnMs: 300000,
    walkWhy: 'No path to the goal!',
    retryWhy: 'No path to the goal!',
    surfaceWhy: 'land'
  })
  assert.equal(line, "F1 reloot: write-off (goal [112,45,424], stake ~153u, age 42s/300s window, walk 'No path to the goal!' -> retry 'No path to the goal!' -> surface 'land')")
})

test('relootWriteoffLine: the expired-stranded subclass renders honestly (age past the window)', () => {
  const line = relootWriteoffLine({
    tag: 'F7',
    goal: { x: -195, y: 59, z: 405 },
    pocketU: 84,
    ageMs: 342000,
    despawnMs: 300000,
    walkWhy: 'No path to the goal!',
    retryWhy: null,
    surfaceWhy: 'no-surface'
  })
  assert.equal(line, "F7 reloot: write-off (goal [-195,59,405], stake ~84u, age 342s/300s window, walk 'No path to the goal!' -> retry unknown -> surface 'no-surface')", 'age past the window is the census signal - expired stranded, never clamped')
})

test('relootWriteoffLine: the junk family never mutes the class (the line NEVER returns null)', () => {
  assert.equal(relootWriteoffLine({}), " reloot: write-off (goal unknown, stake unknown, age unknown, walk unknown -> retry unknown -> surface unknown)")
  assert.equal(relootWriteoffLine({ tag: 'F3', goal: { x: NaN, y: 45, z: 424 }, pocketU: null }), "F3 reloot: write-off (goal unknown, stake unknown, age unknown, walk unknown -> retry unknown -> surface unknown)")
  assert.equal(relootWriteoffLine({ tag: 'F4', pocketU: 0 }), "F4 reloot: write-off (goal unknown, stake unknown, age unknown, walk unknown -> retry unknown -> surface unknown)", 'a 0 stake claims nothing - the empty-pocket read is not a stake')
  assert.equal(relootWriteoffLine({ tag: 'F5', pocketU: '153', ageMs: -5 }), "F5 reloot: write-off (goal unknown, stake unknown, age unknown, walk unknown -> retry unknown -> surface unknown)", 'a string stake is not a measurement (the strict gate), a negative age claims no clock')
  assert.equal(relootWriteoffLine({ tag: 'F6', pocketU: 22.9 }), "F6 reloot: write-off (goal unknown, stake ~22u, age unknown, walk unknown -> retry unknown -> surface unknown)", 'fractions floor - the stake is a units count')
})

test('relootWriteoffLine: the junk-message cap (a 200-char failure cannot flood the row)', () => {
  const junk = 'x'.repeat(200)
  const line = relootWriteoffLine({ tag: 'F9', walkWhy: junk, retryWhy: junk, surfaceWhy: 'land' })
  assert.ok(line.includes("'xxxx"), 'the capped verbatim renders quoted')
  assert.ok(line.length < 220, `the line stays short (${line.length})`)
  assert.ok(!line.includes('x'.repeat(41)), 'the 40-char cap holds')
})

test('deathDropTotal: the stake arithmetic matches the death drop line (the one-renderer law)', () => {
  const items = [{ name: 'gravel', count: 39 }, { name: 'diorite', count: 30.7 }, { name: 'bad', count: -5 }, { name: null, count: 4 }, { name: 'raw_copper', count: 26 }]
  assert.equal(deathDropTotal(items), 95, '39 + 30 (floored) + 26; junk names and non-positive counts filter out')
  assert.equal(deathDropTotal(null), null)
  assert.equal(deathDropTotal([]), 0)
  const line = deathDropLine({ tag: 'F2', pos: null, items })
  assert.ok(line.includes('~95u lost'), 'the line and the total read the SAME arithmetic - the write-off stake can never disagree with the row')
})

test('the write-off is wired: the death event stores the stake, the ladder renders it, the sealed gate keeps its salvage (v0.280.0)', () => {
  const minerSrc = readFileSync(new URL('../../src/bots/miner.mjs', import.meta.url), 'utf8')
  const fleetSrc = readFileSync(new URL('../../testbed/fleet19.mjs', import.meta.url), 'utf8')
  const relootSrc = readFileSync(new URL('../../src/lib/reloot.mjs', import.meta.url), 'utf8')
  const statSrc = readFileSync(new URL('../../src/lib/statcarry.mjs', import.meta.url), 'utf8')
  assert.ok(relootSrc.includes('export function relootWriteoffLine'), 'the pure layer exports the stamp (the domain owner renders it)')
  assert.ok(statSrc.includes('export function deathDropTotal'), 'the stake arithmetic exports (the death event stores it)')
  assert.ok(minerSrc.includes('deathDropTotal(dropItems)'), 'the death handler reads the stake while the inventory still lists')
  assert.ok(minerSrc.includes('pocketU: dropPocketU'), 'the stake rides the reloot record')
  assert.ok(fleetSrc.includes('relootWriteoffLine'), 'the runner imports the stamp')
  const wireAt = fleetSrc.indexOf('relootWriteoffLine({')
  const sealedGate = fleetSrc.indexOf("if (!(rs.why === 'no-surface' && rs.subWhy === 'sealed')) {")
  assert.ok(wireAt > 0 && sealedGate > 0 && sealedGate < wireAt, 'the write-off rides the surface refusal, gated behind the sealed check')
  assert.ok(fleetSrc.includes('pocketU: relootDeath.pocketU'), 'the stake flows from the record to the line')
  assert.ok(fleetSrc.includes('surfaceWhy: rs.subWhy || rs.why'), 'the surface verdict rides the trace')
})
