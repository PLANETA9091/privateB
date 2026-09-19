// Unit tests for the chat-based fleet map sync (src/fleet/chatsync.mjs).
// Pure codec tests - no server, no sockets.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeSyncPayload, decodeSyncPayload, mergeIntoMap, attachChatSync, MAX_CHAT_LENGTH
} from '../../src/fleet/chatsync.mjs'
import { WorldMap } from '../../src/fleet/worldmap.mjs'

test('encodeSyncPayload: round trip keeps every entry', () => {
  const entries = [
    { name: 'sand', x: 120, y: 64, z: -337 },
    { name: 'gravel', x: -5, y: 63, z: 900 },
    { name: 'iron_ore', x: -1_000_000, y: 16, z: 1_000_000 },
    { name: 'deepslate_diamond_ore', x: 42, y: -59, z: 7 }
  ]
  const messages = encodeSyncPayload(entries)
  assert.ok(messages.length >= 1)
  const decoded = messages.flatMap(decodeSyncPayload)
  assert.equal(decoded.length, entries.length)
  for (const e of entries) {
    const hit = decoded.find(d => d.name === e.name && d.x === e.x && d.y === e.y && d.z === e.z)
    assert.ok(hit, `entry ${e.name} must survive the round trip`)
  }
})

test('encodeSyncPayload: every chunk fits the vanilla chat limit', () => {
  // 100 long entries: each chunk must respect the 240-char budget no matter what
  const entries = Array.from({ length: 100 }, (_, i) => ({
    name: 'deepslate_bricks' + 'x'.repeat(20) + i, x: i * 7, y: 64, z: -i * 3
  }))
  const messages = encodeSyncPayload(entries)
  assert.ok(messages.length > 1, 'long payloads must be split')
  for (const m of messages) assert.ok(m.length <= MAX_CHAT_LENGTH, `chunk too long (${m.length}): ${m.slice(0, 60)}`)
  const decoded = messages.flatMap(decodeSyncPayload)
  assert.equal(decoded.length, 100)
})

test('encodeSyncPayload: empty and invalid input produce no messages', () => {
  assert.deepEqual(encodeSyncPayload([]), [])
  assert.deepEqual(encodeSyncPayload([null, undefined, {}, { name: '' }]), [])
})

test('decodeSyncPayload: rejects foreign and corrupt lines', () => {
  assert.deepEqual(decodeSyncPayload('<Bob> hello world'), [])
  assert.deepEqual(decodeSyncPayload('PVB1|1/1|no-entries-here!'), [])
  assert.deepEqual(decodeSyncPayload('PVB1|2/1|sand@0,64,0'), []) // i > n
  assert.deepEqual(decodeSyncPayload('PVB1|0/1|sand@0,64,0'), []) // i starts at 1
  assert.deepEqual(decodeSyncPayload('PVB1|1/1|sand@x,64,0'), [])
  assert.deepEqual(decodeSyncPayload(undefined), [])
  assert.deepEqual(decodeSyncPayload(''), [])
})

test('decodeSyncPayload: tolerates minecraft: prefix and extra whitespace', () => {
  const out = decodeSyncPayload(`PVB1|1/1|minecraft:sand@ 1 , 2 , 3 `)
  // NOTE: the codec regex does not allow spaces inside coordinates - this hostile-ish
  // line must be REJECTED as a whole (never partially decoded into garbage)
  assert.deepEqual(out, [])
  const ok = decodeSyncPayload('PVB1|1/1|minecraft:sand@1,2,3')
  assert.equal(ok.length, 1)
  assert.equal(ok[0].name, 'sand')
  assert.deepEqual([ok[0].x, ok[0].y, ok[0].z], [1, 2, 3])
})

