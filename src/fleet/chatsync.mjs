// Fleet resource-map sync over vanilla chat.
//
// Why chat: the fleet runs as separate OS processes (fleet19 spawns bots that only share
// the server), and a vanilla survival server offers exactly one bot-to-bot channel - the
// chat. A scout flying over the world and a miner on the ground can therefore share what
// they know by sending short, compact messages that both sides parse.
//
// Protocol "PVB1" (PrivateB broadcast v1), fits the 256-char chat limit:
//
//   PVB1|<i>/<n>|<name>@<x>,<y>,<z>;<name>@<x>,<y>,<z>;...
//
//   * "PVB1|i/n" header: i-th chunk of n (a scan can find more than fits in one message)
//   * every payload entry is name@x,y,z (ints, relative to the chunk base when compacted)
//   * everything else any player says is simply ignored by the parser
//
// The pure parts (encode / decode / merge) live here and are unit-tested without a server.
import { Vec3 } from 'vec3'

export const PROTOCOL_TAG = 'PVB1'
export const MAX_CHAT_LENGTH = 240 // vanilla hard limit is 256 - stay safely below

// ---------------------------------------------------------------- pure codec

// Encode a list of {name, x, y, z} positions into 1..n chat-safe chunks.
// Long block names eat the budget, so entries that do not fit are carried into the
// next chunk instead of being truncated (a truncated name would decode into garbage).
export function encodeSyncPayload (entries, { maxChunk = MAX_CHAT_LENGTH } = {}) {
  const chunks = []
  let current = []
  const fits = list => {
    const body = list.map(e => `${e.name}@${Math.round(e.x)},${Math.round(e.y)},${Math.round(e.z)}`).join(';')
    // header length depends on the FINAL chunk count, which we do not know yet - reserve
    // the worst case "PVB1|xxx/xxx|" (15 chars) so a growing index can never overflow
    return `${PROTOCOL_TAG}|0/000|${body}`.length <= maxChunk
  }
  for (const e of entries) {
    if (e == null || typeof e.name !== 'string' || !e.name) continue
    if (current.length && !fits([...current, e])) {
      chunks.push(current)
      current = []
    }
    current.push(e)
  }
  if (current.length) chunks.push(current)
  if (!chunks.length) return []
  return chunks.map((list, i) =>
    `${PROTOCOL_TAG}|${i + 1}/${chunks.length}|${list.map(e => `${e.name}@${Math.round(e.x)},${Math.round(e.y)},${Math.round(e.z)}`).join(';')}`
  )
}

// Parse one chat line. Returns an array of {name, x, y, z} for valid PVB1 chunks
// (empty array for every line that is not ours - other players, server messages, ...).
export function decodeSyncPayload (text) {
  if (typeof text !== 'string') return []
  const s = text.trim()
  if (!s.startsWith(`${PROTOCOL_TAG}|`)) return []
  const headerEnd = s.indexOf('|', PROTOCOL_TAG.length + 1)
  if (headerEnd < 0) return []
  const header = s.slice(PROTOCOL_TAG.length + 1, headerEnd)
  const m = /^(\d+)\/(\d+)$/.exec(header)
  if (!m) return []
  const i = Number(m[1]); const n = Number(m[2])
  if (!Number.isInteger(i) || !Number.isInteger(n) || i < 1 || n < 1 || i > n || n > 999) return []
  const out = []
  for (const part of s.slice(headerEnd + 1).split(';')) {
    const em = /^([\w:]+)@(-?\d+),(-?\d+),(-?\d+)$/.exec(part.trim())
    if (!em) continue
    const [, name, xs, ys, zs] = em
    const x = Number(xs); const y = Number(ys); const z = Number(zs)
    if (![x, y, z].every(Number.isFinite)) continue
    out.push({ name: name.replace(/^minecraft:/, ''), x, y, z, chunk: i, chunks: n })
  }
  return out
}

// Merge decoded entries into a WorldMap-like object (anything with .add()).
// Returns how many positions were actually new. Out-of-range coordinates (a corrupted
// or hostile message) are rejected - the world border is 30 million blocks.
export function mergeIntoMap (map, entries, { limit = 30_000_000 } = {}) {
  let added = 0
  for (const e of entries ?? []) {
    const { name, x, y, z } = e
    if (!name || ![x, y, z].every(v => Math.abs(v) <= limit) || y < -2048 || y > 2048) continue
    const before = map.size ? map.size(name) : null
    map.add(name, new Vec3(x, y, z))
    // WorldMap.add dedupes by key; the optional size() probe tells us whether it was new
    if (before != null && map.size(name) > before) added++
    else if (before == null) added++ // no probe available: assume every entry counts
  }
  return added
}

// ---------------------------------------------------------------- live bot wiring

/**
 * Attach chat-based map sync to a bot.
 *   const sync = attachChatSync(bot, map, { targets })
 *   sync.enqueue('sand', bot.entity.position)   // record + queue for broadcast
 *   sync.flush()                                // send queued entries now
 * Incoming PVB1 messages from OTHER bots are merged into `map` automatically.
 * The flush timer and the chat listener are removed by sync.stop().
 */
export function attachChatSync (bot, map, {
  flushEveryMs = 4000,
  maxPerFlush = 40,
  selfFilter = true,
  log = () => {}
} = {}) {
  const outgoing = [] // entries waiting to be broadcast
  const seenChunks = new Map() // "i/n:sender" -> expiry, stops re-processing repeats
  const stats = { sent: 0, received: 0, merged: 0, flushes: 0, dropped: 0 }

  const enqueue = (name, pos, meta = null) => {
    if (!name || !pos) return false
    if (outgoing.length >= 4000) { stats.dropped++; return false } // never grow unbounded
    outgoing.push({ name, x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z), meta })
    return true
  }

  const flush = () => {
    if (!outgoing.length || !bot.entity) return 0
    const batch = outgoing.splice(0, maxPerFlush)
    const messages = encodeSyncPayload(batch)
    for (const msg of messages) {
      try { bot.chat(msg); stats.sent++ } catch (e) { log(`chat send failed: ${e.message}`) }
    }
    stats.flushes++
    return messages.length
  }

  const timer = setInterval(() => { try { flush() } catch { /* keep the ticker alive */ } }, flushEveryMs)
  timer.unref?.()

  const onMessage = (username, message) => {
    try {
      const text = typeof message === 'string' ? message : (message?.text ?? message?.toString?.() ?? '')
      if (selfFilter && username === bot.username) return
      const entries = decodeSyncPayload(text)
      if (!entries.length) return
      // dedupe by CONTENT, not by chunk index: every flush restarts at "1/n", so an
      // index-based key would drop every fresh payload after the first one. The exact
      // text (plus sender) is the honest repeat-detection key.
      const key = `${username}:${text}`
      if (Date.now() < (seenChunks.get(key) ?? 0)) return
      seenChunks.set(key, Date.now() + 60_000)
      if (seenChunks.size > 500) {
        for (const [k, until] of seenChunks) if (until < Date.now()) seenChunks.delete(k)
      }
      stats.received += entries.length
      stats.merged += mergeIntoMap(map, entries)
    } catch { /* a hostile chat line must never kill the bot */ }
  }
  bot.on('messagestr', onMessage)
  // mineflayer's messagestr delivers (username, message); some stacks emit (message) only
  bot.on('chat', (username, message) => onMessage(username, message))

  const stop = () => {
    clearInterval(timer)
    bot.removeListener('messagestr', onMessage)
    bot.removeListener('chat', onMessage)
  }

  return { enqueue, flush, stop, stats, get pending () { return outgoing.length } }
}
