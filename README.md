# Notorious

Notorious is a self-hosted, multi-user notes and knowledge base app built around object-based editing
rather than plain documents: everything you create is a typed object - Note, Project, Task, Person,
Book, Meeting, Company, File, or a custom type you define yourself - with its own properties (text,
dates, relations, formulas, ...) alongside a rich block editor for its content. The same underlying
data can then be browsed through six different view types
(Table, Board, Calendar, Timeline, Gallery, List) with filters and sorts, so a set of Task objects
becomes a Kanban board in one place and a deadline calendar in another without duplicating anything.
On top of that: full-text/fuzzy search, live multi-user sync with roles and presence, chat and
WebRTC calls, shareable public links, a scripting/templating layer, and an AI agent with an MCP
server - all backed by a single SQLite file, so it doubles as a personal wiki, a team knowledge base,
or lightweight project/task tracking, and is trivial to back up or move.

There are no pre-created accounts, and self-registration through the `/register` page is **disabled
by default** - create the first one from the shell with `npm run create-user` (see
[Creating user accounts](#creating-user-accounts)), or run `npm run enable-registration` if you'd
rather let people sign themselves up.

## Installing on your own Linux server (one-liner)

The fastest way to get a running instance: SSH into any Linux server and paste this single command.

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/install.sh)"
```

You don't need git, Node.js, or anything else installed beforehand - the script figures out what's
missing and takes care of it for you. Concretely, it: downloads the latest release into `./notorious`;
installs Node.js and any build tools it needs (asking first); runs `npm install`; creates a `.env`
file with a freshly generated secret; builds the app and sets up the database; asks whether it should
create your first login (email/name/password, right there in the terminal); and finally offers to
install it as a systemd service so it starts automatically on boot and restarts itself if it ever
crashes. If `whiptail` or `dialog` is already on the server, prompts render as dialog boxes instead
of plain text - neither is installed for you, it's opportunistic only. Answer the prompts (or just
hit Enter for the defaults) and a few minutes later the app is reachable at `http://<your-server>:4000`. The script is safe to re-run, and updating later is the same
idea with a different script:

```bash
curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/update.sh | bash -s -- --channel=release
```

See [Installing on your own Linux server (in detail)](#installing-on-your-own-linux-server-in-detail)
further down for what these scripts do under the hood, and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the fully manual steps. Once it's running, head to
[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) for creating your first account, managing users,
and turning on optional features like calls.

## Installing with Docker

Prefer a container? Clone the repo, create your `.env`, and let Docker Compose build and run it:

```bash
git clone https://github.com/mokny/notorious.git
cd notorious
cp .env.example .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d --build
```

That reads the `docker-compose.yml` already in the repo:

```yaml
services:
  notorious:
    build: .
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: production
      TZ: ${TZ:-Europe/Berlin}
      SESSION_SECRET: "${SESSION_SECRET:?set a random 64-char hex secret in .env, e.g. output of 'openssl rand -hex 32'}"
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
      VAPID_SUBJECT: ${VAPID_SUBJECT:-mailto:admin@example.com}
    volumes:
      - notorious-data:/app/data

volumes:
  notorious-data:
```

`SESSION_SECRET` is the only required value (the container refuses to start without it); everything
else has a sane default. `TZ` controls the timezone the scheduled auto-update time is evaluated
against, and the `VAPID_*` variables enable Web Push if you set them (`npm run generate-vapid-keys
--workspace=packages/server` generates a pair). All persistent state - the SQLite database and
uploaded files - lives under the `notorious-data` named volume, i.e. `/app/data` inside the container,
so the entire instance can be backed up or moved by copying that one volume. Once it's up, create your
first account with `docker compose exec notorious npm run create-user --workspace=packages/server`
(self-registration is off by default, same as the bare-metal install). See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full walkthrough, including reverse proxy/HTTPS setup
and the non-Docker `git pull` deployment flow.

## Features

- **Objects & data model** - ten built-in object types (Note, Project, Task, Person, Book, Meeting,
  Company, File, Database, Collection) plus custom types; 20 property kinds (Text, Number, Date,
  Tag/MultiTag, Select, Rating, Relation, Formula, Rollup, ...); relations with automatic backlinks;
  sub-objects and archiving
- **Block editor** - paragraphs, headings, quotes, callouts, toggles, checklists, tables, code blocks,
  math, Mermaid diagrams, columns, bookmarks, maps, whiteboard, polls, and embedded image/video/audio/PDF
  blocks; markdown import/export; "linked database" blocks embedding a live saved view
- **Six view types** - Table, Board (Kanban), Calendar, Timeline, Gallery and List over the same
  object data, each with filters and sorts
- **Templating & scripting** - a templating language for text fields with live queries over other
  objects, plus sandboxed per-object JavaScript for custom calculations and change-triggered
  automations; template access to raw HTTP requests can be toggled instance-wide with
  `npm run enable-template-http` / `disable-template-http` (off by default)
- **Full-text & fuzzy search** - SQLite FTS5 search with typo-tolerant fallback matching
- **Live sync & collaboration** - multi-user workspaces with viewer/commenter/editor/owner roles,
  WebSocket-based live sync, presence indicators, comments, and workspace channels plus 1:1 chat with
  reactions, replies, typing indicators and read receipts
- **Audio/video calls** - WebRTC calling with mic/camera/speaker device switching, gain controls, a
  pre-join lobby, and a minimizable in-call window; can be turned on/off instance-wide with
  `npm run enable-calls` / `disable-calls`, with `npm run setup-calls` auto-detecting the public IP
  for the embedded SFU
- **Sharing & API access** - shareable public links per object with configurable access level, and
  personal API keys for programmatic access
- **AI agent & MCP server** - an in-app chat agent that can search, create, update and archive objects
  using your own OpenAI/Anthropic/Gemini-compatible key, plus a built-in MCP server for external MCP
  clients (Claude Desktop, Claude Code, ...)
- **Installable PWA** - responsive install on desktop and mobile, with Web Push notifications and
  deep links
- **Security & ops** - two-factor authentication (optionally enforced instance-wide with
  `npm run enable-2fa-requirement` / `disable-2fa-requirement`), session/API-key auth with
  per-workspace role checks, per-workspace ZIP backups, webhooks for outbound events, and an
  admin-only in-app notification bell that reports auto-update outcomes live over WebSocket

## Documentation

- [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) - step-by-step shell commands from a fresh
  install to a fully configured instance: first user, managing accounts, 2FA, calls, push, templates
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - how the system is put together and why
- [docs/API.md](docs/API.md) - REST/WebSocket API reference (also available live at `/api/docs`)
- [docs/SCRIPTING.md](docs/SCRIPTING.md) - writing sandboxed per-object JavaScript, with examples
- [docs/TEMPLATES.md](docs/TEMPLATES.md) - the templating language for text fields (Home Assistant-style
  `{{ expr }}` / `{% stmt %}` syntax), with live inline rendering
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - running this on your own Linux server, with or without Docker
- [docs/NGINX.md](docs/NGINX.md) - reverse proxy setup for a real domain + HTTPS, via a UI (Nginx Proxy Manager) or plain config files
- [docs/MCP.md](docs/MCP.md) - the built-in MCP server, for connecting external MCP clients (Claude Desktop, Claude Code, ...)
- [docs/ROADMAP.md](docs/ROADMAP.md) - what's deliberately out of scope for this first pass, and why

## Tech stack

- **Monorepo**: npm workspaces (`packages/shared`, `packages/server`, `packages/web`)
- **Server**: Node.js, TypeScript, Fastify, better-sqlite3 + Drizzle ORM, WebSockets, Web Push, argon2
- **Frontend**: React, Vite, TanStack Query/Virtual, TipTap (block editor), Tailwind CSS, installable PWA
- **Storage**: one SQLite file + a `files/` directory - see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#backups)
  for why that makes backups trivial

## Quick start (local development)

Prerequisites: Node.js 22+ and npm. `better-sqlite3` and `argon2` contain native addons; on Linux you may
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

## Installing on your own Linux server (in detail)

One line, no git required - downloads the code (via curl/wget) into `./notorious` and installs it:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/install.sh)"
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
curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/update.sh | bash -s -- --channel=release
```

This re-downloads the latest code as a tarball (`.env` and `data/` are untouched - neither is part of
the download), reinstalls dependencies, rebuilds, runs any pending migrations, and restarts the
systemd service if `install.sh` set one up (otherwise it tells you to restart manually).

To remove an installation, from inside that directory:

```bash
./scripts/uninstall.sh
```

Stops and removes the systemd service, then removes the project directory. Asks separately whether
to keep your data (`data/notorious.db` + `data/files/`) - if you say yes it's moved to
`~/notorious-data-backup/` first, so nothing is lost by default. Leaves Node.js and any build tools
`install.sh` installed untouched.

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

## Versioning

The project's version (root `package.json`, currently `1.0.0`) is bumped automatically - one patch
version per commit - by a `pre-commit` git hook (`.githooks/pre-commit`, running
`scripts/bump-version.mjs`), which stages the updated `package.json` so the new version is part of
the same commit. `npm install` wires this up for you (via the `prepare` script, which runs
`git config core.hooksPath .githooks`); after cloning the repo, running `npm install` once is enough -
no extra setup step required.

On top of that per-commit patch counter, `npm run release` (`scripts/release.mjs`) cuts a real
GitHub Release: it bumps to the next `vMAJOR.MINOR.0`, runs typecheck/lint/build, commits, tags, pushes,
and publishes the release via the `gh` CLI. Deployments can then track either the `release` channel
(the latest published release) or the `nightly` channel (the tip of `main`) - see
`docs/DEPLOYMENT.md`'s "Updating" and "Auto-Update" sections.
