#!/bin/bash
proot-distro login debian -- bash -l -c 'cd "$1" && shift && coderabbit "$@"' -- "$PWD" "$@"
