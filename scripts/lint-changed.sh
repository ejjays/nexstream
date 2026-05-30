#!/usr/bin/env bash
# skip unchanged files to save time
# maintain context with local config
# enable testing against arbitrary branches
set -eu

base="${1:-HEAD}"
globs=("*.ts" "*.tsx" "*.js" "*.jsx" "*.cjs" "*.mjs")

files="$(
  {
    git diff --name-only --relative --diff-filter=ACMR "$base" -- "${globs[@]}"
    git ls-files --others --exclude-standard -- "${globs[@]}"
  } | sort -u
)"

if [ -z "$files" ]; then
  echo "✓ lint:changed — no changed files"
  exit 0
fi

printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 npx --no-install eslint --no-warn-ignored
