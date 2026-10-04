# Deploying

Three free services. The public site never waits on the other two.

| Piece | Host | Free plan limit that matters |
|---|---|---|
| Site (`dist/client`) | Vercel | none for this size |
| Go API (`api/`) | Render | 750 instance hours a month, sleeps after 15 min idle, wakes in 30-60 s |
| Postgres | Neon | 1 GB per project, sleeps after 5 min idle |
| Lead emails | Resend | 100 a day, and only to your own address until you verify a domain |

Vercel forwards `/api/*` to Render (see `vercel.json`), so the browser sees one origin. The admin
login cookie depends on that. Online Tron is the exception: Vercel can't forward a WebSocket, so
the game connects to Render directly (`VITE_TRON_WS` below).

Koyeb was the first plan for the API, but it closed its free plan to new accounts in February
2026.

Render's slow wake is hidden in three places:
- The site pings `/api/health` on a visitor's first touch, key or scroll (`src/components/wake-api.tsx`).
- Online Tron keeps retrying for 90 seconds and says the server is waking.
- The build waits up to two minutes for content.

## 1. Neon

1. Create a project. Copy host, database, user and password from the connection details.
2. Nothing else. The API runs its migrations on startup.

## 2. Resend

1. Sign up with the address that should receive lead emails.
2. Create an API key.

Until you verify a domain, Resend sends only from `onboarding@resend.dev` and only to the address
you signed up with. That's enough to get notified about your own leads.

## 3. Render (the API)

`render.yaml` describes the service, so most of this is clicks.

1. Sign in at render.com with the GitHub account that owns the repo.
2. New → Blueprint. Pick this repo and the branch `new-portfolia` (later `main`).
3. Render reads `render.yaml`: a free Docker web service in Frankfurt, built from `api/Dockerfile`,
   with the health check at `/api/health`. It generates `JWT_SECRET` itself. It asks for these:

```
DB_HOST=<neon host, the direct one without -pooler>
DB_USER=<neon user>
DB_PASSWORD=<neon password>
DB_NAME=<neon database>
RESEND_API_KEY=<from Resend>
NOTIFY_TO=<the address you signed up to Resend with>
VERCEL_DEPLOY_HOOK_URL=<leave empty, add it after Vercel exists>
```

4. Apply. The first build takes a few minutes. Then open
   `https://<your-service>.onrender.com/api/health`. It should answer `{"status":"ok",...}`.

Render sets `PORT` itself and the API listens on it. Pushes that only touch the site don't rebuild
the API (`buildFilter` in `render.yaml`).

### Load the content and create your admin account

Run these once, from your machine, against Neon. Put the same `DB_*` values in `api/.env` first
(with `APP_ENV=development` so the dev defaults apply to everything else):

```bash
cd api
make import-content file=../src/content/content.json
make seed-admin email=you@example.com
```

## 4. Vercel (the site)

1. In `vercel.json`, replace `YOUR-RENDER-APP.onrender.com` with your Render host. Commit.
2. Import the repo in Vercel. Framework preset: Other. The build settings come from `vercel.json`.
   Add the environment variable `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the pnpm version
   pinned in `package.json`.
3. Environment variables:

```
CONTENT_API_URL=https://<your-service>.onrender.com
VITE_CONTACT_ENDPOINT=/api/leads
VITE_TRON_WS=wss://<your-service>.onrender.com/api/tron/ws
```

   The game server only accepts sockets from pages listed in `CORS_ORIGINS` on Render, so the
   site's address must be there (it already is for the admin panel).

4. Settings → Git → Deploy Hooks: create one for the production branch. Copy the URL into
   Render (the service → Environment) as `VERCEL_DEPLOY_HOOK_URL` and save. Render redeploys.
5. Set the production domain to `tenggis.vercel.app` (or whatever `url` in
   `src/config/site.config.ts` says; they must match).
6. Analytics tab → Enable Web Analytics (free on Hobby). The site loads
   `/_vercel/insights/script.js` on every page. Until analytics is on, that file 404s, which
   shows as a console error and costs 4 points of Lighthouse's best-practices score.

`vercel.json` gives `/assets/*` a one-year immutable cache. Every file there has a content hash in
its name, so a new build never reuses a cached copy.

## How an edit goes live

1. You save a project in `/admin`.
2. The API waits 30 seconds for more edits, then calls the deploy hook.
3. Vercel runs `pnpm build`. `scripts/fetch-content.mjs` pulls `/api/content` and the logos, then
   the site prerenders.
4. About a minute later the change is live. The panel's sidebar shows when the last publish fired.

If the API is asleep and doesn't wake within two minutes, the build uses the committed
`src/content/content.json` and prints a warning. Run "Publish now" in the panel to try again.

## Check after the first deploy

The API rate-limits login and the contact form per client IP. Behind Vercel and Render it may see
the same IP for everyone. After the first deploy, submit the contact form and look at the `ip`
column of the new lead in Neon's SQL editor:

```sql
SELECT ip, created_at FROM leads ORDER BY created_at DESC LIMIT 5;
```

If it's your real IP, you're done. If it's a Vercel or Render address, set `PROXY_HEADER` and
`TRUSTED_PROXIES` on Render (see `api/README.md`). If that still isn't enough, the fallback is a
Vercel middleware that forwards the client IP with a shared secret.

## Online Tron

`tron online` in the terminal opens a room on the API and prints a four-letter code. Friends join
with `tron join CODE` or the link `/?tron=CODE`. Rooms live in the API's memory, so a redeploy or
Render putting the API to sleep ends every match. A match in progress keeps it awake: Render counts
WebSocket messages as activity. If the API is asleep, the first player waits up to a minute while
it wakes. The game says so and connects on its own.

## A custom domain later

Buy the domain, add it in Vercel, then change `url` in `src/config/site.config.ts` and
`CORS_ORIGINS` on Render to match. Nothing else changes.
