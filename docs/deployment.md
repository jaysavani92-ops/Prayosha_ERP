# Deployment

Audience: the person deploying and operating Prayosha in production. Local development is covered in `README.md`; nothing in `docker-compose.yml` is a production topology.

## Option A — single Linux VPS (initial deployment)

**Not highly available.** One machine runs Caddy, the API (2 replicas), the worker, MongoDB and Redis. If the VPS or its disk fails, the service is down until a replacement is restored from backup. This is acceptable only together with tested off-site backups (`docs/backup-and-restore.md`).

Starting size is a guess until measured: 4 vCPU / 8 GB RAM / SSD sized at 3× expected data plus backups headroom. Resize from `docs/performance-testing.md` results and the metrics in production, not from this line.

### 1. Server baseline (Ubuntu 24.04 LTS)

```bash
# as root, once
adduser deploy && usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh   # add your public key to authorized_keys

# /etc/ssh/sshd_config.d/10-hardening.conf
#   PasswordAuthentication no
#   PermitRootLogin no
#   KbdInteractiveAuthentication no
#   AllowUsers deploy
systemctl reload ssh

apt update && apt install -y unattended-upgrades fail2ban chrony ufw age awscli
dpkg-reconfigure -plow unattended-upgrades

ufw default deny incoming && ufw default allow outgoing
ufw allow from <your-office-ip>/32 to any port 22 proto tcp   # or `ufw limit 22/tcp`
ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw enable
```

Install Docker Engine + Compose plugin from Docker's apt repository. **Docker-published ports bypass UFW**; this is why `docker-compose.prod.yml` publishes only Caddy's 80/443. Never add `ports:` to `mongo` or `redis`. Use the provider's cloud firewall as a second layer with the same rules.

### 2. Layout

```bash
sudo install -d -o deploy -g deploy /opt/prayosha /srv/prayosha/mongo /srv/prayosha/redis
sudo chown 999:999 /srv/prayosha/mongo /srv/prayosha/redis   # mongo/redis container users
# copy: docker-compose.prod.yml, docker-compose.monitoring.yml, docker/, scripts/
```

Put `/srv/prayosha` on a separate block volume if the provider offers one (snapshots, resizing, survives instance rebuild).

### 3. Secrets: `/opt/prayosha/.env.production` (chmod 600)

Start from `.env.example`. Production values that differ:

```dotenv
NODE_ENV=production
TRUST_PROXY=1
CORS_ORIGINS=https://app.example.com
API_DOMAIN=api.example.com
ACME_EMAIL=ops@example.com
API_IMAGE=ghcr.io/<org>/prayosha-api:<tag>
REFRESH_COOKIE_SECURE=true
MONGODB_URI=mongodb://prayosha_app:<pw>@mongo:27017/prayosha?authSource=prayosha
MONGODB_MIGRATION_URI=mongodb://prayosha_migrator:<pw>@mongo:27017/prayosha?authSource=prayosha
REDIS_URL=redis://:<pw>@redis:6379
S3_BUCKET=<bucket>
S3_REGION=<region>
# unset S3_ENDPOINT / S3_FORCE_PATH_STYLE for AWS
METRICS_TOKEN=<openssl rand -hex 32>
MONGO_WT_CACHE_GB=2        # ~40% of RAM left after API/worker/Redis limits
REDIS_MAXMEMORY=256mb
```

Generate each secret with `openssl rand -base64 48`. Enter them with an editor, not `echo` (shell history).

### 4. AWS S3

Bucket (same region as the VPS if possible):

- Block Public Access: all four on. Object Ownership: Bucket owner enforced (ACLs disabled). Default encryption: SSE-S3.
- Lifecycle: abort incomplete multipart uploads after 1 day.
- CORS:

```json
[
  {
    "AllowedOrigins": ["https://app.example.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type", "if-none-match", "x-amz-checksum-sha256"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 600
  }
]
```

