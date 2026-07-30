# Reverse proxy: nginx

Notorious itself only ever listens on plain HTTP (port `4000` by default - see `PORT` in `.env`). It
never terminates TLS itself. Putting nginx in front of it gets you a real domain, HTTPS, and (if you
run other services on the same box) name-based routing to all of them from one place.

This covers two ways to set that up:

- **[Via a UI](#via-a-ui-nginx-proxy-manager)** - [Nginx Proxy Manager](https://nginxproxymanager.com/),
  a Docker-based nginx frontend with a web admin panel. No config file editing, click-through
  Let's Encrypt.
- **[Via config files](#via-config-files-plain-nginx)** - a plain nginx install (`apt install nginx`)
  editing `/etc/nginx/sites-available/*` directly, with certbot for the certificate.

Either way, the same three things matter, and are the source of almost every issue people hit:

1. **WebSocket upgrade headers** on the `/ws` location - without them, the client falls back to
   polling-less silence and live/realtime updates between collaborators just stop working, with no
   error dialog to tell you why.
2. **`client_max_body_size`** raised well past nginx's 1MB default - Notorious accepts file uploads
   up to 200MB (see `packages/server/src/app.ts`'s multipart limit); left at the default, nginx
   itself rejects anything over 1MB with a `413 Request Entity Too Large` *before the request ever
   reaches the app*.
3. **`COOKIE_SECURE=true` in `.env`, set only once HTTPS is actually working end-to-end.** Turn it on
   too early (before nginx has a valid cert and is actually serving HTTPS) and the browser silently
   drops the session cookie, which looks exactly like "login doesn't work" with no error message.
   Leave it `false` while you're still setting things up; flip it once you've confirmed
   `https://your-domain` loads correctly.

---

## Via a UI: Nginx Proxy Manager

[Nginx Proxy Manager](https://nginxproxymanager.com/) (NPM) runs nginx inside a container and gives
you a web UI for proxy hosts, SSL certificates and access lists - no `.conf` files to hand-edit. This
is the easier path if you're already comfortable with Docker.

### 1. Get both containers on the same Docker network

NPM proxies to Notorious over the network, so they need to be able to reach each other by container
name. If you're running Notorious via its own `docker-compose.yml` (see docs/DEPLOYMENT.md), the
simplest approach is one shared external network both compose files join.

Create the network once:

```bash
docker network create proxy-net
```

Add it to Notorious's `docker-compose.yml`:

```yaml
services:
  notorious:
    # ... existing config from docs/DEPLOYMENT.md unchanged ...
    networks:
      - proxy-net

networks:
  proxy-net:
    external: true
```

Nginx Proxy Manager's own `docker-compose.yml` (a fresh directory, e.g. `~/nginx-proxy-manager/`):

```yaml
services:
  npm:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
      - '81:81'   # admin UI - see step 2
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
    networks:
      - proxy-net

networks:
  proxy-net:
    external: true
```

```bash
docker compose up -d   # in each of the two directories
```

(If Notorious isn't in Docker at all - bare-metal/systemd - skip the shared network entirely and just
forward to the host's IP and port `4000` in step 3 instead, same as the plain-nginx example below.)

### 2. Log into the admin UI

Visit `http://your-server-ip:81`. Default first-login credentials are printed in NPM's own docs
(`admin@example.com` / `changeme`) - **change both immediately**, that admin panel is reachable from
the network the moment it's up.

### 3. Add a Proxy Host

**Hosts -> Proxy Hosts -> Add Proxy Host**, "Details" tab:

| Field | Value |
|---|---|
| Domain Names | `notes.example.com` (your real domain, already pointed at this server) |
| Scheme | `http` |
| Forward Hostname / IP | `notorious` (the compose service name - Docker's internal DNS resolves it) or the host IP if not on the shared network |
| Forward Port | `4000` |
| Cache Assets | off (Notorious already sets its own caching where useful; double-caching HTML that changes on every deploy causes stale-app issues) |
| **Websockets Support** | **on - this is the checkbox for point 1 above, don't skip it** |

"SSL" tab:

- **SSL Certificate**: Request a new **Let's Encrypt Certificate**
- **Force SSL**: on (redirects plain HTTP to HTTPS)
- **HTTP/2 Support**: on
- Accept the Let's Encrypt ToS, save. NPM handles the ACME challenge and renewal automatically - no
  cron job to set up yourself.

"Advanced" tab - NPM doesn't expose `client_max_body_size` as its own field, so add it here as a raw
nginx directive (point 2 above):

```nginx
client_max_body_size 200m;
```

Save. NPM regenerates its underlying nginx config and reloads immediately - no separate `nginx -t`/
reload step, that's the whole point of the UI.

### 4. Verify, then lock in HTTPS

Visit `https://notes.example.com` - you should land on Notorious's login page with a valid padlock.
Once you've confirmed that works, set `COOKIE_SECURE=true` in Notorious's `.env` and restart it
(`docker compose restart notorious`, or `systemctl restart notorious` for bare-metal).

---

## Via config files: plain nginx

For a traditional install (`apt install nginx` / `dnf install nginx`), editing
`/etc/nginx/sites-available/` directly.

### 1. Get a certificate with certbot

```bash
sudo apt install certbot python3-certbot-nginx   # Debian/Ubuntu
sudo certbot certonly --nginx -d notes.example.com
```

This obtains the certificate (files land in `/etc/letsencrypt/live/notes.example.com/`) without yet
touching your site config - the config below references those paths directly, and certbot's own
systemd timer (`certbot.timer`, installed with the package) handles renewal without any further setup.

### 2. Write the site config

`/etc/nginx/sites-available/notorious`:

```nginx
# Named map so the Upgrade header controls the Connection header correctly -
# "upgrade" when the client is asking for a WebSocket, "close" otherwise.
# Needed once per nginx.conf, not per server block - see step 3 if you have
# other proxied sites already defining this map.
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name notes.example.com;

    # Let certbot's HTTP-01 challenge through; redirect everything else.
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name notes.example.com;

    ssl_certificate     /etc/letsencrypt/live/notes.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/notes.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Point 2: nginx's own 1MB default would 413 anything bigger than that,
    # regardless of what the app itself is willing to accept.
    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;

        # Point 1: required for the /ws realtime endpoint. Without these two
        # headers the upgrade request just gets proxied as a dead-end plain
        # HTTP request instead, and clients silently stop receiving live
        # updates (no error - it just looks like collaboration doesn't work).
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket connections are long-lived and otherwise idle between
        # events - nginx's default 60s read timeout would silently drop them
        # mid-session, forcing a reconnect (the client does reconnect, but
        # it's needless churn). A generous number here costs nothing.
        proxy_read_timeout 1h;
    }
}
```

If you already proxy other sites through this same nginx and one of them already declares the
`$connection_upgrade` map, don't declare it a second time in `nginx.conf`/another site file - nginx
errors on a duplicate `map` block. Move it to `/etc/nginx/conf.d/` (included once, globally) instead
of repeating it per site.

### 3. Enable the site and reload

```bash
sudo ln -s /etc/nginx/sites-available/notorious /etc/nginx/sites-enabled/notorious
sudo nginx -t              # validates the config - fix anything it flags before reloading
sudo systemctl reload nginx
```

### 4. Verify, then lock in HTTPS

```bash
curl -I https://notes.example.com
```

Expect `HTTP/2 200` (or a redirect to `/login` - either way, not a TLS error and not a proxy error
page). Once confirmed, set `COOKIE_SECURE=true` in Notorious's `.env` and restart it
(`sudo systemctl restart notorious`).

To confirm the WebSocket path specifically works end-to-end (not just plain HTTP through the proxy):
open the app in two browser tabs/windows logged in as two different accounts sharing a workspace,
edit an object in one, and confirm the other updates without a manual refresh (see the realtime
behavior described in docs/ARCHITECTURE.md). If it doesn't, re-check the `Upgrade`/`Connection`
headers (config files) or the "Websockets Support" toggle (NPM) first - that's the cause well over
90% of the time.

---

## Troubleshooting checklist

| Symptom | Likely cause |
|---|---|
| Login redirects back to `/login` immediately, or "session expired" right after logging in | `COOKIE_SECURE=true` was set before HTTPS actually worked, or nginx isn't forwarding `Host` correctly |
| File uploads fail around 1MB with no useful error in the app | `client_max_body_size` not raised (still nginx's 1MB default) |
| Everything works except other collaborators' edits never appear without a manual refresh | Missing `Upgrade`/`Connection` proxy headers, or "Websockets Support" left off in NPM |
| `502 Bad Gateway` | Notorious isn't actually running/listening on the port nginx is forwarding to - check `systemctl status notorious` / `docker compose ps`, and that the port in the proxy config matches `PORT` in `.env` |
| Certificate renewal seems to have stopped working | Plain nginx: check `sudo systemctl status certbot.timer` and `sudo certbot renew --dry-run`. NPM: certs auto-renew internally - check the container logs (`docker compose logs npm`) if a cert actually expired |
