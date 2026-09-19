# privateB — Minecraft 26.2 bot fleet

Fleet of **mineflayer** bots for **Minecraft 26.2** that play *survival* (no op, no gifts) and
gather the materials a `.litematic` base needs. Everything here was measured on a live vanilla
26.2 server (`allow-flight=false`, offline mode) — numbers below are real runs, not estimates.

## Current status

| Piece | State | Evidence |
|---|---|---|
| mineflayer speaks 26.2 (protocol 776, dataVersion 4903) | **works** | `scripts/setup-26.2.mjs`; login/spawn/chunks/registry/dig/place/inventory verified |
| Flight with anti-kick | **works** | with `allow-flight=false` a bot without anti-kick is kicked (`multiplayer.disconnect.flying`), with anti-kick it hovers; 20 blocks/s in open air |
| NoFall | **works** | `onGround=true` every tick; 0 fall deaths over full fleet runs |
| Ground mode (pathfinder, no block clipping) | **works** | `moved wrongly!` went 1487 → **0**, floating kicks → **0** |
| Rage FastBreak (cheat) | **works, 4x** | A/B: 0.83 blocks/s vs 0.21 blocks/s honest (bare hands, no op), measured |
| Tool bootstrap (no op) | written | logs → planks → sticks → crafting table → wooden pickaxe/shovel → stone tools |
| Material plan from a schematic | **works** | `scripts/litematic-dump.py` + `scripts/materials-expand.py` → `data/base-*.json` |
| Workshop (furnaces/stonecutters/water/portals/50 chests) | **works** | `scripts/setup-yard.mjs`, verified 19/19 structures by a bot |
| Structure placement maths for 26.2 | **verified** | reproduces the live server 3/3 (shipwreck/monument/village) |
| Structure-seed cracker | **works** | recovered a real 48-bit seed from 36 structure positions in ~6 s (12 cores) |
| Dungeon / ore based cracking | **dead end** | upstream SeedcrackerX states dungeons/emerald cracking was removed for 1.18+ |
| **Fleet mining productivity** | **NOT WORKING** | bots stay put; the ready-made `collectblock` collect() waits on the pathfinder and never finishes, see "Known problem" |

## Known problem (the reason the fleet is not productive yet)

Bots spawn on the workshop platform and **stay there**:

* `bot.collectBlock.collect(targets)` (ready-made plugin) waits for the pathfinder; when the
  target is unreachable (under the platform, across water) the promise never resolves, so the
  loop stalls on the first batch.
* Long walks to a deployment area were tried and are too slow; short hops work but the bots
  keep choosing blocks inside the workshop box (now excluded by an `exclude` box) or under it.
* Sustained flight is not an option: with `allow-flight=false` vanilla kicks any bot that
  hovers for 80 ticks, so the bots must work on the ground.

What has to happen next: a per-bot job queue with **reachable** targets only (verified with
`bot.pathfinder` before mining) and a hard timeout around every `collect()` call.

## Layout

```
src/lib/fly.mjs          flight: 20 b/s, collision-aware stepping, anti-kick, NoFall, flySnap
src/lib/fastdig.mjs      rage FastBreak: STOP_DESTROY_BLOCK spam + destroyDelay 0
src/bots/miner.mjs       miner: fly/nuke/bore/harvestSite/workOnGround/collectArea + fleet helpers
src/bots/scout.mjs       prospector: patrols and records resource positions
src/bots/tools.mjs       no-op tool bootstrap (wood -> stone tools)
src/fleet/worldmap.mjs   shared resource map (scouts fill it, miners read it)
src/fleet/structurefind.mjs  survival structure detection by unambiguous block signatures
src/seed/placement.mjs   26.2 structure placement (spacing/separation/salt/spreadType)
src/seed/xoroshiro.mjs   1.18+ decoration RNG chain (Xoroshiro128++ + decoration seeding)
src/seed/crack.mjs       structure-seed cracker (bit-slicing/lifting search)
scripts/setup-26.2.mjs   patch the installed PrismarineJS stack for 26.2
scripts/server.sh        local test server: start | stop | status | cmd "<command>"
scripts/setup-yard.mjs   builds the workshop (furnaces, stonecutters, water, chests, portals)
scripts/fleet-run.sh     world reset + fixed seed + fleet launch, in the background
scripts/litematic-dump.py / materials-expand.py   schematic -> block counts -> raw resources
testbed/*.mjs            all the measurements (benchmarks, kick tests, seed cracker, fleet runs)
```

## Run it

```bash
npm install
node scripts/setup-26.2.mjs          # make the stack speak 26.2 (rerun after every npm install)
scripts/server.sh start              # local vanilla 26.2 server, allow-flight=false
node scripts/setup-yard.mjs          # workshop at spawn
scripts/fleet-run.sh 19 1800 --yard  # reset world to the fixed seed, launch 19 bots in background
tail -f /tmp/fleet19.log             # watch the fleet
```

## Findings worth keeping

* **26.2 structure placement** needs a salt and a spread type:
  `s = regionX*341873128712 + regionZ*132897987541 + seed + salt`, then
  `LINEAR = nextInt(bound)`, `TRIANGULAR = (nextInt(bound)+nextInt(bound))/2`.
  Real parameters live in the server jar: `data/minecraft/worldgen/structure_set/*.json`.
* **Ores and dungeons (1.18+)** are placed through a completely different chain: Xoroshiro128++
  (`RandomSupport.upgradeSeedTo128bit`), `setDecorationSeed(worldSeed, chunkOriginX, chunkOriginZ)`
  and `setFeatureSeed(decorationSeed, index, 10000*step)`. Upstream SeedcrackerX dropped dungeon
  and emerald cracking for 1.18+ ("no longer possible"), and DungeonCracker only supports ≤1.17.1.
* **Flight without `allow-flight=true`** is possible but the bot must not hover: vanilla kicks
  after 80 ticks without ground contact, and a claimed `onGround` is only honoured while the
  movement itself is valid.
* **"moved wrongly!"** = the bot's position is invalid (inside blocks). That single warning was
  the cause of both the kicking and the teleport-looking movement.
* **FastBreak** cannot make blocks break faster than the server wants, but it removes the
  client-side wait: measured 4x on bare-hand dirt mining.
