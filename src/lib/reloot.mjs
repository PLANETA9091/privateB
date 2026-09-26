// THE RE-LOOT PLAN (v0.200.0): the death economy's pure core.
//
// MEASURED (run63-mined, fleet 36212235363, the v0.199.0 tree's field day):
// 4 deaths, and the v0.199.0 death-drop line named EVERY pocket at the death
// event - 'F12 death drop: ~84u lost at [-195,59,405]', 'F7 ~62u at
// [-138,52,420]', 'F7 ~48u at [-137,64,424]', 'F13 ~33u at [-89,64,379]' -
// ~227u scattered across one 600s run. THE TIMELINE IS THE INDICTMENT: the
// drops landed at t-176s and t-131s, vanilla despawn is 300s, so every stack
// SURVIVED PAST THE RUN'S END (t-176 + 300 = t+124) - nobody picked them up,
// the death-spot memory (v0.84.0) steers every bot AWAY from the corpse, and
// the ledger's unaccounted=0 hid the loss inside the conversion formula's
// slack (accounted 3045 > mined 2649: pockets count crafted/collected units
// the mined counter never tracks). The death economy cure is a WALK: the
// respawned bot returns to its OWN death spot and re-collects its own drops
// while they still exist.
//
// This module is the PURE decision surface for that walk - no bot, no
// pathfinder, no log. The wiring (a post-respawn lane that aims GoalNear at
// the plan's goal and aborts on arrival-with-no-items) is its own fire: a
// walk lane mis-wired into a 4271-line miner eats mining time (the
// sweep-drop timeout lessons), so the plan lands first, fully unit-tested,
// and the field debut rides the next lane.
//
// The fences, each named for the lesson that owns it:
//   no-spot    - junk spot/deathAt/botPos: junk never arms a walk (the
//                gates-decide convention; silence is never evidence, so the
//                refusal CARRIES its why to the log).
//   attempted  - one walk per death (the retry-storm fence, the v0.82.0
//                REPEAT_PAGE lesson: a lane that re-arms on failure burns
//                its budget re-failing at the same cell).
//   expired    - the drops despawn at deathAt + RELOOT_DESPAWN_MS (vanilla
//                300s); past that the walk digs up an empty cell.
//   no-bot     - the bot's own position unreadable: the distance cannot be
//                measured, so the budget cannot be bounded.
//   too-far    - beyond RELOOT_MAX_DIST the walk exceeds the house walk-cap
//                envelope (WALK_CAP_MS 32s / 250ms per block = 128 blocks) -
//                the v0.11.2 OOM lesson forbids an open-ended leash, and a
//                re-loot that cannot converge inside the cap is the doomed
//                class by construction.
//   no-time    - budget + margin must fit the remaining despawn window: a
//                walk that lands after the despawn is a wasted trip AND a
//                wasted walk (the dusk wire's fence (b) arithmetic).
// The margin (RELOOT_MARGIN_MS 30s) is the same overrun class the dusk wire
// carries (DUSK_BANK_MARGIN_MS): measured yard-walk overruns, detours around
// the hazards that killed the bot in the first place.

import { walkBudgetMs } from './tripplan.mjs'

/** Vanilla item despawn: drops vanish 300s after they land. */
export const RELOOT_DESPAWN_MS = 300000
/** Walk envelope: WALK_CAP_MS (32s) / WALK_PER_BLOCK_MS (250ms) = 128 blocks.
 * Past this the walk cannot converge inside the house's bounded-budget law. */
export const RELOOT_MAX_DIST = 128
/** Overrun margin: the walk must FINISH this long before the despawn (the
 * dusk wire's margin class - detours around the very hazard that killed). */
export const RELOOT_MARGIN_MS = 30000
/** GoalNear range for the walk goal: the drop may sit below the walk plane
 * or inside the freed cell (the v0.178.0 below-plane lesson) - range 2 lets
 * the gallery lip count as arrival instead of spiraling into a timeout. */
export const RELOOT_GOAL_RANGE = 2

/**
 * Should the respawned bot walk back to its own death spot to re-collect the
 * drops, and what goal/budget does that walk get? Pure, junk-safe: every
 * refusal carries a named why (silence is never evidence), and junk never
 * arms a walk.
 * @param {object} [p]
 * @param {{x:number,y:number,z:number}|null} [p.spot] the death spot (junk -> no-spot)
 * @param {number|null} [p.deathAt] ms clock of the death (junk -> no-spot)
 * @param {number} [p.now] the caller's clock (default Date.now())
 * @param {{x:number,y:number,z:number}|null} [p.botPos] the bot's current (respawn) position (junk -> no-bot)
 * @param {boolean} [p.attempted] a re-loot walk already fired for this death (-> attempted)
 * @param {number} [p.despawnMs] vanilla despawn window (default RELOOT_DESPAWN_MS)
 * @param {number} [p.maxDist] the walk-envelope radius (default RELOOT_MAX_DIST)
 * @param {number} [p.marginMs] the finish-before-despawn margin (default RELOOT_MARGIN_MS)
 * @returns {{go:boolean, why?:string, goal?:{x:number,y:number,z:number}, range?:number, dist?:number, budgetMs?:number, windowMs?:number}}
 *   a refusal reads { go:false, why }, a plan reads { go:true, goal, range, dist, budgetMs, windowMs }
 */
export function relootPlan ({
  spot = null,
  deathAt = null,
  now = Date.now(),
  botPos = null,
  attempted = false,
  despawnMs = RELOOT_DESPAWN_MS,
  maxDist = RELOOT_MAX_DIST,
  marginMs = RELOOT_MARGIN_MS
} = {}) {
  const fin = v => Number.isFinite(v)
  const spotOk = spot && fin(spot.x) && fin(spot.y) && fin(spot.z)
  if (!spotOk || !fin(deathAt)) return { go: false, why: 'no-spot' }
  if (attempted) return { go: false, why: 'attempted' }
  const despawn = fin(despawnMs) && despawnMs > 0 ? despawnMs : RELOOT_DESPAWN_MS
  const t = fin(now) ? now : Date.now()
  const windowMs = deathAt + despawn - t
  if (windowMs <= 0) return { go: false, why: 'expired' }
  const botOk = botPos && fin(botPos.x) && fin(botPos.y) && fin(botPos.z)
  if (!botOk) return { go: false, why: 'no-bot' }
  const dx = spot.x - botPos.x
  const dy = spot.y - botPos.y
  const dz = spot.z - botPos.z
  const dist = Math.hypot(dx, dy, dz)
  const cap = fin(maxDist) && maxDist > 0 ? maxDist : RELOOT_MAX_DIST
  if (dist > cap) return { go: false, why: 'too-far' }
  const budgetMs = walkBudgetMs({ dist })
  const margin = fin(marginMs) && marginMs > 0 ? marginMs : RELOOT_MARGIN_MS
  if (budgetMs + margin > windowMs) return { go: false, why: 'no-time' }
  return {
    go: true,
    goal: { x: Math.floor(spot.x), y: Math.floor(spot.y), z: Math.floor(spot.z) },
    range: RELOOT_GOAL_RANGE,
    dist,
    budgetMs,
    windowMs
  }
}
