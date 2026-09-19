#!/usr/bin/env bash
# Reset the world to the fixed test seed and launch the bot fleet, in the background.
#
#   scripts/fleet-run.sh [bots] [seconds] [--yard]
#
# Every run starts from a completely fresh world with the same seed, so results are comparable.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED="-8201142900731514829"
BOTS="${1:-19}"
SECONDS_TO_RUN="${2:-1800}"
BUILD_YARD="no"
for arg in "$@"; do [ "$arg" = "--yard" ] && BUILD_YARD="yes"; done

LOG=/tmp/fleet19.log

echo "[fleet-run] stopping the fleet and the server"
pkill -f '^/usr/bin/node testbed/fleet19' 2>/dev/null || true
"$ROOT/scripts/server.sh" stop >/dev/null 2>&1 || true
sleep 2

echo "[fleet-run] fresh world with seed $SEED"
if [ ! -f "$ROOT/testbed/server/server.properties" ]; then
  echo "[fleet-run] missing server.properties" >&2
  exit 1
fi
sed -i "s/^level-seed=.*/level-seed=$SEED/" "$ROOT/testbed/server/server.properties"
grep -q '^level-seed=' "$ROOT/testbed/server/server.properties" || echo "level-seed=$SEED" >> "$ROOT/testbed/server/server.properties"
rm -rf "$ROOT/testbed/server/world"
rm -f "$ROOT/data/worldmap.json"

"$ROOT/scripts/server.sh" start || { echo "[fleet-run] server did not start" >&2; exit 1; }

if [ "$BUILD_YARD" = "yes" ]; then
  echo "[fleet-run] building the workshop at spawn"
  node "$ROOT/scripts/setup-yard.mjs" >/dev/null 2>&1 || true
fi

echo "[fleet-run] launching $BOTS bots for ${SECONDS_TO_RUN}s -> $LOG"
cd "$ROOT" || exit 1
setsid nohup /usr/bin/node testbed/fleet19.mjs "$BOTS" "$SECONDS_TO_RUN" > "$LOG" 2>&1 < /dev/null &
disown || true
sleep 3
if pgrep -f '^/usr/bin/node testbed/fleet19' >/dev/null; then
  echo "[fleet-run] fleet pid: $(pgrep -f '^/usr/bin/node testbed/fleet19' | head -1)"
  echo "[fleet-run] watch: tail -f $LOG"
else
  echo "[fleet-run] fleet failed to start, see $LOG" >&2
  exit 1
fi
