# privateB — Minecraft 26.2 bot fleet

Fleet of **mineflayer** bots for **Minecraft 26.2** that play *survival* (no op, no gifts) and
gather the materials a `.litematic` base needs. Everything here was measured on a live vanilla
26.2 server (`allow-flight=false`, offline mode) — numbers below are real runs, not estimates.

## Seed and schematic (inside this repo)

* **World seed:** `-8201142900731514829` (also in `config/world.json`)
* **Schematic:** `schematic/base.litematic` — 76×283×62, 114 636 blocks, 90 block types, by
  `Planeta_Play`; the counted material plan is in `data/base-materials.json` (blocks) and
  `data/base-raw.json` (raw resources: sand 157 926, gravel 149 380, ink sac 31 860,
  deepslate 27 420, andesite 10 725, coal 7 668, stone 6 695, tuff 4 439, blaze rod 4 142,
  popped chorus 4 142, iron 2 275, netherite 1 225, planks 1 272, bone 3 649, wool 465 …).
* Server template with that seed: `testbed/server.properties.template`
  (`online-mode=false`, `allow-flight=true`, `max-players=20`, `level-seed=-8201142900731514829`).
* Every fleet run resets the world and rebuilds it from that seed:
  `scripts/fleet-run.sh [bots] [seconds] [--yard]`.

## Current status

