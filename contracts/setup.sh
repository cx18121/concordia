#!/usr/bin/env bash
# Restore Foundry deps into lib/ (gitignored — ~90MB, too large to commit).
# Run once after cloning, then `forge build`.
set -e
cd "$(dirname "$0")"
TMP=$(mktemp -d)
echo "restoring Uniswap v4-template deps…"
forge init -t Uniswap/v4-template "$TMP" >/dev/null 2>&1
rm -rf lib && cp -r "$TMP/lib" ./lib
rm -rf "$TMP"
echo "done — now run: forge build"
