#!/usr/bin/env bash
set -euo pipefail

# no root workspace — each folder keeps own package-lock.json, so per-service
# docker/cloudflare deploys stay isolated.
#
# termux backend needs 2 android-only workarounds:
#   --force          libsql declares os darwin,linux,win32 → EBADPLATFORM. mocked at runtime.
#   --ignore-scripts re2 (+ other native addons) has no android prebuilt & no NDK to build;
#                    url-regex-safe falls back to RegExp, so app boots fine without it.
# detect via process.platform, not uname — uname reports GNU/Linux on termux, npm doesn't.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

backend_flags=""
if node -e 'process.exit(process.platform === "android" ? 0 : 1)' 2>/dev/null; then
  backend_flags="--force --ignore-scripts"
fi

echo "→ web/shared"
(cd "$ROOT/web/shared" && npm install)
echo "→ web/backend${backend_flags:+ ($backend_flags)}"
(cd "$ROOT/web/backend" && npm install $backend_flags)
echo "→ web/frontend"
(cd "$ROOT/web/frontend" && npm install)
echo "✅ web deps installed"
