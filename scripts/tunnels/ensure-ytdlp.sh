#!/data/data/com.termux/files/usr/bin/bash
# ensures watchdog persists android kills
HOME_DIR=/data/data/com.termux/files/home
WATCHDOG="$HOME_DIR/nexstream/scripts/tunnels/keepalive-ytdlp.sh"
termux-wake-lock 2>/dev/null || true
mkdir -p "$HOME_DIR/.nexstream"
if ! pgrep -f "keepalive-ytdlp.sh" >/dev/null 2>&1; then
  echo "[ensure] watchdog dead; relaunching $(date)" \
    >> "$HOME_DIR/.nexstream/ensure.log"
  setsid nohup "$WATCHDOG" >> "$HOME_DIR/.nexstream/ytdlp-keepalive.log" 2>&1 &
fi