| Piece | State | Evidence |
|---|---|---|
| mineflayer speaks 26.2 (protocol 776, dataVersion 4903) | **works** | `scripts/setup-26.2.mjs`; login/spawn/chunks/registry/dig/place/inventory verified |
| Flight with anti-kick | **works** | with `allow-flight=false` a bot without anti-kick is kicked (`multiplayer.disconnect.flying`), with anti-kick it hovers; 20 blocks/s in open air |
| NoFall | **works** | `onGround=true` every tick; 0 fall deaths over full fleet runs |
| Ground mode (pathfinder, no block clipping) | **works** | `moved wrongly!` went 1487 → **0**, floating kicks → **0** |
| Rage FastBreak (cheat) | **works, 4x** | A/B: 0.83 blocks/s vs 0.21 blocks/s honest (bare hands, no op), measured |
| Tool bootstrap (no op) | **works** | logs → planks → sticks → crafting table → wooden pickaxe/shovel → stone tools |
| Material plan from a schematic | **works** | `scripts/litematic-dump.py` + `scripts/materials-expand.py` → `data/base-*.json` |
| Workshop (furnaces/stonecutters/water/portals/50 chests) | **works** | `scripts/setup-yard.mjs`, verified 19/19 structures by a bot |
| Structure placement maths for 26.2 | **verified** | reproduces the live server 3/3 (shipwreck/monument/village) |
| Structure-seed cracker | **works** | recovered a real 48-bit seed from 36 structure positions in ~6 s (12 cores) |
| Dungeon / ore based cracking | **dead end** | upstream SeedcrackerX states dungeons/emerald cracking was removed for 1.18+ |
| **Fleet mining productivity** | **works - CI GREEN** | per-bot job queue (`src/lib/jobqueue.mjs`): pathfinder-verified reachable targets only, hard timeout around every `collect()`, blacklist for failures; asserted by `tests/integration/productivity.test.mjs` on a live vanilla server in GitHub Actions |
| **Scout -> miner integration** | **works (ground mode)** | shared `WorldMap` (`src/fleet/worldmap.mjs`): every walking miner records what it sees and walks to map-known positions when its local scan runs dry; `SCOUT=1 node testbed/fleet19.mjs` adds a dedicated walking scout (no fly, no dig); map persists to `data/worldmap.json` |
| **Stall-proof ground mining** | **works** | `workOnGround` escalates instead of spinning: map trip -> far hop -> 90° rotation -> digShaft fallback (v0.5.0, field logs showed +0 windows before) |
| **Craft window recovery** | **works** | a timed-out `bot.craft` used to poison the grid ("missing ingredient" forever); `tools.mjs` now closes/sweeps the stale window (table AND inventory windows), plus the 4-tick place throttle and the self-healing table chain |
| **Two-bot tool bootstrap crash** | **fixed** | mineflayer's findBlocks palette fast-path hands matchers position-less blocks - the reachableTable predicate crashed with `reading 'x' of null` whenever ANOTHER bot's table was in a nearby chunk palette; guarded (v0.5.0) |
| **Fleet chat sync (PVB1)** | **works** | `src/fleet/chatsync.mjs`: scouts broadcast new finds over compact chat lines, every bot merges them into its WorldMap - the only channel across process boundaries; unit-tested codec (chunking, content dedupe, hostile-input safe) |
| **Chest delivery** | **works** | `src/lib/deposit.mjs`: bots with full pockets walk back and bank into the yard's chest rows (tools/food stay with the bot); VERIFIED transfers (ghost clicks are not counted as loot), multi-chest continuation, `depositToChests` for full deliveries; fleet19 banks mid-run AND at the end, reports `banked=`. (v0.12.0) the mid-run gate `needsBanking` fires on slots>=24 OR units>=128 - the old `slots>=30` never fired because consolidation merges stacks (fleet 35485296464: 40-70 units in ~10-15 stacks, banked=0 forever) |
| **Dig-staircase shaft exit (v0.14.0)** | **works - unit-tested** | `src/lib/surface.mjs` (policy) + `miner.climbOut` (mechanics): digShaft strands every bot at the bottom of a 1x1 hole and the pathfinder cannot climb out - fleet 35485296464 ended banked=0 smelted=0 sand=0 with sand=110 KNOWN map positions (38x 'map trip skipped: unreachable'). The bot now digs a 45-degree staircase (fastDig + raw forward/jump - the proven tunnel mechanics, rotated diagonally) back to the recorded shaft entry level or daylight; fluids/bedrock stop the climb honestly, walls rotate on refusal. The first implementation pillar-jumped (leap + place beneath at the apex) but three CI fleets showed mineflayer placeBlock never resolves against this server build (height 1.17 + clear AABB and still rejected, fleet 112 diag) - placement was replaced by digging+movement. Wired into the mid-run bank gate, the map-trip cadence and the end-of-run banking; report gains `climbs=` |
| **Smelting pipeline (v0.7.0)** | **works - CI GREEN** | `src/lib/smelting.mjs`: bots turn sand -> glass, ores -> ingots, raw food -> cooked in the yard's furnace bay BEFORE banking (verified transfers, fuel policy with tool reserves, busy-machine avoidance, abandoned-output rescue, smoker for food / blast furnace for metals); fleet19 counters `smelted=` in the report; asserted end-to-end by `tests/integration/smelting.test.mjs` (craft a furnace from hand-dug cobble at a shaft bottom, smelt, verified output) |
| **Combat defense (v0.11.0)** | **works - unit-tested** | `src/lib/combat.mjs`: fight-or-flee policy - bots fight zombies/skeletons with the best held weapon (sword > axe > pickaxe), flee creepers and losing fights (low hp, swarms); wired into the digShaft health guard (defend FIRST, then pause) and a reactive hurt-sentry; the 2026-09-20 smelt-test measured the gap it closes: a zombie killed a paused bot 20 -> dead in 9 s |
| **Drowning rescue (v0.13.0)** | **works - e2e VERIFIED** | `src/lib/drowning.mjs` (policy) + miner sentry: fleet 900 s lost F1 and F3 to drowning (liquidCost=1 made lake crossings free, vanilla has no swim-up, pathfinder goals fight manual controls). Three layers: pathfinder `liquidCost=8` (land detours preferred), a 600 ms sentry (oxygen <= 10/20, oxygen <= 4 override, or head under 5 s - the metadata clock fallback), and a raw-controls swim (jump up, shoreDirection ring-scan to the nearest walk-out/jump-out bank, no pathfinder - the tunnel/shelter lesson); gotoSafe refuses goals while the rescue runs; digShaft fluid guard now sidesteps water columns (aquifers flood into unclimbable 1x1 wells); `rescues=` counter. e2e (testbed/diag-drowning.mjs): bot dropped 2-deep in a built pool - rescue fired, complete in 4.1 s, hp 20, out of water |
| **fastDig equips the harvesting tool** | **works** | stone/diorite/ores broken without a pickaxe DO break but drop NOTHING (measured: 20 blocks dug, 0 items) - `fastDig` now runs `bot.tool.equipForBlock` first; a correct hand is a no-op |
| **digShaft fall guard + treetop descent** | **works** | a shaft that opens into a cave dropped a bot 20 -> 5 hp -> dead (whole inventory lost); the shaft now measures the air run below and sidesteps 4+ drops, stops entirely below 6 hp, descends through canopies before targeting stone, and has a hard `maxMs` cap |
| **findBlocks palette-trap matchers fixed** | **works** | a `b.position != null` term inside a findBlock matcher defeats mineflayer's palette pre-check (palette blocks have no position) and silently returns null for everything - sand at distance 13 was invisible to findBlock(32); matchers now test the name only and guard `distanceTo` instead; `sweepGridItems` verifies every putAway (ghost clicks made the old sweep report success while the grid stayed poisoned) |
| **Stall-proof ground mining** | lava check 4 blocks below (sidestep instead of dying) + health guard (pause/retreat when damaged); every death drops the whole inventory |
| Test suite | **works** | 70+ unit tests (LCG vs JavaRandom, placement, xoroshiro, worldmap, job queue, fly physics, fastdig, chatsync, deposit, surface, scout) + integration tests, all run in CI on Node 22 and 24 on every push |

