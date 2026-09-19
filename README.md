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
| Test suite | **works** | 40+ unit tests (LCG vs JavaRandom, placement, xoroshiro, worldmap, job queue, fly physics, fastdig) + integration tests, all run in CI on every push |

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
