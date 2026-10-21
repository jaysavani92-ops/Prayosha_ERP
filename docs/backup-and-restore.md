# Backup and restore

Audience: the operator responsible for production data.

A backup that has never been restored is not a backup. The restore drill below is part of the job, not optional.

## What is backed up

| Data                           | Where                           | Method                                                                                                    | Frequency       |
| ------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------- |
| MongoDB (all application data) | `/srv/prayosha/mongo`           | `mongodump --archive --gzip` → `age` encryption → off-site S3 bucket                                      | nightly (02:15) |
| MongoDB volume                 | provider block storage          | provider snapshot of the volume                                                                           | daily, keep 7   |
| Uploaded files                 | AWS S3                          | S3 durability; optionally enable versioning + replication to a second region                              | continuous      |
| Redis                          | `/srv/prayosha/redis` (AOF)     | not backed up: holds rate limits, cache and transient jobs; lost jobs are re-created by the cleanup sweep | —               |
| Config & secrets               | `/opt/prayosha/.env.production` | **[action]** copy into the team password manager                                                          | on change       |

**Targets (Option A):** RPO ≤ 24 h (nightly dump; shorter with provider snapshots or more frequent dumps), RTO a few hours (provision VPS, restore, DNS). Standalone `mongodump` is not a point-in-time snapshot across collections under concurrent writes; for strict consistency, take the dump while writes are paused or move to a replica set (`--oplog`) in Option B.

## Setup

1. **Off-site bucket**: in a different AWS account or at least a different region from the uploads bucket. Enable versioning and Object Lock (governance mode, 30 days) so a compromised server cannot delete backups. Lifecycle: transition to Glacier Instant Retrieval after 30 days, expire after 180 days (adjust to your retention policy).
2. **Backup IAM principal**: `s3:PutObject` on `arn:aws:s3:::<backup-bucket>/mongo/*` only. No `GetObject`/`DeleteObject` on the server.
3. **Encryption key**: `age-keygen -o prayosha-backup.key` on an administrator's machine. Put the **public** key (`age1…`) on the server as `BACKUP_AGE_RECIPIENT`. Store the private key in the password manager and offline. Without it backups cannot be read — by an attacker or by you.
4. **Config** `/etc/prayosha/backup.env` (chmod 600):

```bash
MONGO_BACKUP_URI='mongodb://prayosha_backup:<pw>@127.0.0.1:27017/?authSource=admin'
BACKUP_S3_URI='s3://prayosha-backups-offsite/mongo'
BACKUP_AGE_RECIPIENT='age1...'
COMPOSE_FILE=/opt/prayosha/docker-compose.prod.yml
TEXTFILE_DIR=/var/lib/node_exporter/textfile
```

5. **Schedule** (`crontab -e` as `deploy`):

```cron
15 2 * * * set -a; . /etc/prayosha/backup.env; set +a; /opt/prayosha/scripts/backup/mongo-backup.sh >> /var/log/prayosha/backup.log 2>&1
```

6. **Alerting**: the script writes `prayosha_backup_last_success_timestamp_seconds`; alert `BackupMissing` fires after 26 h without success. Without the monitoring stack, use a dead-man's-switch service (e.g. Healthchecks.io) pinged at the end of the script.

## Restore drill (monthly)

From an administrator machine or the server, with the private key available only for the duration of the drill:

```bash
export BACKUP_S3_URI=s3://prayosha-backups-offsite/mongo   # credentials with GetObject (admin, not the server's)
export AGE_IDENTITY_FILE=~/secure/prayosha-backup.key
export MONGO_RESTORE_URI='mongodb://root:<pw>@127.0.0.1:27017/?authSource=admin'
aws s3 ls "$BACKUP_S3_URI/" | tail -3
scripts/backup/mongo-restore.sh 20261021T021500Z
```

This restores into `prayosha_restore_check` (the live database is untouched) and prints document counts. Compare with production (`db.users.estimatedDocumentCount()` etc.), spot-check a few recent records, then `db.getSiblingDB('prayosha_restore_check').dropDatabase()`. Record date, backup used, duration and result in the ops log.

## Disaster recovery (host lost)

1. Provision a new VPS (`docs/deployment.md` §1–3) with the same `.env.production` from the password manager.
2. Start `mongo` and `redis` only. The init script creates users on the empty volume.
3. Restore: `scripts/backup/mongo-restore.sh <latest-stamp> --replace-live-db` (prompts for confirmation; api/worker must be stopped).
4. `migrate.js` and `verify-indexes.js` (indexes are rebuilt on restore; this confirms them).
5. Start `api`, `worker`, `caddy`; update DNS if the IP changed; verify `/health/ready` and log in.
6. Uploads in S3 are unaffected. Records created after the backup are lost; S3 objects uploaded in that window become orphans (harmless; can be listed and removed later).

## Single-collection or point-in-time mistakes

To recover one collection (e.g. an accidental bulk update) restore the drill database, then copy the needed documents back with `mongosh` after review. Never `--drop` the live database for a partial recovery.
