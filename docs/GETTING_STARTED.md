# Getting started

A pure command-and-order walkthrough from "nothing installed" to a fully configured instance:
first boot, creating and managing user accounts, turning on calls, and the other one-time setup
steps most self-hosters want. Each step just documents the shell command and what it does - for the
*why* behind any of it, see [DEPLOYMENT.md](DEPLOYMENT.md) (deployment/updates), [NGINX.md](NGINX.md)
(reverse proxy/HTTPS) or the main [README](../README.md) (features, install options).

All commands below assume you're inside the project directory on the server (`cd notorious` after
installing) unless noted otherwise. Commands with a `--workspace=packages/server` flag can be run
from the repo root; if you `cd packages/server` first, drop that flag.

## 1. Install

Pick one - both are documented in detail in the [README](../README.md#installing-on-your-own-linux-server-one-liner):

```bash
# Bare-metal (Linux server, no Docker)
curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/install.sh | bash

# Docker
git clone https://github.com/mokny/notorious.git && cd notorious
cp .env.example .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d --build
```

`install.sh` offers to create your first user account interactively at the end - if you said yes
there, skip straight to [step 3](#3-managing-users). Otherwise continue with step 2.

## 2. Create the first account

Self-registration through `/register` is **disabled by default**, so the first account has to be
created from the shell:

```bash
npm run create-user
```

Prompts for an email, name and password (the password isn't echoed to the terminal). This first
account is automatically granted the server-admin role. For non-interactive/scripted use, pass
everything as flags instead:

```bash
npm run create-user -- --email=jane@example.com --name="Jane Doe" --password=a-strong-password
```

Open the app in a browser and log in with that account.

## 3. Managing users

Everything below takes effect immediately - no restart needed.

**Create more accounts** (same command as step 2, run it again per person):

```bash
npm run create-user -- --email=bob@example.com --name="Bob" --password=another-strong-password
```

**Delete an account.** Every workspace that user *owns* is deleted in full (objects, blocks, files,
everyone else's access to it); content they merely created in workspaces they don't own is kept, just
reassigned to a "Deleted User" placeholder.

```bash
npm run delete-user -- --email=jane@example.com          # prompts for confirmation
npm run delete-user -- --email=jane@example.com --yes     # skips the confirmation prompt
```

**Grant or revoke the server-admin role** (server admins get the `/admin` panel - user/instance
management, update history, etc.):

```bash
npm run make-admin -- --email=jane@example.com
npm run make-admin -- --email=jane@example.com,bob@example.com   # multiple at once
npm run revoke-admin -- --email=bob@example.com
```

**Let people create their own accounts** via `/register`, instead of you provisioning every one from
the shell:

```bash
npm run enable-registration
npm run disable-registration                                       # back to invite/shell-only
npm run --workspace=packages/server set-registration -- --status   # check current state
```

Registration being off never blocks inviting a *specific* email to a workspace - that always works,
from **Settings -> Members** in the UI.

## 4. Require two-factor authentication (optional)

Off by default. Once enabled, every user (existing and new) is forced through `/setup-2fa` before
they can use anything else:

```bash
npm run enable-2fa-requirement
npm run disable-2fa-requirement
npm run --workspace=packages/server set-require-2fa -- --status
```

## 5. Set up audio/video calls (optional)

Calls are relayed through Notorious's own embedded SFU - no separate TURN/coturn service, no extra
apt packages, no root needed. First-time setup is one interactive wizard:

```bash
npm run setup-calls --workspace=packages/server
```

It walks you through:

1. Detects your server's public IP (or asks you to enter it/a domain if detection fails).
2. Writes `MEDIA_ANNOUNCED_IP` and `MEDIA_PORT` (default `4001`) into `.env`.
3. Prints the one manual step it *can't* automate: forward/open that UDP+TCP port on your
   router/firewall so call media can reach the server.
4. Flips the `calls_enabled` instance setting on for you.

**Bare-metal only:** restart the app afterwards so it picks up the new `.env` values
(`npm run start:prod`, or restart the systemd service: `sudo systemctl restart notorious`).
**Docker:** `docker compose up -d --build` again so the container picks up the updated `.env`.

Once set up, you can flip calls on/off later without redoing the wizard (this only toggles the
feature flag in the database, takes effect immediately, no restart):

```bash
npm run enable-calls
npm run disable-calls
npm run --workspace=packages/server set-calls -- --status
```

## 6. Web Push notifications (optional)

Needs a VAPID key pair:

```bash
npm run generate-vapid-keys --workspace=packages/server
```

Prints a public/private key pair - put both into `.env` as `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` (Docker: into the `.env` Compose reads), then restart the app.

## 7. Templates with outbound HTTP (optional, off by default)

The template language's `http.*(...)` builtin lets a template field make the *server* issue an
outbound HTTP request every time the page is viewed - including by anonymous share-link visitors.
Leave this off unless you specifically need it; see [TEMPLATES.md](TEMPLATES.md) and
`modules/templates/http.ts`'s SSRF guards for what's still restricted even when enabled.

```bash
npm run enable-template-http
npm run disable-template-http
npm run --workspace=packages/server set-allow-template-http -- --status
```

## 8. Keeping it up to date

```bash
curl -fsSL https://raw.githubusercontent.com/mokny/notorious/main/scripts/update.sh | bash -s -- --channel=release
```

Re-downloads the latest published release, reinstalls dependencies, rebuilds, runs any pending
database migrations, and restarts the systemd service if `install.sh` set one up. Refuses to
downgrade. See [DEPLOYMENT.md](DEPLOYMENT.md) for the `nightly` channel and the auto-update scheduler
in `/admin`.

## Command reference

Everything above, plus the remaining general-purpose commands, in one place:

```bash
npm run create-user           # create a user account (prompts, or --email/--name/--password flags)
npm run delete-user           # delete a user account (--email=..., --yes to skip confirmation)
npm run make-admin            # grant server-admin (--email=..., comma-separated for multiple)
npm run revoke-admin          # revoke server-admin (--email=..., comma-separated for multiple)
npm run enable-registration   # allow open sign-up via /register
npm run disable-registration  # back to invite/shell-only (the default)
npm run enable-2fa-requirement    # force every user through 2FA setup
npm run disable-2fa-requirement
npm run setup-calls --workspace=packages/server   # first-time audio/video call setup wizard
npm run enable-calls          # turn calls on (after setup-calls has run once)
npm run disable-calls
npm run enable-template-http  # allow templates to issue outbound HTTP requests
npm run disable-template-http
npm run generate-vapid-keys --workspace=packages/server   # Web Push key pair

npm run migrate                # run pending database migrations
npm run build                  # production build (shared -> server -> web)
npm run start:prod             # run migrations, then start the built server
npm run lint                   # ESLint across the whole monorepo
npm run typecheck              # TypeScript project-wide, no emit
```

Any of the toggle scripts (`enable-registration`, `enable-2fa-requirement`, `enable-calls`,
`enable-template-http`, ...) also accept `--status` via their underlying `set-*` script - e.g.
`npm run --workspace=packages/server set-calls -- --status` - to check the current state without
changing it.
