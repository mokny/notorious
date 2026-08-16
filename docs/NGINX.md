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
4. **The "Behind a reverse proxy" setting in Admin → Advanced**, so Notorious shows each visitor's
   real IP (Sessions list, login rate limiting, audit log) instead of nginx's own IP on every entry -
   see [Showing the real client IP](#showing-the-real-client-ip) below.

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
nginx directive (point 2 above). NPM sets `X-Forwarded-For`/`X-Real-IP` on outgoing proxied requests
by default, so nothing extra is needed here for point 4 (real client IPs) - just complete the
[Showing the real client IP](#showing-the-real-client-ip) section below once this proxy host is live:

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

## Audio/video calls don't go through nginx at all

If you've set up [calls](DEPLOYMENT.md#audiovideo-calls-optional) via `npm run setup-calls`, **no
nginx changes are needed for them.** There are two separate traffic paths, easy to conflate:

- **Call signaling** (the mediasoup handshake: RTP capabilities, transports, produce/consume) is
  plain REST over `/api/v1/calls/...`, and the `mediaNewProducer`/`mediaProducerClosed` push events
  ride the same `/ws` WebSocket connection everything else in this doc already covers - as long as
  the proxy headers above are in place, signaling already works, nothing extra to configure.
- **Call media itself** (the actual audio/video/screen-share) never touches nginx or port 4000 at
  all - it's TCP traffic between browsers and Notorious's own embedded mediasoup SFU, directly on
  `MEDIA_PORT` (forwarded straight from your router to the server - see DEPLOYMENT.md). nginx only
  ever proxies HTTP(S)/WebSocket traffic; it has no role in relaying call media, and adding an nginx
  `stream {}` block for this is unnecessary.

If calls aren't connecting, the nginx config is very unlikely to be the cause - check that
`MEDIA_ANNOUNCED_IP` in `.env` is actually your public IP and that `MEDIA_PORT` is really forwarded
on your router instead.

## Showing the real client IP

By default Notorious shows every visitor's IP as your reverse proxy's own address (e.g.
`192.168.178.6` for a bare-metal nginx, or a Docker-internal IP for NPM) in Admin → Sessions, the
per-user Security settings device list, and the admin audit log - because without being told
otherwise, it reads the raw TCP connection address, which *is* nginx, not the visitor behind it. Both
setups above already forward the real address via the `X-Forwarded-For`/`X-Real-IP` headers; Notorious
just needs to be told to trust and read them.

### 1. Confirm port 4000 isn't reachable directly

This is the important part, not a formality: once Notorious trusts `X-Forwarded-For`, anyone who can
reach it *without* going through nginx can put an arbitrary IP in that header and have Notorious
believe it - bypassing login rate limiting and forging entries in the sessions/audit log. Only enable
the setting below once you've confirmed nginx is the only way in:

- **Bare-metal / systemd**: firewall off external access to `PORT` (`4000` by default), e.g.
  `sudo ufw deny 4000` (nginx reaches it over `127.0.0.1`, which stays allowed).
- **Docker Compose**: bind the published port to localhost only, so it's not exposed on the host's
  public interfaces at all:

  ```yaml
  services:
    notorious:
      ports:
        - "127.0.0.1:4000:4000"   # was "4000:4000"
  ```

  If NPM or another reverse-proxy container reaches Notorious over the shared Docker network instead
  (see [Via a UI](#via-a-ui-nginx-proxy-manager) above), you don't even need the port published to the
  host - you can drop the `ports:` mapping for `notorious` entirely and rely on the container-name
  DNS resolution within `proxy-net`.

### 2. Enable it in Admin → Advanced

Log in as an instance admin, go to **Admin → Advanced**, and turn on **"Behind a reverse proxy"**.
It requires at least one trusted IP/CIDR in the field next to it - Notorious only reads
`X-Forwarded-For` when the request actually arrives from one of these, everything else still falls
back to the raw connection address:

- **Plain nginx** (proxying via `proxy_pass http://127.0.0.1:4000` on the same host): use `127.0.0.1`
  (and `::1` too, comma-separated, if nginx might connect over IPv6 loopback).
- **Nginx Proxy Manager / other reverse-proxy container on the shared `proxy-net` Docker network**:
  use that network's subnet, e.g. `172.18.0.0/16` - check the actual range with
  `docker network inspect proxy-net` (`IPAM.Config[0].Subnet`) rather than guessing, Compose doesn't
  always pick the same one.

No restart needed - the setting takes effect on the next request. Log out and back in (or just
refresh the Sessions list) to see the real IP appear on new session rows; existing rows keep whatever
was already stored.

## Troubleshooting checklist

| Symptom | Likely cause |
|---|---|
| Login redirects back to `/login` immediately, or "session expired" right after logging in | `COOKIE_SECURE=true` was set before HTTPS actually worked, or nginx isn't forwarding `Host` correctly |
| File uploads fail around 1MB with no useful error in the app | `client_max_body_size` not raised (still nginx's 1MB default) |
| Everything works except other collaborators' edits never appear without a manual refresh | Missing `Upgrade`/`Connection` proxy headers, or "Websockets Support" left off in NPM |
| `502 Bad Gateway` | Notorious isn't actually running/listening on the port nginx is forwarding to - check `systemctl status notorious` / `docker compose ps`, and that the port in the proxy config matches `PORT` in `.env` |
| Certificate renewal seems to have stopped working | Plain nginx: check `sudo systemctl status certbot.timer` and `sudo certbot renew --dry-run`. NPM: certs auto-renew internally - check the container logs (`docker compose logs npm`) if a cert actually expired |
| Calls ring but audio/video never connects | Not an nginx issue - see the calls section above. Check `MEDIA_ANNOUNCED_IP`/`MEDIA_PORT` in `.env` and router port forwarding |
| Sessions/audit log always show the nginx server's own IP for every visitor | "Behind a reverse proxy" isn't enabled (or the trusted IP/CIDR doesn't match) in Admin → Advanced - see [Showing the real client IP](#showing-the-real-client-ip) |
