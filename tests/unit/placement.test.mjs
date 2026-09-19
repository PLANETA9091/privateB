// Structure placement maths for Minecraft 26.2 (RandomSpreadStructurePlacement).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  JavaRandom,
  largeFeatureSeed,
  potentialStructureChunk,
  potentialStructureChunks,
  bitsFor,
  STRUCTURES
} from '../../src/seed/placement.mjs'

const SEED = -8201142900731514829

test('JavaRandom is deterministic and reproduces the canonical Java sequence', () => {
  // java.util.Random(0): the first two next(32) outputs, verified against the canonical
  // 48-bit LCG (seed ^ 0x5DEECE66D; seed' = seed * 0x5DEECE66D + 0xB mod 2^48; value =
  // seed' >>> 16) - cross-checked against an independent Python implementation.
  const r = new JavaRandom(0)
  const v1 = (r.next(16) << 16) | r.next(16)
  const v2 = (r.next(16) << 16) | r.next(16)
  assert.equal(v1 >>> 0, 0xbb20d4d9)
  assert.equal(v2 >>> 0, 0x3d939b39)
})

test('largeFeatureSeed reproduces ChunkRandom.setLargeFeatureWithSalt', () => {
  // s = regionX*341873128712 + regionZ*132897987541 + seed + salt (64-bit two's complement)
  const s = largeFeatureSeed(SEED, 3, -7, 10387313)
  const expected = BigInt.asIntN(64,
    3n * 341873128712n + -7n * 132897987541n + BigInt(SEED) + 10387313n)
  assert.equal(s, expected)
  // negative world seed must not throw and must be 64-bit
  assert.ok(s >= -(2n ** 63n) && s < 2n ** 63n)
})

test('potentialStructureChunk offsets stay inside [0, spacing - separation)', () => {
  for (const def of Object.values(STRUCTURES)) {
    const bound = def.spacing - def.separation
    for (let rx = -3; rx <= 3; rx++) {
      for (let rz = -3; rz <= 3; rz++) {
        const { chunkX, chunkZ } = potentialStructureChunk(SEED, def, rx, rz)
        const ox = chunkX - rx * def.spacing
        const oz = chunkZ - rz * def.spacing
        assert.ok(ox >= 0 && ox < bound, `${def.set}: offsetX ${ox} outside [0,${bound})`)
        assert.ok(oz >= 0 && oz < bound, `${def.set}: offsetZ ${oz} outside [0,${bound})`)
      }
    }
  }
})

test('potentialStructureChunk is deterministic per (seed, region)', () => {
  const def = STRUCTURES.village_plains
  for (let rx = -4; rx <= 4; rx++) {
    for (let rz = -4; rz <= 4; rz++) {
      const a = potentialStructureChunk(SEED, def, rx, rz)
      const b = potentialStructureChunk(SEED, def, rx, rz)
      assert.deepEqual(a, b)
    }
  }
  // a different world seed must change at least ONE of the probed regions (a single
  // region can collide by chance: two offsets out of (spacing-separation)^2)
  let differs = false
  for (let rx = -4; rx <= 4; rx++) {
    for (let rz = -4; rz <= 4; rz++) {
      if (potentialStructureChunk(SEED + 1, def, rx, rz).chunkX !== potentialStructureChunk(SEED, def, rx, rz).chunkX) differs = true
    }
  }
  assert.ok(differs, 'seed +1 produced identical placement for every probed region')
})

test('every known structure has sane parameters', () => {
  for (const [name, def] of Object.entries(STRUCTURES)) {
    assert.ok(def.spacing > def.separation, `${name}: spacing must exceed separation`)
    assert.ok(Number.isInteger(def.salt), `${name}: salt must be an integer`)
    assert.ok(['linear', 'triangular'].includes(def.spreadType), `${name}: bad spreadType`)
  }
})

test('potentialStructureChunks covers the requested radius', () => {
  const def = STRUCTURES.shipwreck
  const chunks = potentialStructureChunks(SEED, def, { chunkRadius: 32, centerChunk: { x: 0, z: 0 } })
  // regions intersecting [-32,32] with spacing 24 => at least 3x3 regions
  assert.ok(chunks.length >= 9)
  for (const c of chunks) {
    assert.ok(Number.isInteger(c.chunkX) && Number.isInteger(c.chunkZ))
  }
})

test('bitsFor matches log2((spacing-separation)^2)', () => {
  assert.equal(bitsFor(24, 4), Math.log2(400))
  assert.ok(bitsFor(32, 5) > bitsFor(24, 4))
})

test('triangular spread never exceeds the linear bound', () => {
  const def = { ...STRUCTURES.monument }
  for (let rx = -8; rx <= 8; rx++) {
    for (let rz = -8; rz <= 8; rz++) {
      const { chunkX, chunkZ } = potentialStructureChunk(SEED, def, rx, rz)
      const ox = chunkX - rx * def.spacing
      const oz = chunkZ - rz * def.spacing
      assert.ok(ox >= 0 && ox < def.spacing - def.separation)
      assert.ok(oz >= 0 && oz < def.spacing - def.separation)
    }
  }
})
