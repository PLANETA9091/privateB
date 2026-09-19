// Fast java.util.Random (48-bit LCG) that works on plain numbers.
//
// Keeping the state as two 24-bit halves means every product stays below 2^53, so we get
// exact integer maths without BigInt - roughly two orders of magnitude faster, which is
// what makes a 2^29-wide seed sweep practical in JavaScript.
const A = 25214903917 // 0x5DEECE66D
const C = 11
const A_LO = A % 16777216 // 15525485
const A_HI = Math.floor(A / 16777216) // 1502
const M24 = 16777216
const MASK48 = 281474976710655
export const A_MOD_20 = A % (1 << 20)

export class FastRandom {
  constructor (seed = 0) {
    this.hi = 0
    this.lo = 0
    this.setSeed(seed)
  }

  setSeed (seed) {
    const s = ((Number(seed) % MASK48) + MASK48) % MASK48
    const hi = Math.floor(s / M24)
    const lo = s - hi * M24
    const xLo = (lo ^ (A_LO & (M24 - 1))) % M24
    // A = A_HI*2^24 + A_LO, so (seed ^ A) low bits come from lo ^ A_LO and the carry from A_HI
    const xHi = (hi ^ A_HI ^ Math.floor((lo ^ A_LO) / M24)) % M24
    this.hi = xHi
    this.lo = xLo
  }

  step () {
    const t = this.lo * A_LO + C
    const newLo = t % M24
    const carry = (t - newLo) / M24
    const t2 = this.hi * A_LO + this.lo * A_HI + carry
    this.lo = newLo
    this.hi = t2 % M24
  }

  // java.util.Random.next(bits), bits <= 32
  next (bits) {
    this.step()
    const full = this.hi * M24 + this.lo
    return Math.floor(full / Math.pow(2, 48 - bits))
  }

  nextInt (bound) {
    if ((bound & -bound) === bound) {
      return Math.floor((bound * this.next(31)) / 2147483648)
    }
    let bits
    let val
    do {
      bits = this.next(31)
      val = bits % bound
    } while (bits - val + (bound - 1) < 0)
    return val
  }

  // Low 20 bits of the next(31) output, i.e. bits 17..19 of the state after one step.
  // Used by the low-bits filter: for a bound with 2-adic valuation k <= 3,
  // (nextInt(bound) % 2^k) === (next(31) % 2^k), and those bits only depend on the
  // low 19+k bits of the pre-step state.
  static lowBitsAfter (stateLow20, steps = 1) {
    // only A mod 2^20 matters here, and that keeps every product well below 2^53
    const A20 = A % MASK20
    let st = stateLow20
    for (let i = 0; i < steps; i++) {
      st = (st * A20 + C) % MASK20
    }
    return Math.floor(st / 131072) & 7 // bits 17..19
  }
}

const MASK20 = 1 << 20 // 1048576

// Low 20 bits of (regionSeed ^ XOR_MULT) for a candidate seed; only the low bits of the
// seed matter here, which is what makes the 2^19 first phase sound.
export function low20For (seedLow20, regionX, regionZ, salt) {
  const s = (regionX * (341873128712 % MASK20) + regionZ * (132897987541 % MASK20) + salt * 1 + seedLow20) % MASK20
  const xored = (s ^ (A % MASK20)) % MASK20
  return (xored + MASK20) % MASK20
}
