// Fleet target claims: stop every bot from walking to the SAME nearest cluster.
//
// The problem, measured: every bot picks its map target with "the closest known
// position wins" (WorldMap.nearest). When the map holds one big cluster of a wanted
// resource (a beach with sand=110), all 19 bots pick THAT beach at the same trip
// cadence - run 35485296464 ended banked=0 smelted=0 sand=0 with 110 known sand
// positions and 38x 'map trip skipped: unreachable' (bots stacked onto one shore,
// tripped over each other and the pathfinder). Knowledge was shared; the CHOOSING
// was not coordinated.
//
// The fix (v0.15.0): a soft, expiring claim. When a bot commits to a trip target it
// registers a claim for its own username. Every other bot scores candidate targets
// as distance + penalty when an ACTIVE FOREIGN claim sits within CLAIM_RADIUS of the
// candidate - a radius, not a point, because a beach is 100+ positions of the same
// cluster and a point claim would just shift the pile one block sideways. The penalty
// is soft: when everything nearby is claimed, bots still take the best option instead
// of idling.
//
// Transport: bots live in ONE process in a fleet run (fleet19 shares the WorldMap by
// reference, so the ClaimBoard is shared the same way). A scout in a second terminal
// is a separate process - for that case claims travel over the same chat channel the
// resource sync uses, as one short line per claim:
//
//   PVB2|claim|<owner>|<x>,<y>,<z>
//
// Unknown lines are ignored (the PVB1 parser rejects PVB2 and vice versa), so old and
// new bots can mix. Claims expire after CLAIM_TTL_MS - a bot that dies mid-trip does
// not leave a permanent hole in the map. Everything here is pure (no bot imports) and
// unit-tested without a server.
import { Vec3 } from 'vec3'

export const CLAIM_TAG = 'PVB2'
export const CLAIM_TTL_MS = 120_000 // covers walk (<=25s) + harvest (<=40s) + slack; death-safe
export const CLAIM_PENALTY = 96 // virtual distance blocks; >= one typical map-trip walk
export const CLAIM_RADIUS = 32 // a claim deters this many blocks around its position
export const CLAIM_MAX_COORD = 30_000_000 // world border - a hostile line cannot place claims beyond it

export const claimKey = pos => `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`

/**
 * Registry of active trip claims, keyed by position. Expiry is checked lazily
 * (on read) and by sweep() - a bot that dies mid-trip never cleans up, the TTL does.
 */
