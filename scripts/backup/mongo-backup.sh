#!/usr/bin/env bash
# Nightly MongoDB backup -> encrypted -> off-site object storage.
# Run from the VPS via cron/systemd timer (see docs/backup-and-restore.md):
#   15 2 * * *  /opt/prayosha/scripts/backup/mongo-backup.sh >> /var/log/prayosha-backup.log 2>&1
#
# Requires on the host: docker, age (https://age-encryption.org), aws CLI v2
# configured with a backup-only IAM principal (PutObject on the backup prefix).
#
# Environment (from /etc/prayosha/backup.env, chmod 600):
#   MONGO_BACKUP_URI      mongodb://prayosha_backup:...@127.0.0.1:27017/?authSource=admin
#   BACKUP_S3_URI         s3://prayosha-backups-offsite/mongo   (different account/region from uploads)
#   BACKUP_AGE_RECIPIENT  age1...  (public key; the private key is NOT stored on the server)
#   COMPOSE_FILE          /opt/prayosha/docker-compose.prod.yml
#   TEXTFILE_DIR          /var/lib/node_exporter/textfile (optional, for alerting)
set -Eeuo pipefail

: "${MONGO_BACKUP_URI:?}" "${BACKUP_S3_URI:?}" "${BACKUP_AGE_RECIPIENT:?}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/prayosha/docker-compose.prod.yml}"
TEXTFILE_DIR="${TEXTFILE_DIR:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORKDIR="$(mktemp -d /var/tmp/prayosha-backup.XXXXXX)"
ARCHIVE="${WORKDIR}/mongo-${STAMP}.archive.gz"
trap 'rm -rf "${WORKDIR}"' EXIT

write_metric() {
  [[ -n "${TEXTFILE_DIR}" ]] || return 0
  local tmp="${TEXTFILE_DIR}/prayosha_backup.prom.$$"
  {
    echo "# HELP prayosha_backup_last_success_timestamp_seconds Unix time of the last successful backup"
    echo "# TYPE prayosha_backup_last_success_timestamp_seconds gauge"
    echo "prayosha_backup_last_success_timestamp_seconds $1"
    echo "prayosha_backup_last_size_bytes $2"
  } > "${tmp}"
  mv "${tmp}" "${TEXTFILE_DIR}/prayosha_backup.prom"
}

echo "[$(date -u +%FT%TZ)] backup start ${STAMP}"

# Free-space guard: the dump is written to local disk before upload.
avail_kb=$(df --output=avail -k /var/tmp | tail -1)
if (( avail_kb < 2 * 1024 * 1024 )); then
  echo "less than 2 GiB free in /var/tmp; aborting" >&2
  exit 1
fi

# mongodump runs inside the mongo container (same version as the server).
# --archive streams to stdout; nothing is written inside the container.
docker compose -f "${COMPOSE_FILE}" exec -T -e MONGO_BACKUP_URI mongo \
  sh -c 'mongodump --uri="$MONGO_BACKUP_URI" --archive --gzip --quiet' > "${ARCHIVE}"

size=$(stat -c %s "${ARCHIVE}")
if (( size < 1024 )); then
  echo "archive suspiciously small (${size} bytes); aborting" >&2
  exit 1
fi

# Integrity check before encrypting (the whole --archive --gzip stream is gzip).
gzip -t "${ARCHIVE}"

age -r "${BACKUP_AGE_RECIPIENT}" -o "${ARCHIVE}.age" "${ARCHIVE}"
sha256sum "${ARCHIVE}.age" | awk '{print $1}' > "${ARCHIVE}.age.sha256"

aws s3 cp --only-show-errors "${ARCHIVE}.age" "${BACKUP_S3_URI}/${STAMP}.archive.gz.age"
aws s3 cp --only-show-errors "${ARCHIVE}.age.sha256" "${BACKUP_S3_URI}/${STAMP}.archive.gz.age.sha256"

write_metric "$(date +%s)" "${size}"
echo "[$(date -u +%FT%TZ)] backup ok ${STAMP} (${size} bytes before encryption)"
