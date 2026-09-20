#!/usr/bin/env bash
# Local Minecraft 26.2 test server control.
#   server.sh start | stop | status | cmd "<server command>"
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/testbed/server"

# Minecraft 26.2 needs a modern JVM (class file 69 => Java 25+). Pick the first
# java that can run it: $JAVA, $JAVA_HOME, a bundled JDK in ~/jdk, then PATH --
# each candidate must actually be a Java >= 22 runtime (class file 66+).
find_java () {
  local candidates
  candidates=()
  [ -n "${JAVA:-}" ] && candidates+=("$JAVA")
  [ -n "${JAVA_HOME:-}" ] && candidates+=("$JAVA_HOME/bin/java")
  for g in "$HOME"/jdk/*/bin/java /opt/jdk*/bin/java; do [ -e "$g" ] && candidates+=("$g"); done
  candidates+=("$(command -v java || true)")
  local c major
  for c in "${candidates[@]}"; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    major=$("$c" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)
    [ -n "$major" ] && [ "$major" -ge 22 ] && { echo "$c"; return 0; }
  done
  return 1
}
JAVA_BIN="$(find_java)" || { echo "no Java >= 22 found; install a newer JDK (e.g. Temurin 25) into ~/jdk"; exit 1; }

server_pids () {
  # the java process command line is "<java> -Xms1G -Xmx2G [-Xlog:gc ...] -jar
  # server.jar nogui"; this pattern deliberately does not match the shell running
  # this script, and tolerates flags between -Xmx and -jar (the v0.18.13 GC flag
  # lesson: -Xlog:gc landed between them and the old pattern stopped matching -
  # fail-fast declared the server dead after one 2s iteration).
  # (v0.18.15) NO trailing anchor: a live server measured with cmdline ending at
  # `-jar server.jar` (nogui missing on an older start path) made `stop` a silent
  # no-op forever. The unanchored pattern also catches the fifo-bash wrapper
  # (`bash -c tail -f cmd.fifo | java ... server.jar nogui`) - stop wants BOTH dead,
  # and killing the wrapper first orphans the JVM otherwise. `pgrep -f` matches the
  # full cmdline, so every hit here contains -Xmx AND -jar server.jar: no false
  # positives on the tail/editor/tooling processes.
  pgrep -f -- '-Xmx[0-9]+[GgMm] .*-jar server\.jar' || true
}

# Count the boot-completed lines in the server log. `start` needs a FRESH one:
# (v0.18.15) the old check was `grep -q "Done ("` - ANY historical Done counted,
# so when stop had silently missed a stale JVM, start's fail-fast never saw the
# port-busy death of the NEW jvm (the old one still matched server_pids) and
# start printed "server up" instantly - while the world it had just deleted was
# still held open by the zombie. (v0.18.15) A Done COUNT cannot work either -
# vanilla rotates latest.log on every boot, so a fresh boot restarts the count
# at 1 and `> before` never fires (measured live). The falsifiable up-check is
# -nt against a stamp touched at launch: latest.log must be NEWER than this
# start attempt, so historical Done lines can never satisfy a fresh start.

case "${1:-status}" in
  stop)
    for p in $(server_pids); do kill "$p"; done
    # (v0.18.15) TERM then verify-gone; a JVM that ignores TERM gets KILLed - the
    # old one-kill-and-hope left zombies holding port 25565 and the deleted world
    for _ in $(seq 1 10); do
      [ -z "$(server_pids)" ] && break
      sleep 1
    done
    if [ -n "$(server_pids)" ]; then
      for p in $(server_pids); do kill -9 "$p" 2>/dev/null; done
      sleep 1
    fi
    [ -z "$(server_pids)" ] && echo "stopped" || { echo "still running: $(server_pids)"; exit 1; }
    ;;
  start)
    if [ ! -p "$DIR/cmd.fifo" ]; then mkfifo "$DIR/cmd.fifo"; fi
    cd "$DIR"
    STAMP="$DIR/.start-stamp"
    touch "$STAMP" 2>/dev/null || STAMP=/dev/null
    setsid nohup bash -c "tail -f cmd.fifo | '$JAVA_BIN' -Xms1G -Xmx2G -Xlog:gc -jar server.jar nogui" >> "$DIR/console.log" 2>&1 < /dev/null &
    disown || true
    for _ in $(seq 1 120); do
      sleep 2
      if [ "$DIR/logs/latest.log" -nt "$STAMP" ] && grep -q "Done (" "$DIR/logs/latest.log" 2>/dev/null && [ -n "$(server_pids)" ]; then
        echo "server up ($JAVA_BIN)"
        exit 0
      fi
      # fail fast if the JVM died (wrong java version, bad jar, port busy ...)
      [ -z "$(server_pids)" ] && break
    done
    echo "server did not come up in time"
    tail -5 "$DIR/console.log" 2>/dev/null || true
    exit 1
    ;;
  status)
    if [ -n "$(server_pids)" ]; then echo "running: $(server_pids)"; else echo "stopped"; fi
    ;;
  java)
    echo "$JAVA_BIN"
    ;;
  cmd)
    printf '%s\n' "$2" > "$DIR/cmd.fifo"
    ;;
  *)
    echo "usage: $0 start|stop|status|cmd \"<command>\""
    exit 2
    ;;
esac
