// Ore-steered branch mining (v0.18.8): pickOreTarget's geometry contract.
// The tunnel can only walk straight cardinal lines (a diagonal 1x2 gallery
// wedges the bot), so steering keeps the dominant axis and filters on the
// cross-axis offset; the Y band keeps the steer inside this gallery's level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickOreTarget, rememberSkip } from '../../src/fleet/oresteer.mjs'

const pos = (x, y, z) => ({ x, y, z })
const FROM = pos(100, 50, 100)

test('ore steer: picks the nearest qualifying candidate, dominant axis + sign', () => {
  const t = pickOreTarget({
    candidates: [
      { name: 'iron_ore', pos: pos(112, 50, 101) }, // dx=12, dz=1 -> axis x, dir +1
      { name: 'coal_ore', pos: pos(90, 51, 100) } // behind, farther
    ],
    from: FROM
  })
  assert.ok(t, 'a target is chosen')
  assert.equal(t.name, 'iron_ore')
  assert.equal(t.axis, 'x')
  assert.equal(t.dir, 1)
  assert.equal(t.cross, 1)
  assert.equal(t.dist, Math.round(Math.sqrt(12 * 12 + 1) * 10) / 10)
})

test('ore steer: z-dominant candidate gets axis z', () => {
  const t = pickOreTarget({ candidates: [{ name: 'copper_ore', pos: pos(101, 49, 130) }], from: FROM })
  assert.equal(t.axis, 'z')
  assert.equal(t.dir, 1)
})

test('ore steer: yBand filters other levels (a vein 20 up is another shaft job)', () => {
  const t = pickOreTarget({ candidates: [{ name: 'iron_ore', pos: pos(112, 71, 101) }], from: FROM })
  assert.equal(t, null)
  // inside the band it passes
  const t2 = pickOreTarget({ candidates: [{ name: 'iron_ore', pos: pos(112, 57, 101) }], from: FROM })
  assert.ok(t2, 'dy=7 within band')
})

test('ore steer: crossTolerance rejects targets the straight tunnel would miss', () => {
  // dx=30, dz=10: dominant axis x but the gallery line at z=100 misses the vein by 10
  const t = pickOreTarget({ candidates: [{ name: 'iron_ore', pos: pos(130, 50, 110) }], from: FROM })
  assert.equal(t, null)
  // dz=4 still reaches (vein clusters are 3-8 blocks wide)
  const t2 = pickOreTarget({ candidates: [{ name: 'iron_ore', pos: pos(130, 50, 104) }], from: FROM })
  assert.ok(t2, 'cross=4 accepted')
})

test('ore steer: reach caps the steer and the skip set is honoured', () => {
  const far = pickOreTarget({ candidates: [{ name: 'iron_ore', pos: pos(160, 50, 100) }], from: FROM })
  assert.equal(far, null, '60 blocks > default reach 48')
  const skip = new Set(['112,50,101'])
  const t = pickOreTarget({ candidates: [{ name: 'iron_ore', pos: pos(112, 50, 101) }], from: FROM, skip })
  assert.equal(t, null, 'skipped position is not steered at again')
})

test('ore steer: a target the bot already stands in is not navigation', () => {
  const t = pickOreTarget({ candidates: [{ name: 'iron_ore', pos: pos(101, 50, 100) }], from: FROM })
  assert.equal(t, null, 'dist < 2: mine it, do not steer')
})

test('ore steer: deterministic tie-break by name', () => {
  const t = pickOreTarget({
    candidates: [
      { name: 'zinc_ore', pos: pos(110, 50, 100) },
      { name: 'coal_ore', pos: pos(110, 50, 100) }
    ],
    from: FROM
  })
  assert.equal(t.name, 'coal_ore')
})

test('ore steer: junk input never steers', () => {
  assert.equal(pickOreTarget({ candidates: null, from: FROM }), null)
  assert.equal(pickOreTarget({ candidates: [{ name: 'iron_ore' }], from: FROM }), null)
  assert.equal(pickOreTarget({ candidates: [{ name: 'iron_ore', pos: pos(1, 1, 1) }], from: null }), null)
})

test('rememberSkip: bounded amnesia drops the oldest half', () => {
  const set = new Set()
  for (let i = 0; i < 40; i++) rememberSkip(set, `k${i}`)
  assert.ok(set.size <= 32, `size ${set.size} stays within cap`)
  assert.ok(!set.has('k0'), 'oldest entries dropped')
  assert.ok(set.has('k39'), 'recent entries kept')
  rememberSkip(set, undefined) // junk key must not throw
  rememberSkip(null, 'x') // junk set must not throw
})
