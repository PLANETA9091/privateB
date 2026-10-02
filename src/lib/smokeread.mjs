//
// smokeread.mjs - THE SMOKE VERDICT (v0.505.0)
// CI's own fleet, read. Every push's integration job runs a 2-bot smoke
// fleet (tests/integration/productivity.test.mjs, bots ProdTestN) against
// a real vanilla 26.2 server and uploads it as the `fleet-logs` artifact
// (retention 5 days) - during the dispatch stall (faces 42..44, the
// big-fleet job starved in the queue) this smoke run was the ONLY fleet
// data CI delivered, and not one line of it had a reader: maptrip.mjs's
// worldmap tail is the long skin (`worldmap: N positions, M chunks
// scanned, top: ...` - fleet19.mjs's), the smoke's short tail
// (`worldmap: N positions, M chunks`) never matched it; the craft lane's
// recovery anatomy (grid recoveries, ghost sweeps, the storm's smoke
// skins, the starved read, the self-heal miss) was unread anywhere.
//
// THE LENS (append-only census, zero fleet changes, one parser per
// shape): the smoke log interleaves two bot processes through one
// writer, so the attribution law splits the book in two tiers:
//
//   NAMED lines   - the bot speaks its own name (`ProdTest1 spawned at`,
//                   `ProdTest2 tools attempt 0: fail (...)`,
//                   `[ProdTest1] disconnected (...)`,
//                   `[ProdTest1] digShaft: giving up ...`,
//                   `[ProdTest2] plank rung: ...`,
//                   `[ProdTest1] flight disabled - ground mode`,
//                   `[ProdTest1] rage fastbreak installed`,
//                   `[ProdTest2] sapling planted: ...`) -> per-bot books;
//
//   LANE lines    - the craft lane speaks fleet-wide through the shared
//                   `[tools]` prefix (`[tools] closing stale craft
//                   window`, `[tools] craft stick: swept N ghost grid
//                   slot(s)`, `[tools] craft storm: ...`, `[tools] craft
//                   X: storm cooldown ... - refusing`, `[tools] sticks
//                   starved after the re-read`, `[tools] self-heal: ...`)
//                   -> counted, NEVER attributed (the interleaving makes
//                   per-bot attribution impossible textually - the
//                   honest lib keeps the tiers apart).
//
// THE SHAPE OWNERSHIP: the storm refusal's big-fleet skin
// (`F13 [tools] craft stick: storm cooldown ...`) is memhb.mjs's
// (parseStormCooldown, three-skin aware); the smoke skin
// (`[tools] craft stick: storm cooldown ...`) carries no F-name prefix
// and is owned HERE - the split is pinned by test. The worldmap short
// tail is owned here; maptrip.mjs keeps the long tail. The torch lane's
// economics (craft torches: skip/...) belong to torchbook.mjs and the
// commons ledger - this lib does not re-read them.
//
// THE JOIN (the single-fail rule): the storm lines cannot name their
// bot, so a storm->attempt-fail link is only honest under
// unambiguity: exactly ONE failed tools attempt run-wide AND >= 1
// storm declaration -> stormLinkedFails = 1; one fail and zero storms
// -> false (nothing to blame); ANY other shape -> null (unknowable,
// not false - the lib refuses to guess through interleaving).
//
// THE GRADE (smokeGrade): the smoke test PASSES on exit code, but the
// pass hides the bleed - ProdTest2's face-44 attempt 0 died on the
// craft storm and the ladder self-healed on attempt 1, all inside a
// green run. Three classes:
//   hurt      - RESULT failed > 0, or the mining phase came up short
//               (alive < total), or any bot quit dirty (a disconnect
//               reason other than disconnect.quitting), or a spawned
//               bot never quit at all (absent - the process died
//               silently);
//   annotated - not hurt, but the craft lane bled (attempt fails,
//               variant fails, exhausted variants, storm declarations,
//               refusals, grid recoveries, ghost sweeps, starved
//               reads, self-heal misses, short plank rungs);
//   clean     - nothing to say (the run the smoke dreams of).
// Face 44's read: NOT hurt (mined 185 / failed 0, alive 2/2, both bots
// quit disconnect.quitting) but ANNOTATED - one storm, one refusal,
// six grid recoveries, three variant fails, one starved read, one
// self-heal miss, one short plank rung: the storm ledger's
// transient/terminal split (v0.478.0) visible in CI's own smoke.
//
// Junk-safe: non-arrays, non-strings, truncated lines, non-JSON
// byName, unknown prefixes - all read as nothing, never a throw.

