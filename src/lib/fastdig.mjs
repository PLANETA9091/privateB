// Rage FastBreak for mineflayer bots - the blatant version, no legit fallback.
//
// Wurst's FastBreakHack (legitMode = false) sends an extra STOP_DESTROY_BLOCK packet on
// every block-breaking-progress tick, because servers that trust the client's claim break
// the block immediately. We do the same: START_DESTROY_BLOCK, then spam STOP_DESTROY_BLOCK
// every tick until the world says the block is gone. Client-side destroy delay is 0.

// ---------------------------------------------------------------------------
// (v0.75.0) THE OVERHEAD FACE - a dig packet's face must be geometrically
// possible, or the block never breaks.
//
// MEASURED (fleet 35715109688, master 0f06bf5, 19 bots x 600s - the run that
// FINALLY banked 74, then lost 10+ bots to the shaft): every single one of
// the 94 'dig failed at [x,y,z] stone' climb refusals names the SAME cell
// class - the ceiling block at feet+2, dug first by stepDigPlan's top-down
// order and bearing-independent ('blocked toward 1,0 / 0,1 / -1,0 / 0,-1'
// all printing ONE cell, F3's [-111,44,421] refusing the whole run across
// every climb attempt, escalated fences included). These bots HELD PICKAXES
// (F3 a stone pickaxe since the first minute) - 12-46-tick digs failing a
// 200-tick patient window is not timing, the dig never STARTS. The one
// structural anomaly in the packet stream: fastDig hardcoded face=1 (the TOP
// face) for every dig, and a block directly ABOVE the bot's eye has no
// reachable top face - the eye is below the block's top plane. Vanilla
// validates the targeted face against the digger's geometry, so the overhead
// START_DESTROY_BLOCK is discarded and no STOP spam in the world makes the
// server delete a dig it never accepted. That is exactly why the class hid
// for 70+ runs: floor digs (feet-1) and wall digs (ahead, at/below eye) all
// keep a top face that EXISTS, only the climb's ceiling-first order hits the
// impossible one - and the climb is the last leg of every bank chain
// ('still underground after 2 climb attempts', banked stuck at 74).
//
// THE CURE: pick the face the digger can actually see - the face whose
// outward normal points back at the eye. A block center ABOVE the eye gets
// face=0 (BOTTOM), everything else keeps face=1 (top, byte-identical to the
// historical behavior that mined 1325 blocks/run). Pure and junk-safe: any
// missing/NaN eye read falls back to 1, so mocks and headless callers dig
// exactly as before.
export const FACE_TOP = 1
export const FACE_BOTTOM = 0

export function digFaceFor ({ eyeY = null, blockCenterY = null } = {}) {
  const eye = Number(eyeY)
  const center = Number(blockCenterY)
  if (!Number.isFinite(eye) || !Number.isFinite(center)) return FACE_TOP
  return center > eye ? FACE_BOTTOM : FACE_TOP
}

export function installRageFastBreak (bot, { stopSpamPerTick = 1, log = () => {} } = {}) {
  if (bot.fastDig) return bot.fastDig

  const realDigTime = bot.digTime.bind(bot)
  bot.realDigTime = realDigTime
  bot.digTime = () => 0 // Wurst: gameMode.destroyDelay = 0

  const send = (status, pos, face) => bot._client.write('block_dig', { status, location: pos, face })

  // Returns true when the server really removed the block.
  // maxTicks (default 100 = the historical 5s spam window) extends the window
  // for PATIENT digs: the server validates vanilla dig time, and a submerged
  // miner digs 5x slower (no aqua affinity on any bot) - stone with a stone
  // pick needs ~115 ticks underwater, which the plain window refuses. The
  // wet-escape traverse (surface.mjs) uses the extended window because the
  // alternative is a bot that drowns in its own flooded shaft.
  bot.fastDig = async function fastDig (block, { maxTicks = 100 } = {}) {
    if (!block || block.type === 0) return true
    // EQUIP THE HARVESTING TOOL FIRST. fastDig never cared what the hand holds, and
    // vanilla punishes that: stone/diorite/ores broken without a pickaxe DO break
    // (FastBreak spam makes sure of it) but drop NOTHING - measured live: a bot dug
    // 20 stone/diorite blocks in a shaft with a shovel in hand and collected 0 items.
    // bot.tool (mineflayer-tool) checks the held item first, so a correct hand is a
    // no-op; no tool plugin (unit-test mocks) -> dig as before.
    if (bot.tool?.equipForBlock) {
      try { await bot.tool.equipForBlock(block, { requireHarvest: true }) } catch { /* dig anyway */ }
    }
    const pos = block.position
    // (v0.75.0) the face the digger can actually SEE: a block center above the
    // eye has no reachable top face (the run71 overhead class - 94 climb
    // refusals, one cell, the whole run) -> the BOTTOM face; everything below
    // the eye keeps the historical top face. A missing entity read (mocks)
    // falls back to the legacy 1.
    const eyeY = (() => { try { return bot.entity.position.y + 1.62 } catch { return null } })()
    const face = digFaceFor({ eyeY, blockCenterY: pos.y + 0.5 })

    await bot.lookAt(pos.offset(0.5, 0.5, 0.5), true)
    send(0, pos, face) // START_DESTROY_BLOCK
    bot.swingArm()

    const gone = () => {
      const b = bot.blockAt(pos)
      return !b || b.type === 0
    }

    for (let tick = 0; tick < maxTicks; tick++) {
      for (let s = 0; s < stopSpamPerTick; s++) send(2, pos, face) // STOP_DESTROY_BLOCK spam
      if (gone()) return true
      await bot.waitForTicks(1)
      if (gone()) return true
    }
    return gone()
  }

  log('rage fastbreak installed (STOP_DESTROY_BLOCK spam, destroyDelay 0)')
  return bot.fastDig
}
