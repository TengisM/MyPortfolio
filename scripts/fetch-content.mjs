// Pulls projects and experience from the API into src/content/content.json and their logos into
// public/content/logos/, so the prerendered pages carry whatever /admin last saved.
//
// Runs before `vite build` when CONTENT_API_URL is set (the API's own origin, not the site's).
// It never fails the build: if the API stays unreachable, the committed snapshot is used and a
// warning is printed. The free API host (Render) sleeps after 15 idle minutes and takes 30-60 s to
// wake, hence the long request timeout and retry window.

import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const API = process.env.CONTENT_API_URL?.replace(/\/+$/, '')
const SNAPSHOT = 'src/content/content.json'
const LOGO_DIR = 'public/content/logos'
const RETRY_WINDOW_MS = 120_000
const REQUEST_TIMEOUT_MS = 75_000

const EXT_BY_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

function warn(msg) {
  console.warn(`\n⚠ fetch-content: ${msg}\n  Building from the committed ${SNAPSHOT}.\n`)
}

async function fetchWithTimeout(url) {
  return fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
}

// Retries network errors and 5xx until the window closes. A 4xx will not fix itself, so it stops.
async function fetchContent() {
  const deadline = Date.now() + RETRY_WINDOW_MS
  let lastError = 'no attempt made'
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(`${API}/api/content`)
      if (res.ok) return (await res.json()).data
      lastError = `GET /api/content answered ${res.status}`
      if (res.status < 500) break
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, 2_000))
  }
  throw new Error(lastError)
}

function assertShape(data) {
  if (!data || !Array.isArray(data.projects) || !Array.isArray(data.experience)) {
    throw new Error('GET /api/content returned an unexpected shape')
  }
}

async function main() {
  if (!API) {
    console.log('fetch-content: CONTENT_API_URL is not set, using the committed snapshot.')
    return
  }

  let data
  try {
    data = await fetchContent()
    assertShape(data)
  } catch (err) {
    warn(err.message)
    return
  }

  // Download every logo into a staging dir first. Only when all of them arrive does the snapshot
  // change, so a half-finished run never leaves content.json pointing at missing files.
  const staging = `${LOGO_DIR}.staging`
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })

  const projects = []
  try {
    for (const p of data.projects) {
      let logo = null
      if (p.logo) {
        const res = await fetchWithTimeout(`${API}${p.logo}`)
        if (!res.ok) throw new Error(`logo for ${p.title} answered ${res.status}`)
        const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
        const ext = EXT_BY_TYPE[type]
        if (!ext) throw new Error(`logo for ${p.title} has unexpected type ${type}`)
        const file = `${p.id}.${ext}`
        await writeFile(join(staging, file), Buffer.from(await res.arrayBuffer()))
        logo = `/content/logos/${file}`
      }
      projects.push({ id: p.id, title: p.title, url: p.url, logo, description: p.description })
    }
  } catch (err) {
    await rm(staging, { recursive: true, force: true })
    warn(err.message)
    return
  }

  const experience = data.experience.map((e) => ({
    id: e.id,
    kind: e.kind,
    organization: e.organization,
    position: e.position,
    description: e.description,
    start_date: e.start_date,
    end_date: e.end_date,
  }))

  await rm(LOGO_DIR, { recursive: true, force: true })
  await rename(staging, LOGO_DIR)
  await writeFile(SNAPSHOT, `${JSON.stringify({ projects, experience }, null, 2)}\n`)

  const logos = (await readdir(LOGO_DIR)).length
  console.log(
    `fetch-content: ${projects.length} projects, ${experience.length} experience entries, ${logos} logos.`,
  )
}

await main()
