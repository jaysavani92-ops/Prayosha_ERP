#!/usr/bin/env bash
# Restore a backup produced by mongo-backup.sh.
#
# Default mode is a RESTORE DRILL: data is restored into a separate database
# (<db>_restore_check) so the live database is untouched. Run it monthly.
#
#   mongo-restore.sh 20261021T021500Z                       # drill
#   mongo-restore.sh 20261021T021500Z --replace-live-db     # real recovery (destructive)
#
# Needs the age PRIVATE key (kept offline / in a password manager), passed via
# AGE_IDENTITY_FILE, and MONGO_RESTORE_URI for a user allowed to restore
# (root, or a user with the `restore` role).
set -Eeuo pipefail

STAMP="${1:?usage: mongo-restore.sh <STAMP> [--replace-live-db]}"
MODE="${2:-drill}"
: "${BACKUP_S3_URI:?}" "${AGE_IDENTITY_FILE:?}" "${MONGO_RESTORE_URI:?}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/prayosha/docker-compose.prod.yml}"
DB_NAME="${MONGODB_DB_NAME:-prayosha}"
WORKDIR="$(mktemp -d /var/tmp/prayosha-restore.XXXXXX)"
trap 'rm -rf "${WORKDIR}"' EXIT

aws s3 cp --only-show-errors "${BACKUP_S3_URI}/${STAMP}.archive.gz.age" "${WORKDIR}/backup.age"
aws s3 cp --only-show-errors "${BACKUP_S3_URI}/${STAMP}.archive.gz.age.sha256" "${WORKDIR}/backup.age.sha256"
echo "$(cat "${WORKDIR}/backup.age.sha256")  ${WORKDIR}/backup.age" | sha256sum -c -

age -d -i "${AGE_IDENTITY_FILE}" -o "${WORKDIR}/backup.archive.gz" "${WORKDIR}/backup.age"

if [[ "${MODE}" == "--replace-live-db" ]]; then
  read -r -p "This DROPS and replaces database '${DB_NAME}'. Type the database name to continue: " answer
  [[ "${answer}" == "${DB_NAME}" ]] || { echo "aborted"; exit 1; }
  echo "Stop the api and worker first: docker compose -f ${COMPOSE_FILE} stop api worker"
  read -r -p "Have api and worker been stopped? (yes/no) " stopped
  [[ "${stopped}" == "yes" ]] || { echo "aborted"; exit 1; }
  docker compose -f "${COMPOSE_FILE}" exec -T -e MONGO_RESTORE_URI mongo \
    sh -c "mongorestore --uri=\"\$MONGO_RESTORE_URI\" --archive --gzip --drop --nsInclude='${DB_NAME}.*'" \
    < "${WORKDIR}/backup.archive.gz"
  echo "Restored ${DB_NAME}. Run 'npm run db:migrate' (indexes/validators) and 'npm run db:verify-indexes', then start api and worker."
else
  TARGET="${DB_NAME}_restore_check"
  docker compose -f "${COMPOSE_FILE}" exec -T -e MONGO_RESTORE_URI mongo \
    sh -c "mongorestore --uri=\"\$MONGO_RESTORE_URI\" --archive --gzip --drop --nsFrom='${DB_NAME}.*' --nsTo='${TARGET}.*'" \
    < "${WORKDIR}/backup.archive.gz"
  docker compose -f "${COMPOSE_FILE}" exec -T -e MONGO_RESTORE_URI mongo \
    mongosh "${MONGO_RESTORE_URI}" --quiet --eval "
      const d = db.getSiblingDB('${TARGET}');
      d.getCollectionNames().forEach(c => print(c.padEnd(24), d.getCollection(c).estimatedDocumentCount()));
    "
  echo "Drill restore into ${TARGET} complete. Compare counts with production, then drop ${TARGET}."
fi
