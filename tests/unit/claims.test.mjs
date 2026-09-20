// Unit tests for the fleet target-claim layer (src/fleet/claims.mjs).
// Pure logic - no server, no sockets, expiry driven by an injectable clock.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ClaimBoard, chooseTarget, encodeClaimLine, decodeClaimLine,
  attachClaimSync, CLAIM_PENALTY, CLAIM_RADIUS, CLAIM_TTL_MS
} from '../../src/fleet/claims.mjs'
import { WorldMap } from '../../src/fleet/worldmap.mjs'
import { Vec3 } from 'vec3'

const at = (x, y, z) => new Vec3(x, y, z)

// A controllable clock: expiry tests must not sleep for real.
const makeClock = (start = 1_000_000) => {
  let t = start
  return {
    now: () => t,
    advance: ms => { t += ms }
  }
}

// ---------------------------------------------------------------- ClaimBoard

test('ClaimBoard: claim, claimedBy and expiry', () => {
  const clock = makeClock()
  const board = new ClaimBoard({ now: clock.now })
  assert.equal(board.claimedBy(at(10, 64, -5)), null, 'empty board claims nothing')
  assert.ok(board.claim('F1', at(10, 64, -5)))
  assert.equal(board.claimedBy(at(10, 64, -5)), 'F1')
  clock.advance(CLAIM_TTL_MS - 1000)
  assert.equal(board.claimedBy(at(10, 64, -5)), 'F1', 'still active just before expiry')
  clock.advance(2000)
  assert.equal(board.claimedBy(at(10, 64, -5)), null, 'expired claims read as none')
  assert.equal(board.size(), 0, 'expired claims are swept from the board')
})

test('ClaimBoard: claim rejects junk, floor-stabilises coordinates', () => {
  const board = new ClaimBoard()
  assert.equal(board.claim(null, at(1, 2, 3)), false)
  assert.equal(board.claim('F1', null), false)
  assert.ok(board.claim('F1', at(10.7, 64.2, -5.9)))
  assert.equal(board.claimedBy(at(10, 64, -6)), 'F1', 'floored ints are the key space')
})

test('ClaimBoard: only the owner can release a claim', () => {
  const board = new ClaimBoard()
  board.claim('F1', at(0, 64, 0))
  assert.equal(board.release('F2', at(0, 64, 0)), false, 'a foreign release must be refused')
  assert.equal(board.claimedBy(at(0, 64, 0)), 'F1', 'the claim survives it')
  assert.equal(board.release('F1', at(0, 64, 0)), true)
  assert.equal(board.claimedBy(at(0, 64, 0)), null)
})

test('ClaimBoard: penaltyFor is radius-based, foreign-only and soft-expiring', () => {
  const clock = makeClock()
  const board = new ClaimBoard({ now: clock.now })
  board.claim('F1', at(500, 64, 500))
  // inside the radius: another bot pays, the owner does not
  assert.equal(board.penaltyFor(at(500 + CLAIM_RADIUS - 5, 64, 500), 'F2'), CLAIM_PENALTY)
  assert.equal(board.penaltyFor(at(500, 64, 500), 'F1'), 0, 'own claims are free')
  // outside the radius: no penalty (3D distance, dy counts)
  assert.equal(board.penaltyFor(at(500 + CLAIM_RADIUS + 10, 64, 500), 'F2'), 0)
  assert.equal(board.penaltyFor(at(500, 64 + CLAIM_RADIUS + 10, 500), 'F2'), 0)
  // expiry kills the penalty without an explicit release
  clock.advance(CLAIM_TTL_MS + 1)
  assert.equal(board.penaltyFor(at(500, 64, 500), 'F2'), 0)
})

test('ClaimBoard: penalties stack - a hot cluster deters more than a single claim', () => {
  const board = new ClaimBoard()
  const target = at(400, 64, 400)
  assert.equal(board.penaltyFor(target, 'F9'), 0)
  board.claim('F1', at(410, 64, 400)) // inside the radius
  assert.equal(board.penaltyFor(target, 'F9'), CLAIM_PENALTY)
  board.claim('F2', at(390, 64, 405)) // a second bot went there too
  board.claim('F3', at(415, 64, 410)) // a third one
  assert.equal(board.penaltyFor(target, 'F9'), 3 * CLAIM_PENALTY, 'each foreign claim in the radius adds its penalty')
  assert.equal(board.penaltyFor(target, 'F2'), 2 * CLAIM_PENALTY, 'own claims never count against yourself')
})

test('ClaimBoard: last claim per position wins, sweep and size agree', () => {
  const clock = makeClock()
  const board = new ClaimBoard({ now: clock.now })
  board.claim('F1', at(1, 64, 1))
  board.claim('F2', at(1, 64, 1)) // same spot, second bot re-claims it
  assert.equal(board.claimedBy(at(1, 64, 1)), 'F2')
  board.claim('F3', at(200, 64, 200))
  assert.equal(board.size(), 2)
  clock.advance(CLAIM_TTL_MS + 1)
  assert.equal(board.size(), 0, 'sweep() inside size() clears everything expired')
})