const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /

// strip the CI writer's ISO timestamp (the smoke artifact's skin); the
// bare skin (hand-fed tests) passes through untouched
export function stripSmokeTs (line) {
  if (typeof line !== 'string') return line
  return line.replace(TS_RE, '')
}

const SPAWN_RE = /^(\S+) spawned at \((-?\d+), (-?\d+), (-?\d+)\)$/
const GROUND_RE = /^\[(\S+)\] flight disabled - ground mode/
const FASTBREAK_RE = /^\[(\S+)\] rage fastbreak installed/
const ATTEMPT_RE = /^(\S+) tools attempt (\d+): (ok|fail) \(([^)]*)\)$/
const QUIT_RE = /^\[(\S+)\] disconnected \(([^)]+)\)$/
const ROTATE_RE = /^\[(\S+)\] digShaft: giving up this shaft \((\d+) sidesteps, undiggable floor\) - the caller rotates$/
const PLANK_RUNG_RE = /^\[(\S+)\] plank rung: (converted|fell short) (\d+)->(\d+) same-type planks \(need (\d+), from (\S+)\)$/
const SAPLING_RE = /^\[(\S+)\] sapling planted: (\S+) at \((-?\d+), (-?\d+), (-?\d+)\) \((ok|fail)\)$/

const GRID_RE = /^\[tools\] (?:\[tools\] )?closing stale craft window \(([^)]+)\) - grid recovery$/
const GHOST_RE = /^\[tools\] craft (\S+): swept (\d+) ghost grid slot\(s\) back into the inventory$/
const VARIANT_FAIL_RE = /^\[tools\] craft (\S+): variant#(\d+) attempt(\d+) failed: (.+)$/
const EXHAUSTED_RE = /^\[tools\] craft (\S+): all (\d+) variant\(s\) failed, last: (.+)$/
const STORM_DECL_RE = /^\[tools\] craft storm: (\d+) consecutive craft timeouts - cooldown (\d+)ms \(server stall\?\)$/
// the SMOKE refusal skin - owned here (memhb.mjs's parseStormCooldown owns
// the big-fleet `F\d+ [tools] ...` skin; this one carries no F-name, the
// split is pinned by test)
export const SMOKE_STORM_REFUSAL_RE = /^\[tools\] craft (\S+): storm cooldown (\d+)ms left \((\d+) consecutive timeouts\) - refusing$/
const STARVED_RE = /^\[tools\] sticks starved after the re-read \((\d+)\/4 held, planks-best (\d+)\)$/
const SELFHEAL_RE = /^\[tools\] self-heal: table (placed|STILL missing)$/
const FINAL_TOOLS_RE = /^\[tools\] final: (.+)$/

const MINING_PHASE_RE = /^mining phase: alive=(\d+)\/(\d+) window=(\d+)s pick=(\d+)$/
const WINDOW_TICK_RE = /^window: \+(\d+) blocks \(total (\d+)\)$/
const RESULT_RE = /^RESULT: mined=(\d+) failed=(\d+) byName=(\{.*\})$/
const WORLDMAP_SHORT_RE = /^worldmap: (\d+) positions, (\d+) chunks$/

