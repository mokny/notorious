# Deployment

Notorious keeps all of its state in exactly two places: **one SQLite file** and **one directory of
uploaded files**. Both paths are configured via `DATABASE_PATH` and `FILES_DIR` in `.env`
(see `.env.example`). That is the entire "database" - there is no separate service to provision.

You can run it two ways: directly on the server with Node.js, or via Docker Compose. Both read the
same `.env` file and the same `data/` directory layout.

## Option A: Bare-metal Linux (systemd)

### First-time setup (scripted)

```bash
curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/install.sh | bash
```

No git required - this one-liner downloads the code as a tarball (via curl, falling back to wget) into
`./notorious` and runs the installer. It installs the latest published GitHub Release (see
"Versioning" below); if none has been published yet, it falls back to the tip of `main` and prints a
notice. `scripts/install.sh` does everything below in one pass:
checks/installs Node.js 20+ and (on Debian/Ubuntu) the build tools needed if `better-sqlite3`/`argon2`
have to compile from source, `npm install`, sets up `.env` (generates `SESSION_SECRET`, optionally a
VAPID key pair), builds, migrates, offers to create your first user account, and asks whether to
install a systemd service so the app starts on boot. It's safe to re-run. The rest of this section
explains what it does and how to do it by hand if you'd rather not run a script with `sudo`.

(If you'd rather work from a git clone - e.g. you want `git log`/`git pull` available on the server -
that still works: `git clone https://github.com/mokny/notorious.git && cd notorious &&
./scripts/install.sh` runs the exact same script.)

### First-time setup (manual)

```bash
git clone https://github.com/mokny/notorious.git
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

Self-registration through `/register` is disabled by default - create your first account from the
shell: `npm run create-user` (see the README for details - it prompts for email/name/password, or
accepts them as `--email=`/`--name=`/`--password=` flags for scripted use). Visit
`http://your-server:4000` (or put a reverse proxy in front of it, see below) to log in.

