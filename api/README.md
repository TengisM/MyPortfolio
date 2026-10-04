# The Go API

`api/` is a GoFiber service on PostgreSQL. It stores the contact form's submissions, emails you
about each new lead, and lets an admin read them over `GET /api/admin/leads`. It also holds the
portfolio's projects and experience. The admin edits them, and the site's build reads them from
`GET /api/content`. The pages themselves stay static.

## Running it

```bash
cp api/.env.example api/.env   # once
docker compose up -d db        # Postgres, on host port 5436
cd api && make run             # on PORT (default 3000). `make dev` hot-reloads if you have air.
```

Migrations run at startup, forward only. To change the schema, add a new migration with
`make migrate-create name=add_something` and write its `.up.sql`.

Postgres uses host port 5436 so it doesn't clash with one already on your machine. If you change
`DB_USER`, `DB_PASSWORD` or `DB_NAME`, change `POSTGRES_USER`, `POSTGRES_PASSWORD` and
`POSTGRES_DB` in `docker-compose.yml` too.

## Prerequisites

Go, Docker, `sqlc` and `golangci-lint`. `pnpm verify` runs `sqlc diff`, which fails if the
generated code in `internal/db/sqlc/` doesn't match the queries. Never edit that folder by hand.
`air` is optional.

## Connecting the contact form

The form posts to `VITE_CONTACT_ENDPOINT`. Set it in a `.env` at the project root:

```
VITE_CONTACT_ENDPOINT=http://localhost:3000/api/leads
```

`CORS_ORIGINS` already allows `http://localhost:5173`, Vite's dev port.

**Every `CORS_ORIGINS` entry must be a literal origin.** Any `*`, including
`https://*.example.com`, stops startup. Responses carry the admin's session cookie, so any host
that matches a wildcard could take over the panel.

The admin panel of a `--backend=admin` project needs no entry. It is same-origin: Vite proxies
`/api` in development, and one binary serves both in production. It can't move to another origin,
because it always sends `credentials: 'same-origin'`.

## Notifications

`NOTIFY_DRIVER=log` (the default) writes a log line. `NOTIFY_DRIVER=ses` sends email through AWS
SES and needs `NOTIFY_TO` and `SES_FROM`. With `APP_ENV=production`, `log` is refused, because
leads would be stored and nobody told.

`NOTIFY_DRIVER=resend` sends through Resend's HTTP API and needs `RESEND_API_KEY` and `NOTIFY_TO`.
Startup fails without either. `RESEND_FROM` defaults to `onboarding@resend.dev`, Resend's shared
test sender. It only delivers to the address that owns the Resend account, so set `NOTIFY_TO` to
that address. To send from your own address, verify a domain in Resend and set `RESEND_FROM`.
Reply-To is the visitor, so replying from your inbox reaches them.

## Content

Projects and experience live in two tables, `projects` and `experience`. Project logos are stored
in the row, at most 1 MB each.

### Public endpoints

```
GET /api/content              published projects and experience, Cache-Control: public, max-age=60
GET /api/content/logos/:id    the logo bytes, Cache-Control: public, max-age=86400
```

`/api/content` returns `{"success": true, "data": {"projects": [...], "experience": [...]}}`, the
same shape as `src/content/content.json`. Projects come in their admin order. Experience comes
newest `start_date` first. A project's `logo` is `/api/content/logos/<id>?v=<unix time>` or `null`.
The `v` changes with every logo upload, so the day-long cache never serves an old logo.

The logo endpoint also serves logos of unpublished projects, so the panel can preview them. Ids are
random UUIDs, so nobody finds one by guessing.

## Online Tron

`GET /api/tron/ws` is a WebSocket for the terminal's `tron online` game. The server runs every
match (`internal/service/tron`): the browser only sends turns and draws what comes back, so lag
can't decide a crash and nobody can cheat by editing their copy.

