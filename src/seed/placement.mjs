// Java-compatible random + structure placement math, ported from what SeedcrackerX uses
// (structure offsets -> seed bits) and from the vanilla placement formulas.
//
// Java's java.util.Random is a 48-bit LCG: seed' = (seed * 0x5DEECE66D + 0xB) mod 2^48.
// Structure placement (RandomSpreadStructurePlacement) derives a per-region seed with two
// nextLong() calls and takes the region offset from the low bits - that is exactly the
// information a seed cracker reverses.
const MULT = 0x5DEECE66Dn
const ADD = 0xBn
const MASK48 = (1n << 48n) - 1n

export class JavaRandom {
  constructor (seed) {
    this.seed = (BigInt.asUintN(64, BigInt(seed)) ^ MULT) & MASK48
  }

  next (bits) {
    this.seed = (this.seed * MULT + ADD) & MASK48
    return Number(this.seed >> BigInt(48 - bits))
  }

  nextInt (bound) {
    if (bound <= 0) throw new RangeError('bound must be positive')
    // power of two: (bound * next(31)) >> 31
    if ((bound & -bound) === bound) {
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n)
    }
    let bits
    let val
    do {
      bits = this.next(31)
      val = bits % bound
    } while (bits - val + (bound - 1) < 0)
    return val
  }

  // Java: (next(32) << 32) + next(32), kept as an unsigned 64-bit BigInt
  nextLong () {
    const hi = BigInt(this.next(32))
    const lo = BigInt(this.next(32))
    return BigInt.asUintN(64, (hi << 32n) + lo)
  }
}

// ChunkRandom.setLargeFeatureWithSalt(worldSeed, regionX, regionZ, salt)
// Bytecode of WorldgenRandom.setLargeFeatureWithSalt (26.2):
//   s = regionX * 341873128712L + regionZ * 132897987541L + worldSeed + salt
//   setSeed(s)
export function largeFeatureSeed (worldSeed, regionX, regionZ, salt = 0) {
  const seed = BigInt.asIntN(64, BigInt(worldSeed))
  const s = BigInt.asIntN(64,
    BigInt(regionX) * 341873128712n +
    BigInt(regionZ) * 132897987541n +
    seed +
    BigInt(salt)
  )
  return s
}

const floorDiv = (a, b) => Math.floor(a / b)

// RandomSpreadType.evaluate: LINEAR = nextInt(bound), TRIANGULAR = (nextInt(bound)+nextInt(bound))/2
function spread (rng, spreadType, bound) {
  if (spreadType === 'triangular') {
    return Math.floor((rng.nextInt(bound) + rng.nextInt(bound)) / 2)
  }
  return rng.nextInt(bound)
}

// The chunk a spread-out structure would be placed in for a given region.
export function potentialStructureChunk (worldSeed, { spacing, separation, salt = 0, spreadType = 'linear' }, regionX, regionZ) {
  const r = new JavaRandom(largeFeatureSeed(worldSeed, regionX, regionZ, salt))
  const bound = spacing - separation
  const offsetX = spread(r, spreadType, bound)
  const offsetZ = spread(r, spreadType, bound)
  return { chunkX: regionX * spacing + offsetX, chunkZ: regionZ * spacing + offsetZ }
}

// Real 26.2 parameters, read straight out of data/minecraft/worldgen/structure_set/*.json
// in the vanilla 26.2 server jar (spacing / separation / salt / spread_type).
export const STRUCTURES = {
  shipwreck: { spacing: 24, separation: 4, salt: 165745295, spreadType: 'linear', set: 'shipwrecks' },
  shipwreck_beached: { spacing: 24, separation: 4, salt: 165745295, spreadType: 'linear', set: 'shipwrecks' },
  ocean_monument: { spacing: 32, separation: 5, salt: 10387313, spreadType: 'triangular', set: 'ocean_monuments' },
  monument: { spacing: 32, separation: 5, salt: 10387313, spreadType: 'triangular', set: 'ocean_monuments' },
  village_plains: { spacing: 34, separation: 8, salt: 10387312, spreadType: 'linear', set: 'villages' },
  village_desert: { spacing: 34, separation: 8, salt: 10387312, spreadType: 'linear', set: 'villages' },
  village_savanna: { spacing: 34, separation: 8, salt: 10387312, spreadType: 'linear', set: 'villages' },
  village_snowy: { spacing: 34, separation: 8, salt: 10387312, spreadType: 'linear', set: 'villages' },
  village_taiga: { spacing: 34, separation: 8, salt: 10387312, spreadType: 'linear', set: 'villages' },
  desert_pyramid: { spacing: 32, separation: 8, salt: 14357617, spreadType: 'linear', set: 'desert_pyramids' },
  pillager_outpost: { spacing: 32, separation: 8, salt: 165745296, spreadType: 'linear', set: 'pillager_outposts' },
  swamp_hut: { spacing: 32, separation: 8, salt: 14357620, spreadType: 'linear', set: 'swamp_huts' },
  jungle_temple: { spacing: 32, separation: 8, salt: 14357619, spreadType: 'linear', set: 'jungle_temples' },
  igloo: { spacing: 32, separation: 8, salt: 14357618, spreadType: 'linear', set: 'igloos' },
  ocean_ruins: { spacing: 20, separation: 8, salt: 14357621, spreadType: 'linear', set: 'ocean_ruins' },
  trail_ruins: { spacing: 34, separation: 8, salt: 83469867, spreadType: 'linear', set: 'trail_ruins' },
  ruined_portal: { spacing: 40, separation: 15, salt: 34222645, spreadType: 'linear', set: 'ruined_portals' },
  buried_treasure: { spacing: 1, separation: 0, salt: 0, spreadType: 'linear', set: 'buried_treasures', frequency: 0.01 }
}

// The information a confirmed structure position carries, in bits (SeedcrackerX's getBits).
export function bitsFor (spacing, separation) {
  return Math.log2(Math.pow(spacing - separation, 2))
}

// Every chunk in a radius where the structure could have been placed.
export function potentialStructureChunks (worldSeed, def, { chunkRadius = 32, centerChunk = { x: 0, z: 0 } } = {}) {
  const out = []
  const { spacing } = def
  const r0x = floorDiv(centerChunk.x - chunkRadius, spacing)
  const r1x = floorDiv(centerChunk.x + chunkRadius, spacing)
  const r0z = floorDiv(centerChunk.z - chunkRadius, spacing)
  const r1z = floorDiv(centerChunk.z + chunkRadius, spacing)
  for (let rx = r0x; rx <= r1x; rx++) {
    for (let rz = r0z; rz <= r1z; rz++) {
      const chunk = potentialStructureChunk(worldSeed, def, rx, rz)
      out.push(chunk)
    }
  }
  return out
}
