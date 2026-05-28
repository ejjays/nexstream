#!/bin/bash
# PO Token Server for yt-dlp (bgutil-ytdlp-pot-provider)
# Starts the server on port 4416
# yt-dlp auto-detects it when making YouTube requests

POT_DIR="$HOME/bgutil-ytdlp-pot-provider/server"
LOG_FILE="/tmp/pot-server.log"
PID_FILE="/tmp/pot-server.pid"

case "$1" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "PO Token server already running (PID: $(cat "$PID_FILE"))"
      exit 0
    fi
    cd "$POT_DIR" || exit 1
    node build/main.js > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "PO Token server started (PID: $!, port: 4416)"
    ;;
  stop)
    if [ -f "$PID_FILE" ]; then
      kill "$(cat "$PID_FILE")" 2>/dev/null
      rm -f "$PID_FILE"
      echo "PO Token server stopped"
    else
      echo "No PID file found"
    fi
    ;;
  status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      curl -s http://127.0.0.1:4416/ping
      echo ""
    else
      echo "PO Token server not running"
    fi
    ;;
  log)
    tail -20 "$LOG_FILE"
    ;;
  *)
    echo "Usage: $0 {start|stop|status|log}"
    exit 1
    ;;
esac
