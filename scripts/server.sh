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
  # the java process command line is "<java> -Xms1G -Xmx2G -jar server.jar nogui";
  # this pattern deliberately does not match the shell running this script
  pgrep -f -- '-Xmx[0-9]+[GgMm] -jar server\.jar nogui$' || true
}

case "${1:-status}" in
  stop)
    for p in $(server_pids); do kill "$p"; done
    sleep 4
    server_pids > /dev/null && echo "still running" || echo "stopped"
    ;;
  start)
    if [ ! -p "$DIR/cmd.fifo" ]; then mkfifo "$DIR/cmd.fifo"; fi
    cd "$DIR"
    setsid nohup bash -c "tail -f cmd.fifo | '$JAVA_BIN' -Xms1G -Xmx2G -Xlog:gc:stdout:uptime,levels -jar server.jar nogui" >> "$DIR/console.log" 2>&1 < /dev/null &
    disown || true
    for _ in $(seq 1 120); do
      sleep 2
      if grep -q "Done (" "$DIR/logs/latest.log" 2>/dev/null && [ -n "$(server_pids)" ]; then
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
