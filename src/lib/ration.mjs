//
// ration.mjs - THE FLESH RATION (v0.511.0)
// The recover() doctrine's heal leg becomes real. miner.mjs's own recover()
// comment pinned the premise ('autoeat + natural regen need seconds') - but
// the autoeat plugin it names was inert three layers deep:
//
//   1. enableAuto() is NEVER called - mineflayer-auto-eat 5.0.3's loader()
//      builds the EatUtil and stops; statusCheck (the physicsTick eater)
//      stays unbound, so the plugin never eats anything, ever.
//   2. Even enabled, the default bannedFood list opens with 'rotten_flesh' -
//      and rotten flesh IS the fleet's food chain: zombies attack, the
//      combat lane kills them, the drops land in pockets, and no lane
//      supplies anything else (no hunt lane; the map trips target
//      sand/gravel). The plugin refused the only food the fleet owns.
//   3. Even un-banned, the default minHunger 15 with the STRICT <
//      comparison feeds at hunger <= 14 - below the vanilla regen floor
//      18, so the 15..17 band had neither regen nor a bite: exactly the
//      band a fled bot sits in while its hp should be climbing.
//
// The policy here is the fleet's OWN eating law, wired over the plugin's
// config surface (setOpts + enableAuto in miner.mjs). Pure numbers, no
// bot, no server - the mechanism stays in the plugin, the visibility in
// the miner's eatStart/eatFinish handlers.
//
// THE VANILLA PRICING (why un-ban rotten flesh is safe):
// - natural regen: hunger >= 18 heals 1 hp / 4s. That is the ONLY heal the
//   fleet has (no potions, no gapples, difficulty=normal so no regen from
//   saturation side-effects either).
// - a rotten flesh restores 4 hunger / 0.6 saturation. Its 80%-chance
//   Hunger I effect (30s) drains 0.005 exhaustion/tick = 3.0 exhaustion
//   over the full 30s - and ONE hunger point costs 4.0 exhaustion. The
//   worst case of the flesh's downside cannot drop even ONE hunger point
//   on its own; the upside is +4. The default ban protected a saturation
//   doctrine the fleet does not have - the flesh feeds the regen window
//   the flee doctrine actually runs on.
// - the four other bans stay: pufferfish (poison), chorus_fruit
//   (teleport - a bot that bites it mid-shaft surfaces somewhere random),
//   poisonous_potato (poison), spider_eye (poison). No lane supplies them
//   anyway, and their side effects are real prices.

/** Vanilla natural-regen floor: hunger >= 18 heals 1 hp / 4s. Below it the fleet has no heal at all. */
export const REGEN_HUNGER_FLOOR = 18

/** The plugin eats when bot.food < minHunger (STRICT <). 18 feeds at hunger <= 17: one bite of anything above 3 nutrition re-crosses the 18 floor, and the 15..17 dead band closes. */
export const RATION_MIN_HUNGER = 18

/** The plugin also eats when bot.health < minHealth. 14 is recover()'s own band (it waits at hp < 14) - post-fight eating starts the moment the doctrine calls the bot hurt. */
export const RATION_MIN_HEALTH = 14

/** The plugin's default bans MINUS rotten_flesh (the fleet's staple - see the pricing above). */
export const RATION_BANNED = ['pufferfish', 'chorus_fruit', 'poisonous_potato', 'spider_eye']

/** The staple's own name - the un-ban is explicit, never a typo-shaped omission. */
export const ROTTEN_FLESH = 'rotten_flesh'

/** The full config handed to bot.autoEat.setOpts() by the miner wire. Every field is the plugin default except the three this module exists to change (minHunger, minHealth stays, bannedFood) - one object, no drift. */
export const RATION_OPTS = {
  eatingTimeout: 3000,
  minHealth: RATION_MIN_HEALTH,
  minHunger: RATION_MIN_HUNGER,
  returnToLastItem: true,
  offhand: false,
  priority: 'foodPoints',
  bannedFood: RATION_BANNED,
  strictErrors: true
}

/**
 * Why is this bot eating right now? The log line's reason class, pure and
 * junk-safe. The plugin decides WHEN (its own physicsTick check); this
 * names the doctrine's side that fired, so the field log can be read
 * without re-deriving the comparison.
 *
 * @param {object} [p]
 * @param {number|null} [p.food] bot.food 0..20 (junk -> the hunger side never fires)
 * @param {number|null} [p.health] bot.health 0..20 (junk -> the health side never fires)
 * @returns {{ due: boolean, reason: string }} 'hunger-guard' (food < 18:
 *   the regen floor is threatened), 'health-guard' (health < 14: the
 *   post-fight band), both when both fire (the hunger side names first -
 *   it is the doctrine's standing guard), or due:false 'fed' /
 *   'no readable clock' (a junk body never eats: junk never widens a
 *   verdict, the walkForbidden law's shape).
 */
export function rationVerdict ({ food = null, health = null } = {}) {
  const f = Number.isFinite(food) ? food : null
  const h = Number.isFinite(health) ? health : null
  if (f === null && h === null) return { due: false, reason: 'no readable clock' }
  const hunger = f !== null && f < REGEN_HUNGER_FLOOR
  const hurt = h !== null && h < RATION_MIN_HEALTH
  if (hunger && hurt) return { due: true, reason: 'hunger-guard+health-guard' }
  if (hunger) return { due: true, reason: 'hunger-guard' }
  if (hurt) return { due: true, reason: 'health-guard' }
  return { due: false, reason: 'fed' }
}