// ---------------------------------------------------------------- chooseTarget

// A map with two sand clusters: a near beach and one further away but still inside
// a trip pool (the distance gap must be smaller than the claim budget, exactly like
// real shorelines a few dozen blocks apart).
const twoClusterMap = () => {
  const map = new WorldMap()
  for (let i = 0; i < 5; i++) map.add('sand', at(100 + i, 64, 100)) // near cluster (dist ~141)
  for (let i = 0; i < 5; i++) map.add('sand', at(200 + i, 64, 60)) // far cluster (dist ~209)
  return map
}

test('chooseTarget: no board degrades to nearest-of-the-names', () => {
  const map = twoClusterMap()
  const pick = chooseTarget({ map, names: ['sand'], from: at(0, 64, 0), maxDistance: 1000 })
  assert.equal(pick.name, 'sand')
  assert.equal(pick.pos.x, 100, 'the closest cluster wins when nobody claimed anything')
  // (default maxDistance is the mapTargetFor budget - far clusters stay invisible)
  assert.equal(chooseTarget({ map, names: ['sand'], from: at(0, 64, 0) }), null)
})

test('chooseTarget: a foreign claim steers the bot to the OTHER cluster', () => {
  const map = twoClusterMap()
  const board = new ClaimBoard()
  board.claim('F1', at(100, 64, 100)) // someone is already on the near beach
  const pick = chooseTarget({ map, names: ['sand'], from: at(0, 64, 0), board, owner: 'F2', maxDistance: 1000 })
  assert.equal(pick.pos.x, 200, `the far cluster must win, got ${pick.pos}`)
  assert.equal(pick.score, pick.dist, 'the WINNER is claim-free - the penalty sat on the rejected near cluster')
})

test('chooseTarget: own claims never deter, claim-free maps pick nearest', () => {
  const map = twoClusterMap()
  const board = new ClaimBoard()
  board.claim('F1', at(100, 64, 100))
  const pick = chooseTarget({ map, names: ['sand'], from: at(0, 64, 0), board, owner: 'F1', maxDistance: 1000 })
  assert.equal(pick.pos.x, 100, 'your own claim must not push you off your own target')
})

test('chooseTarget: everything claimed still returns the best option (soft penalty)', () => {
  const map = twoClusterMap()
  const board = new ClaimBoard()
  board.claim('F1', at(100, 64, 100))
  board.claim('F3', at(200, 64, 60))
  const pick = chooseTarget({ map, names: ['sand'], from: at(0, 64, 0), board, owner: 'F2', maxDistance: 1000 })
  assert.ok(pick, 'a fully-claimed map must not produce null')
  assert.equal(pick.pos.x, 100, 'the nearer cluster still wins when both are claimed')
})

test('chooseTarget: failedTrips skip and multi-name scoring', () => {
  const map = new WorldMap()
  map.add('sand', at(50, 64, 0))
  map.add('gravel', at(80, 64, 0))
  const pick = chooseTarget({
    map, names: ['sand', 'gravel'], from: at(0, 64, 0),
    skip: pos => pos.x === 50 // the bot already failed a trip to the sand
  })
  assert.equal(pick.name, 'gravel', 'the skipped position must not be chosen')
  assert.equal(chooseTarget({ map, names: [], from: at(0, 64, 0) }), null)
  assert.equal(chooseTarget({ map: null, names: ['sand'], from: at(0, 64, 0) }), null)
})

test('chooseTarget: verifyWith drops stale entries the chunks disprove', () => {
  const map = twoClusterMap()
  const pick = chooseTarget({
    map, names: ['sand'], from: at(0, 64, 0), k: 10, maxDistance: 1000,
    verifyWith: pos => (pos.x < 200 ? null : { name: 'sand' }) // near cluster is gone
  })
  assert.equal(pick.pos.x, 200, 'stale near entries must not be chosen')
  assert.equal(map.size('sand'), 5, 'verified-away entries were removed from the map')
})

// ---------------------------------------------------------------- WorldMap.nearestK

test('nearestK: k-sorted, distance-capped and verify-pruning', () => {
  const map = new WorldMap()
  for (const [x, z] of [[10, 0], [30, 0], [20, 0], [5, 0], [100, 0]]) map.add('clay', at(x, 64, z))
  const three = map.nearestK('clay', at(0, 64, 0), { k: 3 })
  assert.deepEqual(three.map(p => p.x), [5, 10, 20], 'closest first, capped at k')
  const capped = map.nearestK('clay', at(0, 64, 0), { k: 10, maxDistance: 35 })
  assert.deepEqual(capped.map(p => p.x), [5, 10, 20, 30], 'maxDistance filters candidates')
  const stale = map.nearestK('clay', at(0, 64, 0), { k: 10, verifyWith: pos => (pos.x === 5 ? null : { name: 'clay' }) })
  assert.equal(stale.some(p => p.x === 5), false, 'the disproven entry was dropped')
  assert.equal(map.size('clay'), 4)
  assert.deepEqual(map.nearestK('nothing', at(0, 64, 0), { k: 3 }), [])
  assert.deepEqual(map.nearestK('clay', at(0, 64, 0), { k: 0 }), [])
})

