# Portfolio on landing-kit, with a content admin

Date: 2026-10-03. Branch: `new-portfolia`. Project 1 of 2 (project 2 is the Three.js redesign).

## Goal

Rebuild tenggis.vercel.app on `@tanasoftllc/landing-kit@0.5.1` with `--backend=admin`, and extend
the admin panel so projects and experience are edited in `/admin` instead of in JSON files. Hosting
stays free. Edits go live through a rebuild.

## Decisions

| Question | Answer |
|---|---|
| Admin scope | Leads (kit default) plus CRUD for projects and experience |
| Content flow | Prerendered at build. A save triggers a Vercel deploy hook after a 30 s debounce |
| Hosting | Vercel (static site, `tenggis.vercel.app`), Koyeb free (Go API), Neon free (Postgres) |
| Same origin | Vercel rewrites `/api/*` to Koyeb, so the panel and the API share one origin |
| Lead email | New `resend` notify driver. Resend's free plan sends to the owner's own inbox |
| Languages | Mongolian at `/`, English at `/en`, as the kit requires. Claude drafts the Mongolian |
| Theme | Dark only |
| Kept from the old site | Photos, project logos, the CV PDF, `config.cfg` download, `/love`, Vercel Analytics |

## Site

One page. Blocks in order: `hero` (split), `about`, `experience`, `projects`, `contact`.

- `hero` and `about` copy lives in each block's `copy.ts`.
- `experience` and `projects` read `src/content/content.json` (shape below). The file is committed,
  so a build with no API reachable still produces a full site from the last snapshot.
- Files: `public/files/Tenggis_CV.pdf`, `public/files/config.cfg`. Plain links, no routes.
- `/love` is a standalone route file, outside the block system, `noindex`.

## Content snapshot: `src/content/content.json`

```json
{
  "projects": [
    {
      "id": "uuid",
      "title": "Tetgeleg",
      "url": "https://tetgeleg.mn/",
      "logo": "/content/logos/<id>.png",
      "description": { "mn": "...", "en": "..." }
    }
  ],
  "experience": [
    {
      "id": "uuid",
      "kind": "work",
      "organization": { "mn": "...", "en": "..." },
      "position": { "mn": "...", "en": "..." },
      "description": { "mn": "...", "en": "..." },
      "start_date": "2026-04-01",
      "end_date": null
    }
  ]
}
```

- `logo` is a path under `public/` or `null`. `kind` is `work` or `education`.
- `description` strings may be empty; the block hides an empty one.
- Projects keep array order. Experience is sorted by `start_date` descending.

## API additions (Go, in `api/`)

All responses use the kit's envelope: `{"success": true, "data": ...}`. Errors use
`{"error": "...", "message": "..."}` like the existing handlers.

### Tables

`projects`: `id uuid pk`, `title text`, `url text`, `description_mn text`, `description_en text`,
`sort_order int`, `published bool default true`, `logo bytea null`, `logo_content_type text null`,
`created_at`, `updated_at`.

`experience`: `id uuid pk`, `kind text check in ('work','education')`, `organization_mn`,
`organization_en`, `position_mn`, `position_en`, `description_mn text default ''`,
`description_en text default ''`, `start_date date`, `end_date date null`,
`published bool default true`, `created_at`, `updated_at`.

### Public

- `GET /api/content` returns published rows in the snapshot shape, except `logo` is
  `"/api/content/logos/<id>?v=<updated_at unix>"` or `null`. `Cache-Control: public, max-age=60`.
- `GET /api/content/logos/:id` returns the logo bytes with their content type,
  `Cache-Control: public, max-age=86400`. 404 if none.

### Admin (Bearer token, existing middleware, `no-store`)

- `GET /api/admin/projects` returns `{"items": [AdminProject]}`, all rows, by `sort_order`.
- `POST /api/admin/projects` creates one, appended at the end. `PUT /api/admin/projects/:id`
  updates. Body for both: `{title, url, description_mn, description_en, published}`. Returns
  `AdminProject`.
- `DELETE /api/admin/projects/:id` returns `null`.
- `PUT /api/admin/projects/:id/logo` with `{content_type, data_base64}`. The server sniffs the bytes
  and accepts only PNG, JPEG and WebP, at most 1 MB decoded. `DELETE` on the same path removes it.
- `POST /api/admin/projects/reorder` with `{ids: [...]}`. The list must hold every project id
  exactly once. Returns `{"items": [...]}`.
- `GET|POST /api/admin/experience`, `PUT|DELETE /api/admin/experience/:id`. Body:
  `{kind, organization_mn, organization_en, position_mn, position_en, description_mn,
  description_en, start_date, end_date, published}`, dates as `YYYY-MM-DD`, `end_date` nullable and
  not before `start_date`. List is by `start_date` descending.
- `GET /api/admin/publish` returns `{configured, pending, last_triggered_at, last_error}`.
  `POST /api/admin/publish` fires the deploy hook now and returns the same.

`AdminProject` is `{id, title, url, description_mn, description_en, published, sort_order,
logo_url, created_at, updated_at}` with `logo_url` as in `/api/content`. `AdminExperience` is the
table's columns, dates as `YYYY-MM-DD`.

Validation: titles, organizations and positions 1-200 chars; `url` must be `http(s)://`;
descriptions up to 2000 chars. Bad input is a 400 with `error: "validation error"`.

CORS `AllowMethods` gains `PUT, DELETE`.

### Publishing

A publisher service holds one timer. Every successful content write resets it to
`PUBLISH_DEBOUNCE_SECONDS` (default 30). When it fires, it POSTs to `VERCEL_DEPLOY_HOOK_URL`.
With that unset, it logs and reports `configured: false`. State is in memory.

### Import

`go run ./cmd import-content <path>` reads a snapshot file, reads each `logo` from `../public`,
and inserts everything. It refuses if either table already has rows. Make target:
`make import-content file=../src/content/content.json`.

### Notify

`NOTIFY_DRIVER=resend` with `RESEND_API_KEY`, `NOTIFY_TO`, and `RESEND_FROM` (default
`onboarding@resend.dev`). Allowed in production.

## Build-time fetch

`scripts/fetch-content.mjs` runs before `vite build` when `CONTENT_API_URL` is set. It retries
`GET /api/content` for up to 20 s, downloads each logo to `public/content/logos/<id>.<ext>`, and
rewrites `content.json`. On failure it keeps the committed file and warns. It never fails the
build.

## Admin panel

New nav items next to Leads: Projects and Experience. Each is a table plus an edit sheet built from
the kit's shadcn parts. Mongolian and English fields side by side. Publish toggle per row. Projects
get up/down reorder and logo upload. The shell shows the publish status and a "Publish now" button.

## Deployment

- `vercel.json`: build `pnpm build`, output the prerendered dir, rewrite `/api/:path*` to the
  Koyeb URL, and `/admin/:path*` to the panel shell.
- `api/Dockerfile`: API-only binary for Koyeb.
- Neon: `DB_SSLMODE=require`.
- Known risk: behind Vercel and Koyeb the API may see one IP for everyone, which would make the
  login and contact rate limits global. Check on the first preview deploy. Fix if needed: a Vercel
  middleware that forwards the client IP with a shared secret.

## Testing

- Go: service and handler tests against Docker Postgres, as the kit's lead tests do.
- Web: `pnpm verify` (Biome, tsc, conventions, build checks, sqlc diff, Go build, lint, tests).
- Manual: Docker Compose end to end. Log in, edit a project, see the snapshot change on rebuild.

## Out of scope

Three.js (project 2), a blog, a light theme, a custom domain, audit rows for content edits.