If you'd rather let people sign themselves up through `/register`, run `npm run enable-registration` -
takes effect immediately (it's a database setting, not an env var), no restart needed. Reverse it
with `npm run disable-registration`. Either way, inviting a specific email from **Settings -> Members**
always lets that person register to redeem the invite, regardless of this setting.

Two-factor authentication (TOTP, via any standard authenticator app) is available to every user
opt-in from **Settings -> Account**, off by default. To require it instance-wide - every user, new
or existing, is forced to set up an authenticator before they can use anything else - run
`npm run enable-2fa-requirement`. Same pattern as registration: takes effect immediately, no restart,
reversed with `npm run disable-2fa-requirement`. Since there's no email-based account recovery in
Notorious, each user gets 8 one-time backup codes when they set up 2FA - make sure that's communicated
if you turn the requirement on for a team.

Templates can make the server issue outbound HTTP requests (`http.get(...)`, `http.post(...)`, etc.
- see [TEMPLATES.md](TEMPLATES.md#outbound-http-requests)), off by default since it's a real SSRF
vector: a template author's `http.*(...)` call runs every time *anyone* views that page, including
anonymous share-link visitors. Enable with `npm run enable-template-http`, reverse with
`npm run disable-template-http` - same "database setting, takes effect immediately" pattern as
registration/2FA above. Only turn this on for instances where every workspace member with
template-edit access is trusted; see TEMPLATES.md's Security section for exactly what's guarded
against even when enabled.

### Audio/video calls (optional)

Calls (audio/video, screen sharing) are **off by default**. Media is relayed through Notorious's own
embedded [mediasoup](https://mediasoup.org/) SFU (selective forwarding unit) - every participant
connects only to the server, never to each other - reachable over a single fixed TCP port. No TURN
server, no coturn, no third-party relay service, no UDP port range, no data leaving your own server.
The trade-off for "one boring port to forward, nothing else to configure" is that media always goes
over TCP, which can add a bit of latency/jitter under packet loss compared to a UDP-based setup - an
explicit simplicity-over-quality choice.

Set it up with the interactive wizard (no root needed - it only writes to `.env` and flips a database
flag, it doesn't touch the system):

```bash
npm run setup-calls --workspace=packages/server
```

It tries to auto-detect your server's public IP (asks you to confirm/override), prompts for a TCP
port (default `4001`), writes `MEDIA_ANNOUNCED_IP`/`MEDIA_PORT` into `.env`, and finally enables
calls. The one thing it *can't* do for you: **forwarding that one TCP port from your router to this
machine.** The wizard prints the exact port to forward and won't enable calls until you confirm
you've done it - without this, calls will fail (or only work between devices already on the same
local network) no matter how correctly everything else is configured.

Since `setup-calls` writes new `.env` values, restart the app afterward so it picks them up:
`systemctl restart notorious` (or however you run it under Docker Compose).

Once configured, you can toggle the feature on/off later without redoing any of that:
`npm run enable-calls` / `npm run disable-calls` - same "database setting, takes effect immediately,
no restart needed" pattern as registration/2FA/template-HTTP above.

AI features (Agent Chat, MCP server) need no instance-wide setup - each user brings their own AI
provider API key, configured from **Settings -> AI**, encrypted at rest the same way TOTP secrets
are. There's nothing to enable/disable here; a user simply hasn't configured one until they choose
to. See [MCP.md](MCP.md) for connecting an external MCP client.

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

### Updating

```bash
cd /opt/notorious
curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/update.sh | bash -s -- --channel=release
```

`--channel` is required - `release` updates to the latest published GitHub Release (falling back to
`main` with a notice if none exists yet); `nightly` always updates to the tip of `main`:

```bash
curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/update.sh | bash -s -- --channel=nightly
```

No git required, either - `scripts/update.sh` downloads the latest code as a tarball and syncs it in
(`.env` and `data/` are untouched - neither is part of the download), runs `npm install`, rebuilds, runs
any pending migrations, and restarts the systemd service if `install.sh` set one up. Before downloading
anything it compares the remote channel's `package.json` version against the local one and refuses to
run if that would be a downgrade (exits with an error), and exits immediately with "already up to date"
if the versions match. Equivalent by hand (release channel, substitute the tag you want):

```bash
cd /opt/notorious
curl -fsSL https://github.com/mokny/notorious/archive/refs/tags/vX.Y.0.tar.gz | tar xz --strip-components=1
npm install            # picks up any new/updated dependencies
npm run build
npm run migrate
sudo systemctl restart notorious
```

### Uninstalling

```bash
cd /opt/notorious
./scripts/uninstall.sh
```

Stops and removes the systemd service (if `install.sh` set one up), then removes the project
directory. Asks separately (default: no) whether to keep your data (`data/notorious.db` +
`data/files/`) - answering yes moves it to `~/notorious-data-backup/` before the project directory is
deleted, so nothing is lost by an accidental default. Leaves Node.js, any NodeSource apt repo, and
build tools `install.sh` may have installed untouched, since other software on the machine may depend
on them.

### Auto-Update

The admin panel's Update tab (`/admin` -> Update) can also schedule unattended updates: pick a
channel (`nightly`/`release`), a daily local-server time, and - on a systemd install without
passwordless `sudo` configured - a sudo password (stored encrypted at rest, see
`modules/admin/sudoCrypto.ts`, never exposed back to the browser). Once a day at the configured time
the server checks the chosen channel and, if a newer non-downgrade version is available, runs the same
update flow `scripts/update.sh` uses and restarts the service. Every attempted auto-update (success or
failure) is logged to the update history and triggers a Web Push notification to every server admin;
a check that finds nothing new logs nothing.

Migrations are additive and tracked in a `_migrations` table (see `packages/server/src/db/migrate.ts`),
so re-running them is always safe - already-applied migrations are skipped.

If you deployed from a git clone and would rather keep using `git pull` yourself, that still works
fine too - the scripts just no longer require it.

### Reverse proxy (nginx, for HTTPS + a real domain)

See **[docs/NGINX.md](NGINX.md)** for the full walkthrough, both via a UI (Nginx Proxy Manager) and
via plain config files - including the WebSocket upgrade headers the `/ws` realtime endpoint needs,
and the upload size limit nginx's 1MB default would otherwise silently enforce ahead of the app.

Web Push requires the app to be served over HTTPS (except on `localhost`), so a reverse proxy with a
real TLS certificate is required before push notifications will work from outside your LAN.

Once HTTPS is actually in place, set `COOKIE_SECURE=true` in `.env` and restart. Leave it `false`
(the default) until then - browsers silently drop a `Secure` cookie sent over plain HTTP, which
breaks login, not just push notifications.

Also set `APP_ORIGIN` to the exact public URL you're serving the app on (e.g.
`https://notes.example.com`, no trailing slash) if you want passkeys (Settings > Security)
available - they're off entirely until this is set, with no fallback to `WEB_ORIGIN`/localhost:
a passkey cryptographically binds to the origin it was registered under, so silently falling back
to the wrong one would just mean passkeys stop working the moment you move to a real domain.
Restart the app after setting it. (`install.sh` offers to set this for you if you already know your
domain at install time; if not, or you skipped it, set it here by hand once HTTPS is live.)

## Option B: Docker Compose

```bash
cp .env.example .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d --build
```

This builds a single image (multi-stage: compiles all three packages, then a slim runtime layer) and
runs it with a named volume (`notorious-data`) mounted at `/app/data` - that volume is exactly the
SQLite file + uploaded files, so backing up the volume backs up everything.

Unlike bare-metal, the container does not automatically inherit the host's timezone - it defaults to
UTC unless `TZ` is set (see `.env.example`, default `Europe/Berlin`). This matters for the scheduled
auto-update time in the Admin settings (a plain `HH:MM` compared against the container's local time),
so set `TZ` to your actual timezone or auto-update will silently fire at the wrong hour.

Self-registration through `/register` is disabled by default - create your first account from the
shell instead:

```bash
docker compose exec notorious node packages/server/dist/scripts/createUser.js \
  --email=you@example.com --name="Your Name" --password=a-strong-password
```

To let people sign themselves up through `/register` instead, enable it (takes effect immediately,
no restart needed):

```bash
docker compose exec notorious node packages/server/dist/scripts/setRegistration.js --enable
```

### Updating

```bash
git pull
docker compose up -d --build
```

### Audio/video calls

`npm run setup-calls` (see the bare-metal section above) works fine under Docker Compose too - it
only writes `.env` and a database flag, nothing system-level. Set `MEDIA_ANNOUNCED_IP`/`MEDIA_PORT`
in `.env` (either via the wizard run inside the container, or by hand), publish that one TCP port on
the container (`ports: ["4001:4001/tcp"]` in `docker-compose.yml`, matching whatever `MEDIA_PORT` you
chose) and forward it from your router, then
`docker compose exec notorious node packages/server/dist/scripts/setCalls.js --enable`.

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

## Build memory requirements

`npm run build` (specifically the frontend's `vite build`, which bundles Mermaid and its
diagram-layout dependencies, plus Excalidraw for the whiteboard object/block) needs roughly 2-3GB
of free RAM/swap on a small VPS. `install.sh` and
`update.sh` already run the build with `NODE_OPTIONS=--max-old-space-size=2048`, since V8 sometimes
auto-detects a conservative default heap ceiling (well under 1GB) on small VMs that in practice have
more RAM or swap available than that - if you run `npm run build` by hand, do the same:

```bash
NODE_OPTIONS=--max-old-space-size=2048 npm run build
```

If it still gets killed with "JavaScript heap out of memory" (or a lower-level "process out of
memory" once V8 itself has more room to ask for), the box genuinely doesn't have enough physical
RAM+swap for the build. Either add a swap file:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

or build on a machine with more RAM and copy over `packages/web/dist` (and `packages/server/dist`,
`packages/shared/dist`) instead of building on the server at all.