export function parseSmokeLine (line) {
  if (typeof line !== 'string') return null
  const s = stripSmokeTs(line).trim()
  if (!s) return null
  let m
  if ((m = SPAWN_RE.exec(s))) return { kind: 'spawn', bot: m[1], x: +m[2], y: +m[3], z: +m[4] }
  if ((m = GROUND_RE.exec(s))) return { kind: 'groundMode', bot: m[1] }
  if ((m = FASTBREAK_RE.exec(s))) return { kind: 'fastbreak', bot: m[1] }
  if ((m = ATTEMPT_RE.exec(s))) return { kind: 'attempt', bot: m[1], attempt: +m[2], ok: m[3] === 'ok', kit: m[4] }
  if ((m = QUIT_RE.exec(s))) return { kind: 'quit', bot: m[1], reason: m[2], clean: m[2] === 'disconnect.quitting' }
  if ((m = ROTATE_RE.exec(s))) return { kind: 'rotate', bot: m[1], sidesteps: +m[2] }
  if ((m = PLANK_RUNG_RE.exec(s))) {
    return { kind: 'plankRung', bot: m[1], ok: m[2] === 'converted', before: +m[3], after: +m[4], need: +m[5], from: m[6] }
  }
  if ((m = SAPLING_RE.exec(s))) {
    return { kind: 'sapling', bot: m[1], sapling: m[2], x: +m[3], y: +m[4], z: +m[5], ok: m[6] === 'ok' }
  }
  if ((m = GRID_RE.exec(s))) return { kind: 'gridRecovery', windowType: m[1] }
  if ((m = GHOST_RE.exec(s))) return { kind: 'ghostSweep', item: m[1], slots: +m[2] }
  if ((m = VARIANT_FAIL_RE.exec(s))) return { kind: 'variantFail', item: m[1], variant: +m[2], attempt: +m[3], lastError: m[4] }
  if ((m = EXHAUSTED_RE.exec(s))) return { kind: 'variantExhausted', item: m[1], variants: +m[2], lastError: m[3] }
  if ((m = STORM_DECL_RE.exec(s))) return { kind: 'stormDeclared', timeouts: +m[1], cooldownMs: +m[2] }
  if ((m = SMOKE_STORM_REFUSAL_RE.exec(s))) return { kind: 'stormRefusal', item: m[1], cooldownMs: +m[2], timeouts: +m[3] }
  if ((m = STARVED_RE.exec(s))) return { kind: 'starvedRead', held: +m[1], planksBest: +m[2] }
  if ((m = SELFHEAL_RE.exec(s))) return { kind: 'selfHeal', ok: m[1] === 'placed' }
  if ((m = FINAL_TOOLS_RE.exec(s))) return { kind: 'finalTools', tools: m[1].split(', ').filter(Boolean) }
  if ((m = MINING_PHASE_RE.exec(s))) return { kind: 'miningPhase', alive: +m[1], total: +m[2], windowS: +m[3], picks: +m[4] }
  if ((m = WINDOW_TICK_RE.exec(s))) return { kind: 'windowTick', delta: +m[1], total: +m[2] }
  if ((m = RESULT_RE.exec(s))) {
    let byName = {}
    try { byName = JSON.parse(m[3]) } catch { /* the truth stays zeroed */ }
    return { kind: 'result', mined: +m[1], failed: +m[2], byName }
  }
  if ((m = WORLDMAP_SHORT_RE.exec(s))) return { kind: 'worldmap', positions: +m[1], chunks: +m[2] }
  return null
}

const zeroBot = () => ({
  spawned: false,
  spawn: null,
  groundMode: false,
  fastbreak: false,
  attempts: [],
  attemptFails: 0,
  rotations: 0,
  rotationSidesteps: 0,
  plankRungShort: 0,
  plankRungOk: 0,
  saplings: 0,
  saplingFails: 0,
  quit: null // { reason, clean } | null = absent
})

const zeroLane = () => ({
  gridRecoveries: 0,
  gridWindowTypes: {},
  ghostSweeps: 0,
  ghostSlots: 0,
  variantFails: 0,
  variantExhausted: 0,
  stormDeclarations: 0,
  stormRefusals: 0,
  starvedReads: 0,
  selfHealMisses: 0,
  selfHealOk: 0,
  finalToolLines: 0
})

