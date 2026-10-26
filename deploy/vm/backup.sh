#!/usr/bin/env bash
# Nightly backup of SQLite + photos into ./backups (keeps 14). crontab: 0 3 * * * /opt/math-sprout/backup.sh
set -euo pipefail
cd /opt/math-sprout
STAMP=$(date +%F)
mkdir -p backups
sudo docker run --rm -v "$PWD/data:/data:ro" -v "$PWD/backups:/backups" alpine:3 sh -c "
  apk add --no-cache sqlite >/dev/null &&
  sqlite3 /data/math-sprout.db '.backup /tmp/math-sprout.db' &&
  tar czf /backups/math-sprout-$STAMP.tgz -C /tmp math-sprout.db -C /data uploads 2>/dev/null || tar czf /backups/math-sprout-$STAMP.tgz -C /tmp math-sprout.db"
ls -t backups/*.tgz | tail -n +15 | xargs -r rm -f
echo "backup written: backups/math-sprout-$STAMP.tgz"