// ---------------------------------------------------------------- chat transport (PVB2)

test('PVB2 codec: round trip and rejections', () => {
  const line = encodeClaimLine({ owner: 'F3', pos: at(-123, 64, 456) })
  assert.equal(line, 'PVB2|claim|F3|-123,64,456')
  const decoded = decodeClaimLine(line)
  assert.equal(decoded.owner, 'F3')
  assert.deepEqual([decoded.pos.x, decoded.pos.y, decoded.pos.z], [-123, 64, 456])
  // junk in, null out - never a partial decode
  assert.equal(decodeClaimLine(undefined), null)
  assert.equal(decodeClaimLine(''), null)
  assert.equal(decodeClaimLine('PVB1|1/1|sand@1,2,3'), null, 'PVB1 payload is not a claim')
  assert.equal(decodeClaimLine('PVB2|claim|F3|abc,64,456'), null)
  assert.equal(decodeClaimLine('PVB2|free|F3|1,2,3'), null, 'no free action on the wire')
  assert.equal(decodeClaimLine('PVB2|claim|F3|1,2,3 extra'), null)
  assert.equal(decodeClaimLine('<F3> PVB2|claim|F3|1,2,3'), null, 'chat-formatted lines are rejected')
  assert.equal(encodeClaimLine({ owner: '', pos: at(1, 2, 3) }), null)
  assert.equal(encodeClaimLine({ owner: 'F3' }), null)
  assert.equal(encodeClaimLine({ owner: 'F3', pos: at(1, 9999, 3) }), null, 'impossible heights are refused')
  assert.ok(encodeClaimLine({ owner: 'A'.repeat(16), pos: at(1, 2, 3) }).length <= 240)
})

test('attachClaimSync: end-to-end over two fake bots and one shared board', async () => {
  const makeBot = name => {
    const listeners = new Map()
    return {
      username: name,
      sent: [],
      chat (msg) { this.sent.push(msg) },
      on (ev, fn) { (listeners.get(ev) ?? listeners.set(ev, []).get(ev)).push(fn) },
      removeListener (ev, fn) {
        const l = listeners.get(ev)
        if (l) listeners.set(ev, l.filter(f => f !== fn))
      },
      emit (ev, ...args) { for (const fn of listeners.get(ev) ?? []) fn(...args) }
    }
  }

  const board = new ClaimBoard() // the SHARED board (in reality: per process)
  const f1 = makeBot('F1')
  const f2 = makeBot('F2')
  const claimsF1 = attachClaimSync(f1, board, { selfUsername: 'F1' })
  attachClaimSync(f2, board, { selfUsername: 'F2' })

  // F2 commits to a trip and broadcasts it; F1 hears it and the board updates
  assert.ok(claimsF1.broadcast(at(500, 64, 500), 'F2'))
  assert.equal(f1.sent.length, 1)
  assert.ok(f1.sent[0].startsWith('PVB2|claim|F2|'))
  f1.emit('messagestr', 'F2', f1.sent[0])
  assert.equal(board.claimedBy(at(500, 64, 500)), 'F2', 'the cross-process claim landed on the board')
  assert.equal(claimsF1.stats.applied, 1)

  // a claim scored against another bot steers chooseTarget - the whole point
  const map = twoClusterMap()
  const pick = chooseTarget({ map, names: ['sand'], from: at(0, 64, 0), board, owner: 'F1', maxDistance: 1000 })
  assert.equal(pick.pos.x, 100, 'a far claim outside both clusters leaves the nearest cluster winning')

  // own lines and foreign garbage are ignored; the listener is removable
  const before = board.size()
  f1.emit('messagestr', 'F1', 'PVB2|claim|F1|1,2,3') // own echo
  f1.emit('messagestr', 'Griefer', '<Griefer> hello PVB2 world')
  f1.emit('chat', 'F9', 'PVB2|claim|F9|1,2,3') // the dual-listener path (chat event)
  assert.equal(board.size(), before + 1, 'the chat-event claim applied exactly once (idempotent key)')
  claimsF1.stop()
  f1.emit('messagestr', 'F2', 'PVB2|claim|F2|777,64,777')
  assert.equal(board.claimedBy(at(777, 64, 777)), null, 'after stop() foreign claims are no longer heard')
})

test('fleet constants stay sane (claim budget vs trip cadence)', () => {
  assert.ok(CLAIM_TTL_MS >= 90_000, 'a claim must outlive walk + harvest')
  assert.ok(CLAIM_PENALTY >= 64, 'the penalty must exceed a typical hop so a claimed cluster loses')
  assert.ok(CLAIM_RADIUS >= 16 && CLAIM_RADIUS <= 64, 'the bubble must cover a cluster, not the horizon')
})
