# Notorious

A self-hosted, multi-user notes and knowledge base app.
object-based editing (Note, Project, Task, Person, Book, Meeting, Company, File, Database, Collection),
a block editor, six view types over the same data, full-text/fuzzy search, live sync across devices,
per-workspace ZIP backups, and Web Push notifications - all backed by a single SQLite file.

There are no pre-created accounts, and self-registration through the `/register` page is **disabled
by default** - create the first one from the shell with `npm run create-user` (see
[Creating user accounts](#creating-user-accounts)), or run `npm run enable-registration` if you'd
rather let people sign themselves up.

Want to run it yourself? Follow [Quick start](#quick-start-local-development) below for local
development, or [Installing on your own Linux server](#installing-on-your-own-linux-server) to deploy it.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - how the system is put together and why
- [docs/API.md](docs/API.md) - REST/WebSocket API reference (also available live at `/api/docs`)
- [docs/SCRIPTING.md](docs/SCRIPTING.md) - writing sandboxed per-object JavaScript, with examples
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - running this on your own Linux server, with or without Docker
- [docs/NGINX.md](docs/NGINX.md) - reverse proxy setup for a real domain + HTTPS, via a UI (Nginx Proxy Manager) or plain config files
- [docs/ROADMAP.md](docs/ROADMAP.md) - what's deliberately out of scope for this first pass, and why

## Tech stack

- **Monorepo**: npm workspaces (`packages/shared`, `packages/server`, `packages/web`)
- **Server**: Node.js, TypeScript, Fastify, better-sqlite3 + Drizzle ORM, WebSockets, Web Push, argon2
- **Frontend**: React, Vite, TanStack Query/Virtual, TipTap (block editor), Tailwind CSS, installable PWA
- **Storage**: one SQLite file + a `files/` directory - see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#backups)
  for why that makes backups trivial

## Quick start (local development)

Prerequisites: Node.js 20+ and npm. `better-sqlite3` and `argon2` contain native addons; on Linux you may
need `python3`, `make` and `g++` installed if no prebuilt binary matches your platform.

```bash
git clone https://github.com/mokny/notorious.git
cd notorious
npm install
cp .env.example .env
npm run migrate
npm run dev           # runs the API server (port 4000) and the Vite dev server (port 5173) together
```

Create your first account from the shell (self-registration is off by default):

```bash
npm run create-user --workspace=packages/server
```

Then open http://localhost:5173 and log in. (Prefer clicking through a sign-up form while developing?
`npm run set-registration --workspace=packages/server -- --enable` turns on `/register` instead - see
[Creating user accounts](#creating-user-accounts).)

Web Push notifications need a VAPID key pair. Generate one and put it in `.env`:

```bash
npm run generate-vapid-keys --workspace=packages/server
```

## Installing on your own Linux server

One line, no git required - downloads the code (via curl/wget) into `./notorious` and installs it:

```bash
curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/install.sh | bash
```

This installs missing system dependencies (Node.js and, on Debian/Ubuntu, the build tools better-
sqlite3/argon2 need if no prebuilt binary matches your platform), runs `npm install`, sets up `.env`
with a freshly generated `SESSION_SECRET` (and optionally a VAPID key pair for push notifications),
builds the app, runs the database migrations, and offers to create your first user account. At the
end it asks:

> Start Notorious automatically on system boot (systemd service, runs as user '...')? [Y/n]

Answer yes to install and enable a systemd unit (`/etc/systemd/system/notorious.service`) so the app
starts on boot and restarts if it crashes; answer no to start it yourself later with
`npm run start:prod`. The script is safe to re-run. (Already have a git clone and prefer that? `cd`
into it and run `./scripts/install.sh` directly - same script, same result.)

Whenever you want to update to the latest version, from inside that directory:

```bash
curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/update.sh | bash
```

This re-downloads the latest code as a tarball (`.env` and `data/` are untouched - neither is part of
the download), reinstalls dependencies, rebuilds, runs any pending migrations, and restarts the
systemd service if `install.sh` set one up (otherwise it tells you to restart manually).

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for what these scripts do under the hood, plus the fully
manual steps, reverse proxy/HTTPS setup, and backup instructions.

### Creating user accounts

Self-registration through the `/register` page is **disabled by default** - `install.sh` walks you
through creating your first account from the shell instead:

```bash
npm run create-user
```

Prompts for an email, name and password (the password is not echoed to the terminal). You can also
pass them as flags for non-interactive/scripted use:

```bash
npm run create-user -- --email=jane@example.com --name="Jane Doe" --password=a-strong-password
```

This behaves exactly like registering through the UI: it creates the user, their own personal
workspace, and redeems any pending invites for that email address. To share an existing workspace
with them afterwards, use **Settings -> Members** (or have them log in and share it themselves) -
inviting a specific email always works, regardless of the setting below.

If you'd rather let people create their own accounts through `/register` (e.g. a small team you trust
with open sign-up), turn it on instance-wide - takes effect immediately, no restart needed:

```bash
npm run enable-registration
npm run disable-registration   # turn it back off later
```

## Other useful commands

```bash
npm run build           # builds shared -> server -> web (production output)
npm run start:prod      # runs pending migrations, then starts the built server (serves the built web app too)
npm run create-user     # creates a new user account from the shell (see above)
npm run enable-registration   # lets anyone create their own account via /register
npm run disable-registration  # back to invite/shell-only (the default)
npm run lint            # ESLint across the whole monorepo
npm run typecheck       # TypeScript project-wide, no emit
```

## Docker

```bash
cp .env.example .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d --build
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full walkthrough, including the bare-metal
(non-Docker) `git pull` deployment flow.

## Versioning

The project's version (root `package.json`) starts at `0.0.1` and is bumped automatically - one patch
version per commit - by a `pre-commit` git hook (`.githooks/pre-commit`, running
`scripts/bump-version.mjs`), which stages the updated `package.json` so the new version is part of
the same commit. `npm install` wires this up for you (via the `prepare` script, which runs
`git config core.hooksPath .githooks`); after cloning the repo, running `npm install` once is enough -
no extra setup step required.
