# Deployment

Notorious keeps all of its state in exactly two places: **one SQLite file** and **one directory of
uploaded files**. Both paths are configured via `DATABASE_PATH` and `FILES_DIR` in `.env`
(see `.env.example`). That is the entire "database" - there is no separate service to provision.

You can run it two ways: directly on the server with Node.js (what you `git pull` and update), or
via Docker Compose. Both read the same `.env` file and the same `data/` directory layout.

## Option A: Bare-metal Linux (git pull + systemd)

### First-time setup (scripted)

```bash
git clone <your-repo-url> notorious
cd notorious
./scripts/install.sh
```

`scripts/install.sh` does everything below in one pass: checks/installs Node.js 20+ and (on
Debian/Ubuntu) the build tools needed if `better-sqlite3`/`argon2` have to compile from source,
`npm install`, sets up `.env` (generates `SESSION_SECRET`, optionally a VAPID key pair), builds,
migrates, offers to create your first user account, and asks whether to install a systemd service so
the app starts on boot. It's safe to re-run. The rest of this section explains what it does and how
to do it by hand if you'd rather not run a script with `sudo`.

### First-time setup (manual)

```bash
git clone <your-repo-url> notorious
cd notorious
npm install
cp .env.example .env
```

Edit `.env`:

- `SESSION_SECRET` - generate with `openssl rand -hex 32`
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` - generate with
  `npm run generate-vapid-keys --workspace=packages/server` (only needed for push notifications)
- `DATABASE_PATH` / `FILES_DIR` - defaults are fine; point them at a persistent path outside the repo
  if you'd rather keep data separate from the checked-out code (e.g. `/var/lib/notorious/notorious.db`)

```bash
npm run build          # compiles shared -> server -> web
npm run migrate        # creates the SQLite schema
npm run start:prod     # runs pending migrations, then starts the server on $PORT (serves the web app too)
```

Visit `http://your-server:4000` (or put a reverse proxy in front of it, see below), and either register
your own account via the `/register` page, or create one from the shell: `npm run create-user` (see
the README for details - it prompts for email/name/password, or accepts them as
`--email=`/`--name=`/`--password=` flags for scripted use).

### Running it as a systemd service

`scripts/install.sh` writes and enables this unit for you if you answer "yes" to the boot-start
prompt. To do it by hand:

`/etc/systemd/system/notorious.service`:

```ini
[Unit]
Description=Notorious
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/notorious
EnvironmentFile=/opt/notorious/.env
ExecStart=/usr/bin/npm run start:prod
Restart=on-failure
User=notorious

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now notorious
```

### Updating (git pull workflow)

```bash
cd /opt/notorious
./scripts/update.sh
```

`scripts/update.sh` pulls the latest code, runs `npm install`, rebuilds, runs any pending migrations,
and restarts the systemd service if `install.sh` set one up (it warns and asks for confirmation first
if it finds uncommitted local changes). Equivalent by hand:

```bash
cd /opt/notorious
git pull
npm install            # picks up any new/updated dependencies
npm run build
npm run migrate
sudo systemctl restart notorious
```

Migrations are additive and tracked in a `_migrations` table (see `packages/server/src/db/migrate.ts`),
so re-running them is always safe - already-applied migrations are skipped.

### Reverse proxy (nginx example, for HTTPS + a real domain)

```nginx
server {
    listen 443 ssl;
    server_name notes.example.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;   # required for the /ws WebSocket endpoint
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Web Push requires the app to be served over HTTPS (except on `localhost`), so a reverse proxy with a
real TLS certificate is required before push notifications will work from outside your LAN.

## Option B: Docker Compose

```bash
cp .env.example .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d --build
```

This builds a single image (multi-stage: compiles all three packages, then a slim runtime layer) and
runs it with a named volume (`notorious-data`) mounted at `/app/data` - that volume is exactly the
SQLite file + uploaded files, so backing up the volume backs up everything.

Register your first account through the `/register` page, or create one from the shell without going
through the browser:

```bash
docker compose exec notorious node packages/server/dist/scripts/createUser.js \
  --email=you@example.com --name="Your Name" --password=a-strong-password
```

### Updating

```bash
git pull
docker compose up -d --build
```

## Backups

**Whole-instance backup** (disaster recovery): stop the app (or just accept a brief window of
in-flight writes) and copy `data/notorious.db*` and `data/files/`. That's the entire state.

```bash
tar -czf notorious-backup-$(date +%F).tar.gz data/notorious.db data/files
```

**Per-workspace backup** (the in-app feature): a workspace owner can download a ZIP from
**Settings -> Backup** (or `GET /api/v1/workspaces/:id/backup`) containing that workspace's schema,
objects, blocks, relations, views and files. Restoring a ZIP (**Settings -> Backup -> Restore**, or
`POST /api/v1/workspaces/import`) always creates a **new** workspace - it never overwrites an
existing one, so restoring is always non-destructive.

## Environment variables

See `.env.example` for the full list with defaults. The only one without a safe default is
`SESSION_SECRET`, which must be set to a random value in any real deployment.