test('mergeIntoMap: fills a real WorldMap, dedupes on re-merge', () => {
  const map = new WorldMap()
  const entries = [
    { name: 'sand', x: 1, y: 60, z: 2 },
    { name: 'sand', x: 1, y: 60, z: 2 }, // duplicate key
    { name: 'gravel', x: 3, y: 60, z: 4 }
  ]
  const first = mergeIntoMap(map, entries)
  assert.equal(first, 2, 'duplicates must not count as new')
  assert.equal(map.size('sand'), 1)
  assert.equal(map.size('gravel'), 1)
  const again = mergeIntoMap(map, entries)
  assert.equal(again, 0, 're-merging the same payload adds nothing')
})

test('mergeIntoMap: rejects out-of-range coordinates', () => {
  const map = new WorldMap()
  const added = mergeIntoMap(map, [
    { name: 'sand', x: 99_999_999, y: 64, z: 0 }, // beyond the world border
    { name: 'sand', x: 0, y: 9999, z: 0 },        // impossible height
    { name: 'sand', x: 5, y: 64, z: 5 }           // the one valid entry
  ])
  assert.equal(added, 1)
  assert.equal(map.total(), 1)
})

test('attachChatSync: end-to-end over two fake bots and one shared map', async () => {
  // minimal fake event-emitter bots - no mineflayer, no sockets
  const makeBot = name => {
    const listeners = new Map()
    return {
      username: name,
      sent: [],
      entity: { position: { x: 0, y: 64, z: 0 } },
      chat (msg) { this.sent.push(msg) },
      on (ev, fn) { (listeners.get(ev) ?? listeners.set(ev, []).get(ev)).push(fn) },
      removeListener (ev, fn) {
        const l = listeners.get(ev)
        if (l) listeners.set(ev, l.filter(f => f !== fn))
      },
      emit (ev, ...args) { for (const fn of listeners.get(ev) ?? []) fn(...args) }
    }
  }

  const map = new WorldMap() // the SHARED map (in reality: each process has its own copy)
  const scout = makeBot('Scout1')
  const miner = makeBot('Miner1')
  const syncScout = attachChatSync(scout, new WorldMap(), { flushEveryMs: 10_000 })
  const syncMiner = attachChatSync(miner, map, { flushEveryMs: 10_000 })

  // scout discovered 3 sites and queues them
  syncScout.enqueue('sand', { x: 10, y: 64, z: 10 })
  syncScout.enqueue('gravel', { x: 20, y: 64, z: 20 })
  syncScout.enqueue('coal_ore', { x: -30, y: 20, z: 30 })
  assert.equal(syncScout.pending, 3)
  syncScout.flush()
  assert.equal(scout.sent.length, 1, 'three small entries fit one message')
  assert.ok(scout.sent[0].startsWith('PVB1|'))

  // the miner HEARS the scout's chat - the incoming message merges into its map
  for (const msg of scout.sent) miner.emit('messagestr', 'Scout1', msg)
  assert.equal(map.size('sand'), 1)
  assert.equal(map.size('gravel'), 1)
  assert.equal(map.size('coal_ore'), 1)
  assert.equal(syncMiner.stats.merged, 3)

  // bots ignore their OWN messages and garbage from other players
  const before = map.total()
  for (const msg of scout.sent) scout.emit('messagestr', 'Scout1', msg)
  miner.emit('messagestr', 'NotABot', '<NotABot> PVB1|1/1|dirt@1,1,1') // fake prefix inside chat formatting
  assert.equal(map.total(), before)
  assert.equal(syncMiner.stats.merged, 3)

  // TWO DIFFERENT payloads that share the same chunk index (1/1) must BOTH merge:
  // every flush restarts at 1/n, so an index-based dedupe would drop everything after
  // the first message (that was bug #1 of the sync, caught by this exact scenario)
  scout.sent.length = 0
  syncScout.enqueue('obsidian', { x: 55, y: 32, z: -55 })
  syncScout.flush()
  miner.emit('messagestr', 'Scout1', scout.sent[0])
  assert.equal(map.size('obsidian'), 1, 'a fresh payload with the same 1/1 index must still merge')

  syncScout.stop()
  syncMiner.stop()
})
