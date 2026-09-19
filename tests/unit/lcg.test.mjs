// FastRandom (numeric LCG) must behave exactly like JavaRandom (BigInt reference).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FastRandom } from '../../src/seed/lcg.mjs'
import { JavaRandom } from '../../src/seed/placement.mjs'

test('FastRandom.next matches JavaRandom.next for the same seed', () => {
  const seed = -8201142900731514829
  const fast = new FastRandom(seed)
  const ref = new JavaRandom(seed)
  for (let i = 0; i < 1000; i++) {
    const bits = 1 + (i % 31)
    const a = fast.next(bits)
    const b = ref.next(bits)
    assert.equal(a, b, `mismatch at step ${i} (bits=${bits}): ${a} != ${b}`)
  }
})

test('FastRandom.nextInt matches JavaRandom.nextInt for non-power-of-two bounds', () => {
  const seed = 123456789012345
  const fast = new FastRandom(seed)
  const ref = new JavaRandom(seed)
  for (let i = 0; i < 500; i++) {
    const bound = 3 + (i % 97)
    assert.equal(fast.nextInt(bound), ref.nextInt(bound), `bound=${bound} step=${i}`)
  }
})

test('FastRandom.nextInt matches JavaRandom.nextInt for power-of-two bounds', () => {
  const seed = 42
  const fast = new FastRandom(seed)
  const ref = new JavaRandom(seed)
  for (const bound of [2, 4, 8, 16, 1024]) {
    for (let i = 0; i < 50; i++) {
      assert.equal(fast.nextInt(bound), ref.nextInt(bound), `bound=${bound}`)
    }
  }
})

test('nextInt results stay within [0, bound)', () => {
  const r = new FastRandom(987654321)
  for (let i = 0; i < 1000; i++) {
    const v = r.nextInt(20)
    assert.ok(v >= 0 && v < 20, `out of range: ${v}`)
  }
})

test('nextInt rejects zero and negative bounds like Java', () => {
  const r = new FastRandom(1)
  assert.throws(() => r.nextInt(0))
  const j = new JavaRandom(1)
  assert.throws(() => j.nextInt(0))
  assert.throws(() => j.nextInt(-5))
})

test('same seed => same sequence, different seed => different sequence', () => {
  const a = new FastRandom(777)
  const b = new FastRandom(777)
  const c = new FastRandom(778)
  const seqA = [a.nextInt(1000), a.nextInt(1000), a.nextInt(1000)]
  const seqB = [b.nextInt(1000), b.nextInt(1000), b.nextInt(1000)]
  const seqC = [c.nextInt(1000), c.nextInt(1000), c.nextInt(1000)]
  assert.deepEqual(seqA, seqB)
  assert.notDeepEqual(seqA, seqC)
})
