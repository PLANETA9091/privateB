// Rage FastBreak for mineflayer bots - the blatant version, no legit fallback.
//
// Wurst's FastBreakHack (legitMode = false) sends an extra STOP_DESTROY_BLOCK packet on
// every block-breaking-progress tick, because servers that trust the client's claim break
// the block immediately. We do the same: START_DESTROY_BLOCK, then spam STOP_DESTROY_BLOCK
// every tick until the world says the block is gone. Client-side destroy delay is 0.

export function installRageFastBreak (bot, { stopSpamPerTick = 1, log = () => {} } = {}) {
  if (bot.fastDig) return bot.fastDig

  const realDigTime = bot.digTime.bind(bot)
  bot.realDigTime = realDigTime
  bot.digTime = () => 0 // Wurst: gameMode.destroyDelay = 0

  const send = (status, pos, face) => bot._client.write('block_dig', { status, location: pos, face })

  // Returns true when the server really removed the block.
  bot.fastDig = async function fastDig (block) {
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
    const face = 1 // top

    await bot.lookAt(pos.offset(0.5, 0.5, 0.5), true)
    send(0, pos, face) // START_DESTROY_BLOCK
    bot.swingArm()

    const gone = () => {
      const b = bot.blockAt(pos)
      return !b || b.type === 0
    }

    for (let tick = 0; tick < 100; tick++) {
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
