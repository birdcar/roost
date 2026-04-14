#!/bin/bash
set -e
cd "$(dirname "$0")/.."
bun run build
wrangler deploy