## How the fleet stays productive (the old "Known problem", fixed)

Bots used to spawn on the workshop platform and **stand there forever**:

* `bot.collectBlock.collect(targets)` waits on the pathfinder; when a target is unreachable
  (under the platform, across water) the promise never resolves, so the loop stalled on the
  first batch.
* Long walks to a deployment area were too slow; short hops kept picking blocks inside the
  workshop box or under it.

The fix (`src/lib/jobqueue.mjs`, used by `collectArea` in `src/bots/miner.mjs`):

1. **Reachable targets only.** Before a job runs, `bot.pathfinder.getPathTo()` must produce
   a successful path to stand next to the block (2.5 s CPU budget). Everything else waits
   in the queue or is skipped - it is never attempted.
2. **Hard timeout around every `collect()`** (`withTimeout`). The hang becomes a normal
   failed job, and the pathfinder goal is cancelled so the bot does not keep walking into
   the wall.
3. **Blacklist with expiry.** A position that fails twice is skipped for 60 s instead of
   being retried forever; the blacklist self-prunes so long runs cannot leak memory.
4. **Fail-safe limits.** `maxConsecutiveFails` stops a poisoned queue, `maxAttempts`
   prevents infinite retries, and an empty scan walks the bot along its own compass
   direction (which is what spreads the fleet out) before giving up.

Ground mode (flight off) is how the fleet actually works: vanilla physics + pathfinder on
foot, `digShaft` for per-bot columns, `workOnGround` for batch mining. The flight module
(`src/lib/fly.mjs`) is kept for servers that allow it, but it is off by default.

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

## Flight

Flight is **disabled by default** (`createMiner({ fly: false })`): with `allow-flight=false`
vanilla kicks any bot that hovers for 80 ticks, and even with `allow-flight=true` a flying
bot that digs into terrain produces `moved wrongly!` and gets snapped back. The bots therefore
walk with `mineflayer-pathfinder` and dig straight down (see `digShaft`). Passing `fly: true`
re-enables the flight module (`src/lib/fly.mjs`: 20 blocks/s, collision-aware stepping,
anti-kick, NoFall, `flySnap`) for servers that allow it, e.g. 2b2t-style anarchy servers.

## Run it

```bash
npm install                        # postinstall patches the stack for 26.2 automatically
node scripts/setup-26.2.mjs        # idempotent, rerun by hand if needed
scripts/server.sh start            # local vanilla 26.2 server (auto-finds Java >= 22)
node scripts/setup-yard.mjs        # workshop at spawn
scripts/fleet-run.sh 19 1800 --yard  # reset world to the fixed seed, launch 19 bots in background
tail -f /tmp/fleet19.log           # watch the fleet

# fleet extras (all optional):
FLEET_SYNC=1 node testbed/fleet19.mjs 19 1800   # share finds between bots over chat
FLEET_DEPOSIT=0 node testbed/fleet19.mjs 19 300 # disable end-of-run chest delivery
FLEET_SMELT=0 node testbed/fleet19.mjs 19 300   # disable the pre-banking smelting pass
FLEET_SMELT_BUDGET=120 node testbed/fleet19.mjs # seconds a bot may spend smelting per visit
```

## Test it (GitHub CI runs all of this on every push)

```bash
npm test                # unit tests: LCG vs JavaRandom, placement, xoroshiro, worldmap,
                        # job queue, fly physics (mocked world), fastdig (mocked bot)
npm run test:syntax     # node --check over every .mjs file in the repo
npm run test:integration  # live server required: spawns bots, crafts tools, mines,
                          # asserts progress in every 15 s window (anti-stall)
```

`.github/workflows/ci.yml` runs three jobs on GitHub Actions:

* **unit** - install, patch the stack, syntax check, the whole unit suite (no server needed)
* **integration** - downloads the vanilla 26.2 server jar (cached), starts it with the fixed
  test seed, ops the smoke bot, runs `testbed/smoke.mjs` (login/chunks/place/dig) and the
  fleet productivity test on a live server in ground mode; uploads logs as artifacts
* **fleet** (manual, `workflow_dispatch` with `run_fleet=true`) - the full 19-bot, 5-minute run

The server needs a JVM with class file 69+ (Java 25). `scripts/server.sh` picks the newest
java automatically: `$JAVA`, `$JAVA_HOME`, `~/jdk/*/bin/java`, then `PATH` - each candidate
is version-checked, so a stale Java 21 on the PATH cannot silently break the start.

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
