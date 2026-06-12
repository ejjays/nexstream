#!/data/data/com.termux/files/usr/bin/bash
# one-time: wake-lock + android auto-relaunch for the watchdog
ENSURE=/data/data/com.termux/files/home/nexstream/scripts/tunnels/ensure-ytdlp.sh

echo "[setup] installing termux-api package..."
pkg install -y termux-api >/dev/null 2>&1 || true

if ! command -v termux-job-scheduler >/dev/null 2>&1; then
  echo "[setup] FAILED: termux-api CLI missing. Run: pkg install termux-api"
  exit 1
fi

echo "[setup] testing Termux:API app (wake-lock)..."
if ! timeout 10 termux-wake-lock 2>/dev/null; then
  echo "[setup] the Termux:API APP is not installed/responding."
  echo "        install 'Termux:API' from F-Droid (same place as Termux:Boot),"
  echo "        then run this script again."
  exit 1
fi
echo "[setup] wake-lock OK."

echo "[setup] registering auto-relaunch job (15 min, persisted)..."
termux-job-scheduler --script "$ENSURE" --period-ms 900000 --persisted true

echo "[setup] pending jobs:"
termux-job-scheduler --pending
echo "[setup] done. the watchdog now auto-relaunches if android kills it."