```
client → {"t":"create"}                 open a room; you get seat 0 and host
client → {"t":"join","code":"KXQP"}     take the first free seat, or a bot's when none is free
client → {"t":"addbot"}                 host only: a bot takes the first free seat
client → {"t":"dropbot"}                host only: the last bot leaves
client → {"t":"start"}                  host only, with at least 2 riders, bots included
client → {"t":"turn","d":0}             0 up, 1 right, 2 down, 3 left
server → room   code, your seat, host, seats taken, which are bots, wins, whether a match is on
server → round  arena size, countdown in ms, start cells as [seat, x, y, dir]
server → tick   moves as [seat, x, y, dir], crashed seats, ms until the next tick
server → over   the winner's seat (-1 for a draw) and everyone's wins
server → error  why a join or start was refused
```

Bots run on the server too (`bot.go`, the same logic as the site's offline bots). A round ends
when one rider is left, or when every person has crashed. Rooms live in memory and go when their
last person leaves, bots or not; a restart ends every match. The handler refuses sockets from
origins not in `CORS_ORIGINS`, takes 20 new connections a minute per client, drops anyone sending
over 30 messages a second, and closes a connection that stays silent for a minute (the server
pings every 20 seconds, which browsers answer on their own). In development it also accepts any
localhost port and any private network address.

To play against another computer on the same Wi-Fi during development, run the API, then
`pnpm dev --host`. Vite prints a Network URL such as `http://192.168.1.13:5173/`. Open the site
from that URL, not localhost, and type `tron online`. The invite link it copies then points at
your machine, and the other computer opens it or types `tron join CODE`. If the other computer
can't load the page, macOS may be asking whether to allow incoming connections for node.

### Admin endpoints

All of these need the Bearer token and answer with `Cache-Control: no-store`.

```
GET    /api/admin/projects               {"items": [AdminProject]}, by sort_order
POST   /api/admin/projects               {title, url, description_mn, description_en, published}
PUT    /api/admin/projects/:id           same body
DELETE /api/admin/projects/:id
PUT    /api/admin/projects/:id/logo      {content_type, data_base64}
DELETE /api/admin/projects/:id/logo
POST   /api/admin/projects/reorder       {ids: [...]}, every project id exactly once
GET    /api/admin/experience             {"items": [AdminExperience]}, newest start_date first
POST   /api/admin/experience             {kind, organization_mn, organization_en, position_mn,
                                          position_en, description_mn, description_en,
                                          start_date, end_date, published}
PUT    /api/admin/experience/:id         same body
DELETE /api/admin/experience/:id
GET    /api/admin/publish                {configured, pending, last_triggered_at, last_error}
POST   /api/admin/publish                calls the deploy hook now, returns the same
```

- A new project goes to the end of the list. `published` defaults to `true` when left out.
- Titles, organizations and positions take 1 to 200 characters. Descriptions take up to 2000 and
  may be empty. `url` must start with `http://` or `https://`.
- Dates are `YYYY-MM-DD`. `end_date` is `null` for a current role and can't be before
  `start_date`. `kind` is `work` or `education`.
- The server ignores the logo's `content_type` and reads the type from the bytes. It accepts PNG,
  JPEG and WebP only. `data_base64` may carry a `data:image/png;base64,` prefix, as
  `FileReader.readAsDataURL` produces.
- Bad input is a 400 with `"error": "validation error"` and a Mongolian `message`. An unknown or
  malformed id is a 404.
- DELETE answers `{"success": true}` with no `data`.

## Publishing

The site is prerendered, so an edit shows up only after a rebuild. Each successful content write
starts a timer, and each later write restarts it. When the timer runs out, the API POSTs to
`VERCEL_DEPLOY_HOOK_URL`. Ten saves in a row cost one deploy.

| Setting | Default | Meaning |
|---|---|---|
| `VERCEL_DEPLOY_HOOK_URL` | empty | The hook from Vercel's project settings. Empty turns publishing off. |
| `PUBLISH_DEBOUNCE_SECONDS` | 30 | How long to wait after the last write |

With the hook unset, writes only log a line and `/api/admin/publish` reports `configured: false`.
`POST /api/admin/publish` skips the wait. A failed call still answers 200 and shows the reason in
`last_error`. The state lives in memory, so a crash forgets a pending publish. A graceful stop
sends it before exiting.

The hook URL is a secret: anyone with it can start builds. The API never logs it.

## Importing a snapshot

To fill empty tables from the committed snapshot:

```bash
cd api && make import-content file=../src/content/content.json
```

It keeps every id. Projects keep the file's order. Each `logo` path, like
`/content/logos/<id>.png`, is read from the `public/` folder two levels above the snapshot. Pass
`public=path/to/public` to read logos from elsewhere. The import checks every row and logo with
the same rules as the API, then writes everything in one transaction. It refuses to run when
either table already has rows, so it can't duplicate or overwrite content.

## Admin access

Create an account. It asks for the password (at least 12 characters) with echo off, so the
password never lands in shell history or `ps`:

```bash
cd api && make seed-admin email=owner@example.mn
```

To script it, pipe the password in with no trailing newline:

```bash
printf '%s' "$PASSWORD" | go run ./cmd seed-admin owner@example.mn
```

A second seed of the same email fails. There is no change-password command: to rotate a password,
seed a new account and delete the old one.

### Endpoints

```
POST /api/auth/login    {"email": "...", "password": "..."}   -> access_token, and a refresh cookie
POST /api/auth/refresh  refresh cookie + X-Requested-With     -> a new access_token and cookie
POST /api/auth/logout   refresh cookie + X-Requested-With     -> 200, and the session is revoked
GET  /api/admin/leads   Authorization: Bearer <access_token>
```

- **Refresh and logout need an `X-Requested-With` header** (any value), or they answer 403. A
  plain cross-site form can't set it, so another site can't sign you out.
- The refresh token is only ever a cookie:
  `landing_refresh=...; Path=/api/auth; HttpOnly; Secure; SameSite=Strict`. `Secure` is dropped
  when `APP_ENV=development`.
- Browser clients send `credentials: 'include'` on the `/api/auth` calls and keep the access token
  in memory, not `localStorage`. A client on another origin must be in `CORS_ORIGINS`, or the
  browser drops the cookie. From the command line, use a cookie jar: `curl -c jar -b jar`.
- Access and refresh tokens are not interchangeable.
- `GET /api/admin/leads` takes `limit` (default 50, max 200) and `offset`. It returns
  `{"items": [...], "total": N}`, where `total` counts every lead and `items` is never `null`.
- All `/api/admin` responses, errors included, carry `Cache-Control: no-store`.

### Sessions

| Setting | Default | Meaning |
|---|---|---|
| `JWT_ACCESS_EXPIRE_MINUTES` | 15 | How long an access token works |
| `JWT_REFRESH_EXPIRE_DAYS` | 7 | How long a session may sit unused |
| `JWT_SESSION_MAX_DAYS` | 30 | The longest a login lasts, however active |

`JWT_SECRET` must be at least 32 characters outside development:
`openssl rand -base64 32`.

Each refresh token works once, and the refresh sets a new cookie. Sending a spent token again
looks like theft, so the server revokes the whole login and writes a `token_reuse_detected` row to
`admin_audit_log`. One exception: a token spent in the last 30 seconds whose replacement is still
unused gets the same replacement again. That covers dropped connections and two tabs refreshing at
once. Still, send one refresh at a time from your client.

**Open a `token_reuse_detected` row when you see one.** Compare its `ip` and `user_agent` with the
nearby `login_success` row. A different address or browser means someone else had the token. The
session is already revoked; decide whether to rotate the password.

**Sign out isn't instant for tabs already open.** It revokes the session, so no new token is
issued. But the access token already in a tab keeps working until it expires, up to 15 minutes,
because the API doesn't check a database on every request. On a shared computer, also close the
browser.

### Rate limits

- Per client address: login gets 5 requests per 15 minutes, refresh gets 30. Logout isn't limited.
- Login also backs off per email **and** address together. From the 5th failure, that pair is
  locked for a minute, doubling up to an hour. A success clears it, and so do 30 quiet minutes.
- Because the lock includes the address, a stranger can't lock you out from elsewhere. People who
  share your address (office NAT, a VPN) can.
- Both limits answer 429.

### Behind a proxy or load balancer

Set both `PROXY_HEADER` (e.g. `X-Forwarded-For`) and `TRUSTED_PROXIES` (e.g.
`10.0.0.0/8,172.16.0.0/12`). The header is trusted only from those addresses, and the server takes
the rightmost address that isn't a trusted proxy. If your proxy replaces the header instead of
appending to it, name a header it writes itself, such as `X-Real-IP`.

With `PROXY_HEADER` set and `TRUSTED_PROXIES` empty, the header is ignored and every request shares
the proxy's address, which means one rate-limit bucket for everyone. An entry that won't parse
stops startup.

## Serving the site

`make build` builds the web app, embeds it in the binary, and writes `bin/landing-api`. That one
binary serves the site on `/` and the API on `/api/*`. Without a build embedded (`make run`,
`make dev`), the API still works and there is just no site. `internal/static/dist/.placeholder`
only exists so the package compiles before the first build.

Two security header settings in `internal/http/routes/` matter if you add third-party content:

- In `routes.go`, keep `CrossOriginEmbedderPolicy` and `CrossOriginResourcePolicy` relaxed. The
  strict defaults silently break widgets, CDN assets and iframes.
- In `headers.go`, the content security policy allows only same-origin resources and `data:`
  images. For analytics, a chat widget or CDN fonts, add the host to `script-src`, `img-src` or
  `font-src`, and usually `connect-src` too. Frames need a new `frame-src` line. A missing entry
  shows up only as a CSP error in the browser console.

## Docker

`docker-compose.yml` runs Postgres only. For local work, run the database in Docker and the
service directly:

```bash
docker compose up -d db
cd api && make run
```

`api/Dockerfile` builds an API-only image. The site is on Vercel, so the image never embeds it:
`.dockerignore` keeps only the placeholder in `internal/static/dist/`. The image runs as a
non-root user on distroless and listens on `$PORT` (3000 when unset).

```bash
docker build -t portfolio-api api/
```

### Render and Neon

On Render, `render.yaml` at the repo root describes the service: Docker build from `api/`, health
check at `/api/health`, and Render sets `PORT`. The deploy steps are in DEPLOY.md. It needs these:

```
APP_ENV=production
CORS_ORIGINS=https://tenggis.vercel.app
JWT_SECRET=...                       # openssl rand -base64 32
DB_HOST=...  DB_USER=...  DB_PASSWORD=...  DB_NAME=...
DB_PORT=5432
DB_SSLMODE=require                   # Neon refuses plain connections
NOTIFY_DRIVER=resend
RESEND_API_KEY=...
NOTIFY_TO=...
VERCEL_DEPLOY_HOOK_URL=...
```

Take the Neon values from its connection string. Use the direct host, not the `-pooler` one:
migrations run at startup and need a session that the pooler doesn't keep. `DB_PORT` must be set,
because the default is 5436 for the local compose database.

Vercel rewrites `/api/*` to Render, so the browser sees one origin. Behind both proxies the API may
see one client address for everyone. Check that on the first deploy before trusting the rate
limits. See "Behind a proxy or load balancer" above.

## Tests

```bash
cd api && go test ./...
```

Integration tests need Docker. With colima instead of Docker Desktop, the tests fail with
"rootless Docker not found" unless you set both of these first:

```bash
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

Set env values in a test with `t.Setenv`. Don't write a second `.env`: the first one read wins for
the whole test binary.
