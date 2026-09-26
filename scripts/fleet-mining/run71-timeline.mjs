#!/usr/bin/env node
// Timeline analysis for run71 (fleet 36217424471, the v0.202.0 re-loot walk's debut):
// place every death / respawn marker / reloot line on the heartbeat ts= grid,
// then answer WHY 12 deaths produced only 2 re-loot evaluations.
import { readFileSync } from 'node:fs'

const log = readFileSync('/home/z/privateB/scripts/fleet-mining/run71/xfleet19-log/fleet19.log', 'utf8').split('\n')

// 1) build the heartbeat grid: lines like "... n=41 ts=821s ..." carry the fleet clock
const grid = []
for (const line of log) {
  const m = line.match(/n=(\d+) ts=(\d+)s/)
  if (m) grid.push({ n: +m[1], ts: +m[2] })
}
const lastTs = grid.length ? grid[grid.length - 1].ts : null
console.log(`heartbeat grid: ${grid.length} beats, last ts=${lastTs}s (${(lastTs / 60).toFixed(1)} min)`)

// 2) find the index of each heartbeat line in the log, so any event line's
//    position can be interpolated between surrounding heartbeats
const hbIdx = []
log.forEach((line, i) => {
  const m = line.match(/n=(\d+) ts=(\d+)s/)
  if (m) hbIdx.push({ i, n: +m[1], ts: +m[2] })
})

function tsAt (idx) {
  // interpolate the fleet clock at log line index idx
  let prev = null
  for (const h of hbIdx) {
    if (h.i >= idx) {
      if (!prev) return { ts: h.ts, exact: 'next-beat' }
      const frac = (idx - prev.i) / (h.i - prev.i)
      return { ts: Math.round(prev.ts + frac * (h.ts - prev.ts)), exact: 'interp' }
    }
    prev = h
  }
  return prev ? { ts: prev.ts, exact: 'last-beat' } : { ts: null, exact: 'none' }
}

// 3) the events
const events = []
log.forEach((line, i) => {
  let m
  if ((m = line.match(/^(\S+) \[\S+\] died - respawning/))) {
    events.push({ kind: 'DEATH', bot: m[1], i, line })
  } else if (line.includes('reloot:')) {
    const bot = line.slice(0, line.indexOf(' '))
    events.push({ kind: 'RELOOT', bot, i, line })
  } else if ((m = line.match(/^(\S+) \[\S+\] respawned/))) {
    events.push({ kind: 'RESPAWN', bot: m[1], i, line })
  } else if ((m = line.match(/reconnect/))) {
    const bot = line.slice(0, line.indexOf(' '))
    events.push({ kind: 'RECONNECT', bot, i, line: line.slice(0, 110) })
  }
})

// 4) print the interleaved timeline (deaths + reloots + respawns, reconnects compressed)
console.log('\n--- DEATH/RELOOT timeline (fleet-clock seconds) ---')
for (const e of events) {
  if (e.kind === 'RECONNECT') continue
  const { ts } = tsAt(e.i)
  const tail = e.kind === 'RELOOT' ? e.line.slice(0, 130) : (e.kind === 'DEATH' ? `${e.bot} died` : `${e.bot} respawned`)
  console.log(`t=${String(ts).padStart(4)}s [${e.kind.padEnd(7)}] ${tail}`)
}
const rc = events.filter(e => e.kind === 'RECONNECT')
console.log(`\nreconnects: ${rc.length} total`)
const rcByBot = {}
for (const e of rc) rcByBot[e.bot] = (rcByBot[e.bot] || 0) + 1
console.log('by bot:', JSON.stringify(rcByBot))

// 5) deaths in the last 120s of the run (no loop pass expected after them)
const late = events.filter(e => e.kind === 'DEATH' && tsAt(e.i).ts !== null && lastTs - tsAt(e.i).ts < 120)
console.log(`\ndeaths in the final 120s: ${late.length} -> ${late.map(e => `${e.bot}@${tsAt(e.i).ts}s`).join(', ')}`)
