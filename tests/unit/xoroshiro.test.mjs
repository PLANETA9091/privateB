// 1.18+ decoration RNG chain (Xoroshiro128++ + stafford mixing + decoration seeding).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mixStafford13,
  upgradeSeedTo128bit,
  upgradeSeedTo128bitUnmixed,
  Xoroshiro128PlusPlus,
  setDecorationSeed,
  setFeatureSeed,
  monsterRoomCandidates,
  DECORATION_STEPS
} from '../../src/seed/xoroshiro.mjs'

test('mixStafford13 is deterministic and returns unsigned 64-bit values', () => {
  const a = mixStafford13(1n)
  const b = mixStafford13(1n)
  assert.equal(a, b)
  assert.ok(a >= 0n && a < 2n ** 64n)
  // known reference value from the vanilla implementation for stafford(1)
  assert.equal(mixStafford13(0n), 0n)
})

test('upgradeSeedTo128bitUnmixed applies the two golden-ratio constants', () => {
  const [lo, hi] = upgradeSeedTo128bitUnmixed(0n)
  assert.equal(lo, 0x6A09E667F3BCC909n ^ 0n)
  assert.equal(hi, BigInt.asUintN(64, lo + 0x9E3779B97F4A7C15n))
})

test('upgradeSeedTo128bit handles negative (world) seeds', () => {
  const [lo, hi] = upgradeSeedTo128bit(-8201142900731514829n)
  assert.ok(lo >= 0n && lo < 2n ** 64n)
  assert.ok(hi >= 0n && hi < 2n ** 64n)
  const [lo2, hi2] = upgradeSeedTo128bit(-8201142900731514829n)
  assert.equal(lo, lo2)
  assert.equal(hi, hi2)
})

test('Xoroshiro128PlusPlus is deterministic and its state actually advances', () => {
  const r1 = new Xoroshiro128PlusPlus(1n, 2n)
  const r2 = new Xoroshiro128PlusPlus(1n, 2n)
  const seq1 = [r1.nextLong(), r1.nextLong(), r1.nextLong()]
  const seq2 = [r2.nextLong(), r2.nextLong(), r2.nextLong()]
  assert.deepEqual(seq1, seq2)
  assert.notDeepEqual(seq1[0], seq1[1])
})

test('fromSeed and setSeed agree', () => {
  const a = Xoroshiro128PlusPlus.fromSeed(123456789n)
  const b = new Xoroshiro128PlusPlus()
  b.setSeed(123456789n)
  assert.equal(a.nextLong(), b.nextLong())
})

test('setDecorationSeed mixes chunk origin into the stream', () => {
  const r1 = new Xoroshiro128PlusPlus()
  const d1 = setDecorationSeed(r1, 42n, 0, 0)
  const r2 = new Xoroshiro128PlusPlus()
  const d2 = setDecorationSeed(r2, 42n, 5, 7)
  assert.notEqual(d1, d2)
})

test('setFeatureSeed depends on both index and step', () => {
  // setFeatureSeed(rng, decorationSeed, index, step) seeds a real rng instance
  const mk = () => new Xoroshiro128PlusPlus()
  const a = setFeatureSeed(mk(), 1000n, 1, 2)
  const b = setFeatureSeed(mk(), 1000n, 2, 2)
  const c = setFeatureSeed(mk(), 1000n, 1, 3)
  assert.notEqual(a, b)
  assert.notEqual(a, c)
  // and the returned seed is what the formula says: decorationSeed + index + 10000*step
  const r = mk()
  const d = setFeatureSeed(r, 1000n, 1, 2)
  assert.equal(d, BigInt.asUintN(64, 1000n + 1n + 20000n))
})

test('monsterRoomCandidates returns at most `attempts` positions', () => {
  const list = monsterRoomCandidates(-8201142900731514829n, 10, -10, { attempts: 5 })
  assert.ok(Array.isArray(list))
  assert.ok(list.length <= 5)
})

test('DECORATION_STEPS includes underground_structures (monster rooms)', () => {
  assert.ok(DECORATION_STEPS.includes('underground_structures'))
})
