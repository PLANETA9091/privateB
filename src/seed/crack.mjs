// Structure-seed cracker.
//
// Model: for a spread-out structure the world seed (mod 2^48, the "structure seed") fully
// determines the chunk it lands in:
//     s = regionX*341873128712 + regionZ*132897987541 + salt + seed
//     rng = java.util.Random(s)            (48-bit LCG)
//     offsetX = rng.nextInt(spacing - separation)     [or the triangular variant]
//     offsetZ = rng.nextInt(spacing - separation)
//
// Search strategy (the same bit-slicing trick SeedcrackerX uses, twice reduced):
//   phase A: brute-force the LOW 19 bits of the seed.  (nextInt(bound) % 2^k) equals
//            (next(31) % 2^k) for 2^k | bound, and those output bits depend only on the low
//            19+k bits of the seed state, so a 2^19 sweep with a cheap mask test kills
//            virtually every candidate.
//   phase B: extend each survivor with the remaining 29 bits and do the full forward check
//            against every observation.
import { FastRandom, low20For, A_MOD_20 } from './lcg.mjs'
import { STRUCTURES, potentialStructureChunk } from './placement.mjs'

// Phase A sweeps the low 20 bits of the seed (enough for 3 filter bits: state bits 17..19),
// phase B extends the remaining 28 bits.
const LOW_BITS = 20
const TWO_LOW = 1 << LOW_BITS
const TWO_HIGH = 1 << (48 - LOW_BITS)

// How many low bits of the offset are forced by the bound: 2^k | bound.
function usableMask (bound) {
  let k = 0
  while (k < 3 && bound % (1 << (k + 1)) === 0) k++
  return (1 << k) - 1
}

export function observe (structureName, worldX, worldZ) {
  const def = STRUCTURES[structureName]
  if (!def) throw new Error(`unknown structure ${structureName}`)
  const chunkX = worldX >> 4
  const chunkZ = worldZ >> 4
  const regionX = Math.floor(chunkX / def.spacing)
  const regionZ = Math.floor(chunkZ / def.spacing)
  const offsetX = chunkX - regionX * def.spacing
  const offsetZ = chunkZ - regionZ * def.spacing
  const bound = def.spacing - def.separation
  const flat = def.spreadType !== 'triangular' && offsetX < bound && offsetZ < bound
  return {
    name: structureName,
    def,
    chunkX,
    chunkZ,
    regionX,
    regionZ,
    offsetX,
    offsetZ,
    bound,
    mask: usableMask(bound),
    linear: def.spreadType !== 'triangular',
    infoBits: Math.log2(bound * bound),
    usable: flat,
    // regionX*341873128712 + regionZ*132897987541 + salt - stays exact in a double for the
    // region indices we search, so the hot loop never needs BigInt.
    base: regionX * 341873128712 + regionZ * 132897987541 + (def.salt ?? 0)
  }
}

export function totalBits (constraints) {
  return constraints.reduce((sum, c) => sum + (c.usable ? c.infoBits : 0), 0)
}

// ---- phase A ---------------------------------------------------------------
function lowBitsSurvivors (constraints) {
  const usable = constraints.filter(c => c.usable && c.linear && c.mask > 0)
  const out = []
  for (let low = 0; low < TWO_LOW; low++) {
    let ok = true
    for (const c of usable) {
      let state = low20For(low, c.regionX, c.regionZ, c.def.salt ?? 0)
      state = (state * A_MOD_20 + 11) % 1048576
      if ((Math.floor(state / 131072) & c.mask) !== (c.offsetX & c.mask)) { ok = false; break }
      state = (state * A_MOD_20 + 11) % 1048576
      if ((Math.floor(state / 131072) & c.mask) !== (c.offsetZ & c.mask)) { ok = false; break }
    }
    if (ok) out.push(low)
  }
  return out
}

// ---- phase B ---------------------------------------------------------------
const M48N = 281474976710656

// Fast path for the hot loop: only the first `limit` constraints are tested.
export function quickMatch (seed, constraints, rng, limit) {
  const n = Math.min(limit, constraints.length)
  for (let i = 0; i < n; i++) {
    const c = constraints[i]
    const mixed = ((c.base + seed) % M48N + M48N) % M48N
    rng.setSeed(mixed)
    if (c.linear) {
      if (rng.nextInt(c.bound) !== c.offsetX) return false
      if (rng.nextInt(c.bound) !== c.offsetZ) return false
    } else {
      if (Math.floor((rng.nextInt(c.bound) + rng.nextInt(c.bound)) / 2) !== c.offsetX) return false
      if (Math.floor((rng.nextInt(c.bound) + rng.nextInt(c.bound)) / 2) !== c.offsetZ) return false
    }
  }
  return true
}

export function fullMatch (seed, constraints, rng = new FastRandom(0)) {
  for (const c of constraints) {
    if (!c.usable) continue
    const mixed = ((c.base + seed) % M48N + M48N) % M48N
    rng.setSeed(mixed)
    if (c.linear) {
      const offsetX = rng.nextInt(c.bound)
      const offsetZ = rng.nextInt(c.bound)
      if (offsetX !== c.offsetX || offsetZ !== c.offsetZ) return false
    } else {
      const offsetX = Math.floor((rng.nextInt(c.bound) + rng.nextInt(c.bound)) / 2)
      const offsetZ = Math.floor((rng.nextInt(c.bound) + rng.nextInt(c.bound)) / 2)
      if (offsetX !== c.offsetX || offsetZ !== c.offsetZ) return false
    }
  }
  return true
}

// Full forward check through the placement module (authoritative, used to confirm finds).
export function verify (seed, constraints) {
  for (const c of constraints) {
    if (!c.usable) continue
    const got = potentialStructureChunk(seed, c.def, c.regionX, c.regionZ)
    if (got.chunkX !== c.chunkX || got.chunkZ !== c.chunkZ) return false
  }
  return true
}

export function crack ({
  constraints,
  highStart = 0,
  highStep = 1,
  onProgress = null,
  shouldStop = null
} = {}) {
  const started = Date.now()
  const survivors = lowBitsSurvivors(constraints)
  const phaseA = Date.now() - started
  const found = []
  let checked = 0
  const rng = new FastRandom(0)
  for (const low of survivors) {
    for (let high = highStart; high < TWO_HIGH; high += highStep) {
      if (shouldStop?.()) return { survivors: survivors.length, phaseA, found, checked, stopped: true }
      const seed = high * TWO_LOW + low
      checked++
      if (quickMatch(seed, constraints, rng, 4) && fullMatch(seed, constraints, rng)) {
        if (verify(seed, constraints)) found.push(seed)
      }
      if (onProgress && (checked & 0xFFFFFF) === 0) onProgress(checked, seed)
    }
  }
  return { survivors: survivors.length, phaseA, found, checked, ms: Date.now() - started }
}

export { lowBitsSurvivors, TWO_LOW, TWO_HIGH }
