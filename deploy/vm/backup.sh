#!/usr/bin/env bash
# Nightly backup of SQLite + photos. crontab: 0 3 * * * /opt/math-sprout/backup.sh
set -euo pipefail
cd /opt/math-sprout
STAMP=$(date +%F)
mkdir -p backups
# Consistent SQLite snapshot via the sqlite3 CLI inside a throwaway container.
docker run --rm -v "$PWD/data:/data" alpine:3 sh -c \
  "apk add --no-cache sqlite >/dev/null && sqlite3 /data/math-sprout.db \".backup /data/backup-$STAMP.db\""
tar czf "backups/math-sprout-$STAMP.tgz" -C data "backup-$STAMP.db" uploads
rm -f "data/backup-$STAMP.db"
ls -t backups/*.tgz | tail -n +15 | xargs -r rm -f   # keep 14 days
echo "backup written: backups/math-sprout-$STAMP.tgz"
