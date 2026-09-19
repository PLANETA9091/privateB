#!/usr/bin/env bash
# Local Minecraft 26.2 test server control.
#   server.sh start | stop | status | cmd "<server command>"
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/testbed/server"

server_pids () {
  # the java process command line is "java -Xms1G -Xmx2G -jar server.jar nogui";
  # this pattern deliberately does not match the shell running this script
  pgrep -f '^java .*-jar server\.jar nogui$' || true
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
    setsid nohup bash -c 'tail -f cmd.fifo | java -Xms1G -Xmx2G -jar server.jar nogui' >> "$DIR/console.log" 2>&1 < /dev/null &
    disown || true
    for _ in $(seq 1 60); do
      sleep 2
      if grep -q "Done (" "$DIR/logs/latest.log" 2>/dev/null && [ -n "$(server_pids)" ]; then
        echo "server up"
        exit 0
      fi
    done
    echo "server did not come up in time"
    exit 1
    ;;
  status)
    if [ -n "$(server_pids)" ]; then echo "running: $(server_pids)"; else echo "stopped"; fi
    ;;
  cmd)
    printf '%s\n' "$2" > "$DIR/cmd.fifo"
    ;;
  *)
    echo "usage: $0 start|stop|status|cmd \"<command>\""
    exit 2
    ;;
esac
