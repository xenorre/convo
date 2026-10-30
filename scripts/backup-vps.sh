#!/usr/bin/env bash
# Backs up Convo on the VPS: the database (mongodump) and the uploaded files.
# deploy.sh puts it in ~/apps/convo on the server; cron runs it daily:
#   15 3 * * * $HOME/apps/convo/backup-vps.sh >> $HOME/apps/convo/backups/backup.log 2>&1
# Each run is one folder, kept for RETENTION_DAYS. Restoring is described in
# DEPLOYMENT.md.
set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-80}"
MONGO_CONTAINER=convo-db
UPLOADS_VOLUME=convo-uploads
APP_IMAGE=convo:latest

now() { date '+%Y-%m-%dT%H:%M:%S%z'; }

[[ "$RETENTION_DAYS" =~ ^[0-9]+$ && "$DISK_WARN_PERCENT" =~ ^[0-9]+$ ]] || {
  echo "RETENTION_DAYS and DISK_WARN_PERCENT must be numbers" >&2
  exit 1
}
[[ "$(docker inspect --format '{{.State.Health.Status}}' "$MONGO_CONTAINER" 2>/dev/null)" == healthy ]] || {
  echo "$(now) $MONGO_CONTAINER is not running and healthy; nothing backed up" >&2
  exit 1
}

STAMP="$(date +%Y-%m-%d_%H%M%S)"
RUN_DIR="$BACKUP_DIR/$STAMP"
# Written under a temporary name, so an interrupted run never looks complete.
PARTIAL="$RUN_DIR.partial"
mkdir -p "$PARTIAL"
trap 'rm -rf -- "$PARTIAL"' EXIT

# The credentials are already in the container's environment, so they never
# appear in this script, cron or the host's process list.
docker exec "$MONGO_CONTAINER" sh -c 'exec mongodump --quiet \
  --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin --db convo --archive --gzip' > "$PARTIAL/convo-db.archive.gz"

# The app image has tar; no other image is needed.
docker run --rm --network none --volume "$UPLOADS_VOLUME:/data:ro" --entrypoint tar "$APP_IMAGE" \
  -czf - -C /data . > "$PARTIAL/uploads.tar.gz"

mv -- "$PARTIAL" "$RUN_DIR"

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime "+$RETENTION_DAYS" -exec rm -rf -- {} +

echo "$(now) Backup done: $RUN_DIR ($(du -sh "$RUN_DIR" | cut -f1))"

# Uploads and backups share the disk with the other apps; say so in time.
USED="$(df -P "$BACKUP_DIR" | awk 'NR == 2 { sub("%", "", $5); print $5 }')"
if (( USED >= DISK_WARN_PERCENT )); then
  echo "$(now) WARNING: the disk is ${USED}% full" >&2
fi
