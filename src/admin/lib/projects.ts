import { apiFetch } from './api'

// Matches the API's JSON, so snake_case.
export type AdminProject = {
  id: string
  title: string
  url: string
  description_mn: string
  description_en: string
  published: boolean
  sort_order: number
  // `/api/content/logos/<id>?v=<unix>`. The `v` changes on every upload, so the browser cache
  // never shows an old logo.
  logo_url: string | null
  created_at: string
  updated_at: string
}

export type ProjectInput = {
  title: string
  url: string
  description_mn: string
  description_en: string
  published: boolean
}

type ProjectList = { items: AdminProject[] }

// The server sniffs the bytes and enforces both rules again. These copies only save an upload
// that would be refused.
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const LOGO_MAX_BYTES = 1024 * 1024

export type LogoType = (typeof LOGO_TYPES)[number]

export const isLogoType = (value: string): value is LogoType =>
  (LOGO_TYPES as readonly string[]).includes(value)

// In sort order.
export async function listProjects(): Promise<AdminProject[]> {
  return (await apiFetch<ProjectList>('/admin/projects')).items
}

// The server appends it at the end of the order.
export function createProject(input: ProjectInput): Promise<AdminProject> {
  return apiFetch<AdminProject>('/admin/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateProject(id: string, input: ProjectInput): Promise<AdminProject> {
  return apiFetch<AdminProject>(`/admin/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch<null>(`/admin/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// JSON with base64, not multipart: apiFetch sets a JSON content type on every body, and a logo
// is small enough that the extra third costs nothing.
export async function uploadProjectLogo(id: string, file: File): Promise<void> {
  await apiFetch<unknown>(`/admin/projects/${encodeURIComponent(id)}/logo`, {
    method: 'PUT',
    body: JSON.stringify({ content_type: file.type, data_base64: await toBase64(file) }),
  })
}

export async function deleteProjectLogo(id: string): Promise<void> {
  await apiFetch<unknown>(`/admin/projects/${encodeURIComponent(id)}/logo`, { method: 'DELETE' })
}

// `ids` must hold every project exactly once, or the server refuses the whole list.
export async function reorderProjects(ids: string[]): Promise<AdminProject[]> {
  const data = await apiFetch<ProjectList>('/admin/projects/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
  return data.items
}

// FileReader rather than btoa over the bytes: btoa needs a binary string, and building one from a
// 1 MB file char by char is slow.
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      // A data URL: `data:image/png;base64,<payload>`. The server wants the payload alone.
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
