#!/usr/bin/env bash
set -euo pipefail

# no root workspace — each folder keeps own package-lock.json, so per-service
# docker/cloudflare deploys stay isolated.
#
# termux: libsql declares os darwin,linux,win32 → npm EBADPLATFORM on android.
# mocked at runtime there (termux-shim.js), so --force just downgrades check to warning.
# detect via process.platform, not uname — uname reports GNU/Linux on termux, npm doesn't.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

backend_flags=""
if node -e 'process.exit(process.platform === "android" ? 0 : 1)' 2>/dev/null; then
  backend_flags="--force"
fi

echo "→ web/shared"
(cd "$ROOT/web/shared" && npm install)
echo "→ web/backend${backend_flags:+ ($backend_flags)}"
(cd "$ROOT/web/backend" && npm install $backend_flags)
echo "→ web/frontend"
(cd "$ROOT/web/frontend" && npm install)
echo "✅ web deps installed"
