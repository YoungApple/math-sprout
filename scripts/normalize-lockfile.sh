#!/usr/bin/env bash
# Run after `npm install` on a Google cloudtop: npm there resolves through an internal mirror
# and writes those URLs into package-lock.json, which GitHub Actions cannot reach.
set -euo pipefail
cd "$(dirname "$0")/.."
sed -i.bak 's#http://airlock-proxy.uplink.goog:999/npm/artifact-foundry-prod/npm-3p-limited-internal-use/#https://registry.npmjs.org/#g' package-lock.json
rm -f package-lock.json.bak
grep -q airlock package-lock.json && { echo "lockfile still contains internal URLs"; exit 1; } || echo "lockfile OK"
