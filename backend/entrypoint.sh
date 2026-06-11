#!/usr/bin/env bash
set -e

# optional residential egress to bypass blocks
if [ -n "${TS_AUTHKEY:-}" ]; then
  echo "[tailscale] starting userspace daemon..."
  /usr/sbin/tailscaled \
    --tun=userspace-networking \
    --socket=/tmp/tailscaled.sock \
    --statedir=/tmp/ts-state \
    --outbound-http-proxy-listen=localhost:1055 \
    --socks5-server=localhost:1056 >/tmp/tailscaled.log 2>&1 &

  for _ in $(seq 1 20); do
    [ -S /tmp/tailscaled.sock ] && break
    sleep 0.5
  done

  UP_ARGS=(--authkey="${TS_AUTHKEY}" --hostname="${TS_HOSTNAME:-koyeb-nexstream}")
  if [ -n "${TS_EXIT_NODE:-}" ]; then
    UP_ARGS+=(--exit-node="${TS_EXIT_NODE}" --exit-node-allow-lan-access)
  fi

  if tailscale --socket=/tmp/tailscaled.sock up "${UP_ARGS[@]}"; then
    echo "[tailscale] up; YT_PROXY -> exit node ${TS_EXIT_NODE:-<none>}"
    # bypass throttle via residential exit node
    export YT_PROXY="${YT_PROXY:-http://localhost:1055}"
    echo "[tailscale] egress test (http-proxy 1055):"
    curl -s --max-time 20 -x http://localhost:1055 https://api.ipify.org \
      || echo "[tailscale] http-proxy egress FAILED (timeout/refused)"
    echo
    echo "[tailscale] egress test (socks5 1056):"
    curl -s --max-time 20 --socks5-hostname localhost:1056 https://api.ipify.org \
      || echo "[tailscale] socks5 egress FAILED (timeout/refused)"
    echo
  else
    echo "[tailscale] 'up' failed; continuing WITHOUT residential egress"
  fi
  tailscale --socket=/tmp/tailscaled.sock status || true
fi

exec "$@"