export class ClaimBoard {
  constructor ({ ttlMs = CLAIM_TTL_MS, penalty = CLAIM_PENALTY, radius = CLAIM_RADIUS, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs
    this.penalty = penalty
    this.radius = radius
    this.radius2 = radius * radius
    this.now = now
    this.claims = new Map() // "x,y,z" -> { owner, x, y, z, expiresAt }
  }

  claim (owner, pos) {
    if (!owner || !pos) return false
    this.claims.set(claimKey(pos), {
      owner,
      x: Math.floor(pos.x),
      y: Math.floor(pos.y),
      z: Math.floor(pos.z),
      expiresAt: this.now() + this.ttlMs
    })
    return true
  }

  // Drop a claim. Only the OWNER can release it - a hostile or buggy "free" line
  // from another bot must not be able to un-claim a live trip.
  release (owner, pos) {
    const key = claimKey(pos)
    const c = this.claims.get(key)
    if (!c || c.owner !== owner) return false
    this.claims.delete(key)
    return true
  }

  // Who holds an active claim on this position (null when none or expired).
  claimedBy (pos) {
    const key = claimKey(pos)
    const c = this.claims.get(key)
    if (!c) return null
    if (this.now() >= c.expiresAt) {
      this.claims.delete(key)
      return null
    }
    return c.owner
  }

  // The scoring term for target selection. EVERY active foreign claim within
  // CLAIM_RADIUS of `pos` contributes its penalty (stacked) - a cluster that
  // attracted several bots already reads as "hot" and loses to any unclaimed
  // candidate in the pool. Own claims are free. The penalty only RANKS candidates
  // inside the caller's maxDistance budget, so stacking can never send a bot
  // beyond the pool - it just makes claimed clusters lose to unclaimed ones.
  penaltyFor (pos, me = null) {
    if (!this.claims.size) return 0
    const t = this.now()
    const px = Math.floor(pos.x)
    const py = Math.floor(pos.y)
    const pz = Math.floor(pos.z)
    let total = 0
    for (const c of this.claims.values()) {
      if (t >= c.expiresAt) continue
      if (c.owner === me) continue
      const dx = c.x - px
      const dy = c.y - py
      const dz = c.z - pz
      if (dx * dx + dy * dy + dz * dz <= this.radius2) total += this.penalty
    }
    return total
  }

  sweep () {
    const t = this.now()
    for (const [key, c] of this.claims) if (t >= c.expiresAt) this.claims.delete(key)
  }

  size () {
    this.sweep()
    return this.claims.size
  }
}

/**
 * Claim-aware target choice over a WorldMap. For every block name, up to k nearest
 * known positions are scored as distance + foreign-claim penalty, and the best score
 * wins. With board=null (or a claim-free map) this degrades to the old "nearest of
 * the requested names" behaviour, just over k candidates instead of 1.
 *
 * `skip` mirrors mapTargetFor's failedTrips filter; `verifyWith` mirrors the
 * WorldMap verify contract (deletes stale entries the loaded chunks disprove).
 */
export function chooseTarget ({ map, names, from, board = null, owner = null, maxDistance = 96, k = 6, verifyWith = null, skip = null }) {
  if (!map || !Array.isArray(names) || names.length === 0 || !from) return null
  let best = null
  for (const name of names) {
    const list = map.nearestK(name, from, { maxDistance, k, verifyWith })
    for (const pos of list) {
      if (skip && skip(pos)) continue
      const dist = pos.distanceTo(from)
      const score = dist + (board ? board.penaltyFor(pos, owner) : 0)
      if (!best || score < best.score) best = { name, pos, dist, score }
    }
  }
  return best
}

// ---------------------------------------------------------------- chat transport (PVB2)

// One claim line, e.g. "PVB2|claim|F3|123,64,-456". Returns null for anything that
// would not survive the round trip (owner shape, coordinate sanity, chat length).
export function encodeClaimLine ({ owner, pos }) {
  if (!owner || typeof owner !== 'string' || !/^\S{1,16}$/.test(owner) || !pos) return null
  const x = Math.floor(pos.x)
  const y = Math.floor(pos.y)
  const z = Math.floor(pos.z)
  if (![x, y, z].every(Number.isFinite)) return null
  if (Math.abs(x) > CLAIM_MAX_COORD || Math.abs(z) > CLAIM_MAX_COORD || y < -2048 || y > 2048) return null
  const line = `${CLAIM_TAG}|claim|${owner}|${x},${y},${z}`
  return line.length <= 240 ? line : null
}

// Parse one chat line into { owner, pos } - null for every line that is not a valid
// PVB2 claim (PVB1 payloads, other players' chat, server messages, hostile garbage).
export function decodeClaimLine (text) {
  if (typeof text !== 'string') return null
  const m = /^PVB2\|claim\|(\S{1,16})\|(-?\d+),(-?\d+),(-?\d+)$/.exec(text.trim())
  if (!m) return null
  const owner = m[1]
  const x = Number(m[2])
  const y = Number(m[3])
  const z = Number(m[4])
  if (![x, y, z].every(Number.isFinite)) return null
  if (Math.abs(x) > CLAIM_MAX_COORD || Math.abs(z) > CLAIM_MAX_COORD || y < -2048 || y > 2048) return null
  return { owner, pos: new Vec3(x, y, z) }
}

/**
 * Attach cross-process claim hearing to a bot (the PVB2 counterpart of attachChatSync).
 *   const claims = attachClaimSync(bot, board, { selfUsername: 'F1' })
 *   claims.broadcast(pos)          // tell the fleet we are walking to pos
 * Incoming PVB2 lines from OTHER bots are applied to `board` automatically; own lines
 * are skipped (the sender's own claim is already on its board). Applying the same
 * claim twice is idempotent (same key, same owner), so the dual chat listener
 * (messagestr + chat, same as chatsync) cannot double-apply anything.
 * The listener is removed by claims.stop().
 */
export function attachClaimSync (bot, board, { selfUsername = bot?.username ?? null, log = () => {} } = {}) {
  const stats = { received: 0, applied: 0, ignoredSelf: 0, malformed: 0, sent: 0 }

  const onMessage = (...args) => {
    try {
      // mineflayer's messagestr delivers (username, message); some stacks emit (message)
      const text = typeof args[0] === 'string' && typeof args[1] === 'string' ? args[1] : (args[0]?.text ?? args[0]?.toString?.() ?? '')
      const claim = decodeClaimLine(text)
      if (!claim) return
      stats.received++
      if (claim.owner === selfUsername) {
        stats.ignoredSelf++
        return
      }
      board.claim(claim.owner, claim.pos)
      stats.applied++
    } catch (e) {
      stats.malformed++
      log(`claim line error: ${e.message}`)
    }
  }

  bot.on('messagestr', onMessage)
  bot.on('chat', onMessage)

  return {
    broadcast (pos, owner = selfUsername) {
      const line = encodeClaimLine({ owner, pos })
      if (!line) return false
      try {
        bot.chat(line)
        stats.sent++
        return true
      } catch (e) {
        log(`claim broadcast failed: ${e.message}`)
        return false
      }
    },
    stop () {
      bot.removeListener('messagestr', onMessage)
      bot.removeListener('chat', onMessage)
    },
    stats
  }
}