IAM policy for the API/worker principal (nothing else):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<bucket>/uploads/*"
    }
  ]
}
```

Credentials: on EC2 use an instance profile (no keys on disk). On a non-AWS VPS use IAM Roles Anywhere, or a dedicated IAM user whose keys live only in `.env.production` and are rotated every 90 days. Clients never receive credentials.

Optional CloudFront for downloads: origin = bucket with Origin Access Control, bucket policy granting `s3:GetObject` to that distribution only, signed URLs/cookies for private files (or a public `public/` prefix if public images are ever needed). Not required for local development or initially.

### 5. First start

```bash
cd /opt/prayosha
docker compose -f docker-compose.prod.yml --env-file .env.production up -d mongo redis
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps api node dist/database/scripts/migrate.js
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps -it \
  -e OWNER_USERNAME=<name> -e OWNER_DISPLAY_NAME="<Full Name>" api node dist/database/scripts/create-owner.js
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
curl -fsS https://api.example.com/health/ready
```

The MongoDB init script creates users only when the data directory is empty. Changing `MONGO_*_PASSWORD` later requires `db.changeUserPassword()` in `mongosh`.

### 6. Deploy a new version

CI builds and pushes an immutable tag (never deploy `latest`). Then on the VPS:

```bash
REGISTRY_IMAGE=ghcr.io/<org>/prayosha-api API_DOMAIN=api.example.com scripts/ops/deploy.sh 1.4.2
```

`deploy.sh` pulls, runs migrations and index verification, recreates `api` and `worker` (waiting for health checks), verifies readiness through Caddy and records the previous image. Compose has no rolling update: replicas are recreated, and Caddy retries failed connections for 5 s, so expect a few seconds of elevated latency. For zero-downtime on a single host use `docker rollout` (wowu/docker-rollout) or move to Option B.

Graceful shutdown on each container stop: readiness fails → Caddy stops routing (≤ 5 s health interval) → in-flight requests finish → keep-alive connections close → MongoDB/Redis connections close. `stop_grace_period: 35s` > `SHUTDOWN_TIMEOUT_MS` (25 s).

### 7. Rollback

```bash
scripts/ops/rollback.sh
```

Reverts the image only. Migrations are expand-only, so the previous version runs against the newer schema. If a release ever needs a contract migration, ship it as a separate release after the code that stopped using the field has been running.

### 8. Backups and monitoring

- Nightly backup cron + monthly restore drill: `docs/backup-and-restore.md`.
- Optional Prometheus stack: `docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml --env-file .env.production up -d`, then `ssh -L 9090:127.0.0.1:9090 deploy@vps`. Route alerts (`docker/monitoring/alerts.yml`) to email/Slack via Alertmanager or Grafana. At minimum run an external uptime check on `/health/ready`.

### 9. Restart policies

All services `restart: unless-stopped`; Docker restarts crashed processes, and the API exits non-zero on fatal errors (unhandled rejection, startup failure) so it is restarted rather than left half-working. Enable Docker at boot (`systemctl enable docker`).

## Option A2 and Option B

See `docs/database-design.md` (database topology) and `docs/scaling-roadmap.md` (application tier). The application is already stateless; scaling out requires only config changes (MongoDB seed list, Redis URL, load balancer targets).

## Incident investigation

1. **Scope**: `curl /health/ready` through the proxy and on each replica (`docker compose exec api node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>r.text()).then(console.log)"`). Which checks are `down`?
2. **Correlate**: take the `requestId` from the client error (`error.requestId` or `X-Request-Id`) and `docker compose logs api | grep <id>`; logs are JSON (`| jq`).
3. **Metrics**: error rate and p95 by route, Mongo pool checkout failures, queue backlog, disk, memory (alerts dashboard).
4. **Dependencies**: `docker compose ps`, `docker compose logs --since 30m mongo redis`, `df -h`, `free -m`, `docker stats`.
5. **Mitigate** before diagnosing deeply: roll back a bad deploy; restart a wedged container; free disk (old images: `docker image prune`); disable an abusive client at the proxy.
6. **Record**: timeline, impact, root cause, follow-ups. Fix monitoring gaps that delayed detection.