export function parseSmokeLog (lines) {
  if (!Array.isArray(lines)) return null
  const bots = {}
  const lane = zeroLane()
  const run = {
    miningPhase: null, // { alive, total, windowS, picks }
    windowTicks: [], // { delta, total }
    result: null, // { mined, failed, byName }
    worldmap: null // { positions, chunks } - the SHORT tail
  }
  for (const raw of lines) {
    const ev = parseSmokeLine(raw)
    if (!ev) continue
    if (ev.kind === 'spawn') {
      const b = bots[ev.bot] || (bots[ev.bot] = zeroBot())
      b.spawned = true
      b.spawn = { x: ev.x, y: ev.y, z: ev.z }
    } else if (ev.kind === 'groundMode') {
      (bots[ev.bot] || (bots[ev.bot] = zeroBot())).groundMode = true
    } else if (ev.kind === 'fastbreak') {
      (bots[ev.bot] || (bots[ev.bot] = zeroBot())).fastbreak = true
    } else if (ev.kind === 'attempt') {
      const b = bots[ev.bot] || (bots[ev.bot] = zeroBot())
      b.attempts.push({ attempt: ev.attempt, ok: ev.ok, kit: ev.kit })
      if (!ev.ok) b.attemptFails++
    } else if (ev.kind === 'quit') {
      (bots[ev.bot] || (bots[ev.bot] = zeroBot())).quit = { reason: ev.reason, clean: ev.clean }
    } else if (ev.kind === 'rotate') {
      const b = bots[ev.bot] || (bots[ev.bot] = zeroBot())
      b.rotations++
      b.rotationSidesteps += ev.sidesteps
    } else if (ev.kind === 'plankRung') {
      const b = bots[ev.bot] || (bots[ev.bot] = zeroBot())
      if (ev.ok) b.plankRungOk++
      else b.plankRungShort++
    } else if (ev.kind === 'sapling') {
      const b = bots[ev.bot] || (bots[ev.bot] = zeroBot())
      if (ev.ok) b.saplings++
      else b.saplingFails++
    } else if (ev.kind === 'gridRecovery') {
      lane.gridRecoveries++
      lane.gridWindowTypes[ev.windowType] = (lane.gridWindowTypes[ev.windowType] ?? 0) + 1
    } else if (ev.kind === 'ghostSweep') {
      lane.ghostSweeps++
      lane.ghostSlots += ev.slots
    } else if (ev.kind === 'variantFail') {
      lane.variantFails++
    } else if (ev.kind === 'variantExhausted') {
      lane.variantExhausted++
    } else if (ev.kind === 'stormDeclared') {
      lane.stormDeclarations++
    } else if (ev.kind === 'stormRefusal') {
      lane.stormRefusals++
    } else if (ev.kind === 'starvedRead') {
      lane.starvedReads++
    } else if (ev.kind === 'selfHeal') {
      if (ev.ok) lane.selfHealOk++
      else lane.selfHealMisses++
    } else if (ev.kind === 'finalTools') {
      lane.finalToolLines++
    } else if (ev.kind === 'miningPhase') {
      run.miningPhase = { alive: ev.alive, total: ev.total, windowS: ev.windowS, picks: ev.picks }
    } else if (ev.kind === 'windowTick') {
      run.windowTicks.push({ delta: ev.delta, total: ev.total })
    } else if (ev.kind === 'result') {
      run.result = { mined: ev.mined, failed: ev.failed, byName: ev.byName }
    } else if (ev.kind === 'worldmap') {
      run.worldmap = { positions: ev.positions, chunks: ev.chunks }
    }
  }
  return { bots, lane, run }
}

// THE JOIN - the single-fail rule (see header). Returns:
//   true  - exactly one failed attempt run-wide and >= 1 storm declared
//   false - exactly one failed attempt and zero storms (nothing to blame)
//   null  - any other shape (the interleaving refuses to be guessed through)
export function stormFailLink (read) {
  if (!read) return null
  const fails = Object.values(read.bots).reduce((n, b) => n + b.attemptFails, 0)
  if (fails === 1 && read.lane.stormDeclarations >= 1) return true
  if (fails === 1 && read.lane.stormDeclarations === 0) return false
  return null
}

// THE GRADE - hurt / annotated / clean (see header for the classes)
export function smokeGrade (read) {
  if (!read) return null
  const botList = Object.values(read.bots)
  if (read.run.result && read.run.result.failed > 0) return 'hurt'
  const mp = read.run.miningPhase
  if (mp && mp.alive < mp.total) return 'hurt'
  for (const b of botList) {
    if (b.spawned && !b.quit) return 'hurt' // the absent bot - died silently
    if (b.quit && !b.quit.clean) return 'hurt'
  }
  const laneBleeds = read.lane.gridRecoveries > 0 || read.lane.ghostSweeps > 0 ||
    read.lane.variantFails > 0 || read.lane.variantExhausted > 0 ||
    read.lane.stormDeclarations > 0 || read.lane.stormRefusals > 0 ||
    read.lane.starvedReads > 0 || read.lane.selfHealMisses > 0
  const botBleeds = botList.some(b => b.attemptFails > 0 || b.plankRungShort > 0)
  return (laneBleeds || botBleeds) ? 'annotated' : 'clean'
}

// the one-call read: parse + join + grade (the verdict line's own book)
export function smokeVerdict (lines) {
  const read = parseSmokeLog(lines)
  if (!read) return null
  return {
    bots: read.bots,
    lane: read.lane,
    run: read.run,
    stormLinkedFails: stormFailLink(read),
    grade: smokeGrade(read)
  }
}
