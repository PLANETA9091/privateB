// Vanilla 26.2 decoration RNG chain, read out of the server jar.
//
// Since 1.18 ores/dungeons are NOT placed with java.util.Random: the chunk decoration uses
// Xoroshiro128++ seeded through RandomSupport.upgradeSeedTo128bit, and each step gets its own
// feature seed. Formulas below are taken verbatim from the bytecode:
//   RandomSupport.upgradeSeedTo128bitUnmixed(seed): lo = seed ^ 0x6A09E667F3BCC909L,
//                                                   hi = lo + 0x9E3779B97F4A7C15L
//   RandomSupport.upgradeSeedTo128bit(seed) = unmixed(seed).mixed()
//   Seed128bit.mixed() applies mixStafford13 to both halves
//   Xoroshiro128PlusPlus.nextLong() = rotl(lo + hi, 17) + lo  (plus the state update)
//   WorldgenRandom.setDecorationSeed(seed, chunkX, chunkZ):
//       setSeed(seed); a = nextLong()|1; b = nextLong()|1; n = (chunkX*a + chunkZ*b) ^ seed
//   WorldgenRandom.setFeatureSeed(decorationSeed, index, step):
//       setSeed(decorationSeed + index + 10000*step)
const M64 = (1n << 64n) - 1n
const SIGN64 = 1n << 63n
const rotl = (x, k) => (BigInt.asUintN(64, ((x << BigInt(k)) | (x >> BigInt(64 - k))))) & M64

export function mixStafford13 (x) {
  let v = BigInt.asUintN(64, x)
  v = BigInt.asUintN(64, (v ^ (v >> 30n)) * 0xBF58476D1CE4E5B9n)
  v = BigInt.asUintN(64, (v ^ (v >> 27n)) * 0x94D049BB133111EBn)
  return BigInt.asUintN(64, v ^ (v >> 31n))
}

export function upgradeSeedTo128bitUnmixed (seed) {
  const lo = BigInt.asUintN(64, BigInt(seed)) ^ 0x6A09E667F3BCC909n
  const hi = BigInt.asUintN(64, lo + 0x9E3779B97F4A7C15n)
  return [BigInt.asUintN(64, lo), hi]
}

export function upgradeSeedTo128bit (seed) {
  const [lo, hi] = upgradeSeedTo128bitUnmixed(seed)
  return [mixStafford13(lo), mixStafford13(hi)]
}

export class Xoroshiro128PlusPlus {
  constructor (seedLo = 0n, seedHi = 0n) {
    this.lo = BigInt.asUintN(64, seedLo)
    this.hi = BigInt.asUintN(64, seedHi)
  }

  static fromSeed (seed) {
    const [lo, hi] = upgradeSeedTo128bit(seed)
    return new Xoroshiro128PlusPlus(lo, hi)
  }

  setSeed (seed) {
    const [lo, hi] = upgradeSeedTo128bit(seed)
    this.lo = lo
    this.hi = hi
  }

  nextLong () {
    const l = this.lo
    const m = this.hi
    const result = BigInt.asUintN(64, rotl(BigInt.asUintN(64, l + m), 17) + l)
    const m2 = BigInt.asUintN(64, m ^ l)
    this.lo = BigInt.asUintN(64, rotl(l, 49) ^ m2 ^ BigInt.asUintN(64, m2 << 21n))
    this.hi = rotl(m2, 28)
    return result
  }

  next (bits) {
    return Number(BigInt.asUintN(64, this.nextLong()) >> BigInt(64 - bits))
  }

  nextInt (bound) {
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
}

// WorldgenRandom.setDecorationSeed(levelSeed, chunkOriginX, chunkOriginZ)
export function setDecorationSeed (rng, levelSeed, chunkOriginX, chunkOriginZ) {
  const seed = BigInt.asUintN(64, BigInt(levelSeed))
  rng.setSeed(seed)
  const a = rng.nextLong() | 1n
  const b = rng.nextLong() | 1n
  const n = BigInt.asUintN(64, BigInt(chunkOriginX) * a + BigInt(chunkOriginZ) * b) ^ seed
  rng.setSeed(n)
  return BigInt.asUintN(64, n)
}

// WorldgenRandom.setFeatureSeed(decorationSeed, index, step)
export function setFeatureSeed (rng, decorationSeed, index, step) {
  const seed = BigInt.asUintN(64, BigInt(decorationSeed) + BigInt(index) + BigInt(10000 * step))
  rng.setSeed(seed)
  return seed
}

// GenerationStep.Decoration ordinals in 1.18+ - the step index goes into setFeatureSeed.
export const DECORATION_STEPS = [
  'raw_generation',
  'lakes',
  'local_modifications',
  'underground_structures',
  'surface_structures',
  'strongholds',
  'underground_ores',
  'underground_decoration',
  'fluid_springs',
  'vegetal_decoration',
  'top_layer_modification'
]
export const MONSTER_ROOM_STEP = DECORATION_STEPS.indexOf('underground_structures')

/**
 * Candidate dungeon positions for one chunk.
 *
 * data/minecraft/worldgen/placed_feature/monster_room.json (26.2):
 *   placement: count(10) -> in_square -> height_range(uniform 0..below_top) -> biome
 * so one attempt per count draws nextInt(16), nextInt(16) and nextInt(heightBound), and a
 * dungeon that a bot found must sit on one of those 10 positions.
 */
export function monsterRoomCandidates (worldSeed, chunkX, chunkZ, { index = 0, step = MONSTER_ROOM_STEP, heightBound = 384, attempts = 10 } = {}) {
  const rng = new Xoroshiro128PlusPlus()
  const originX = chunkX << 4
  const originZ = chunkZ << 4
  const decorationSeed = setDecorationSeed(rng, worldSeed, originX, originZ)
  setFeatureSeed(rng, decorationSeed, index, step)
  const out = []
  for (let i = 0; i < attempts; i++) {
    const x = originX + rng.nextInt(16)
    const z = originZ + rng.nextInt(16)
    const y = rng.nextInt(heightBound)
    out.push({ x, y, z })
  }
  return out
}

// Does any candidate attempt land where the bot found the dungeon?
export function dungeonMatches (worldSeed, chunkX, chunkZ, observed, { index = 0, step = MONSTER_ROOM_STEP, heightBound = 384, tolerance = 8 } = {}) {
  for (const cand of monsterRoomCandidates(worldSeed, chunkX, chunkZ, { index, step, heightBound })) {
    if (Math.abs(cand.x - observed.x) <= tolerance &&
        Math.abs(cand.z - observed.z) <= tolerance &&
        Math.abs(cand.y - observed.y) <= tolerance) return true
  }
  return false
}

export { M64, SIGN64 }
