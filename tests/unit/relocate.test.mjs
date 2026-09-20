// Tests for relocateToSolidGround in src/bots/tools.mjs.
// Big fleet #127 (CI run 35512719192) OOMed at t-400s: the yard water basin put
// F14 wet mid-toolupgrade, the drowning rescue held the raw swim controls, and
// this walk was a RAW bot.pathfinder.goto - no water-rescue gate, no fleet path
// semaphore - so pathfinder goals kept fighting the rescue's controls and the
// heap went 113M -> 3550 MB in ~35 s. The contract now: a rescue owns the bot
// (refuse without issuing ANY goal), and every goal goes through gotoSafe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relocateToSolidGround } from '../../src/bots/tools.mjs'
import { Vec3 } from 'vec3'

// A wet bot: feet in fluid, solid ground below (the yard water basin shape).
// `dry` flips the world to solid ground under the bot (the walk worked).
function basinBot ({ dry = false, waterRescue = false, dryAfterGoto = false } = {}) {
  const state = { dry, gotoCalls: 0, stopped: 0, dryAfterGoto }
  const bot = {
    _waterRescue: waterRescue,
    entity: { position: new Vec3(10.5, 71, 400.5) },
    pathfinder: {
      async goto (goal) {
        state.gotoCalls++
        state.lastGoal = goal
        bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        if (state.failNext) { state.failNext = false; const e = new Error('water rescue in progress (relocate walk refused)'); throw e }
        if (state.dryAfterGoto) state.dry = true
        return undefined
      },
      stop () { state.stopped++ },
      setGoal () {}
    },
    waitForTicks: async () => {},
    blockAt (p) {
      const feetY = 71
      if (state.dry) {
        return p.y < feetY ? { boundingBox: 'block' } : { boundingBox: 'empty' }
      }
      // wet: fluid at the feet cell (y=71), air above, solid below
      if (p.y === feetY) return { boundingBox: 'fluid' }
      if (p.y === feetY + 1) return { boundingBox: 'empty' }
      return { boundingBox: 'block' }
    }
  }
  bot._state = state
  return bot
}

test('relocate: a bot owned by a drowning rescue refuses WITHOUT issuing a goal', async () => {
  const bot = basinBot({ waterRescue: true })
  const ok = await relocateToSolidGround(bot)
  assert.equal(ok, false, 'the rescue owns the controls - no walk can be promised')
  assert.equal(bot._state.gotoCalls, 0, 'not ONE pathfinder goal may fight the raw swim controls')
})

test('relocate: a dry bot is already done - no walk, no calls', async () => {
  const bot = basinBot({ dry: true })
  const ok = await relocateToSolidGround(bot)
  assert.equal(ok, true)
  assert.equal(bot._state.gotoCalls, 0)
})

test('relocate: a wet bot walks (through gotoSafe) until it stands dry', async () => {
  const bot = basinBot({ dryAfterGoto: true })
  const ok = await relocateToSolidGround(bot)
  assert.equal(ok, true, 'the fake walk flips the world dry - success')
  assert.ok(bot._state.gotoCalls >= 1, 'at least one real walk attempt')
})

test('relocate: a permanently wet bot burns its tries and reports honestly', async () => {
  const bot = basinBot({})
  const ok = await relocateToSolidGround(bot, { tries: 3 })
  assert.equal(ok, false, 'still wet: false, never a fake success')
  assert.equal(bot._state.gotoCalls, 3, 'one walk per try, no spin')
})

test('relocate: a rescue that flips on MID-loop stops the walk attempts', async () => {
  const bot = basinBot({})
  // the rescue engages while the FIRST goal is in flight (the gate refused it);
  // from the next round on, the flag check must end the walk - no further goals
  bot.pathfinder.goto = async goal => {
    bot._state.gotoCalls++
    bot._waterRescue = true // the sentry fired mid-walk
    const e = new Error('water rescue in progress (relocate walk refused)')
    throw e
  }
  const ok = await relocateToSolidGround(bot, { tries: 5 }).catch(() => 'threw')
  assert.notEqual(ok, 'threw', 'a refused goal is caught, never a crash')
  assert.equal(ok, false, 'still wet: honest failure')
  assert.equal(bot._state.gotoCalls, 1, 'exactly ONE goal was issued - the rescue owns the bot after it')
})
