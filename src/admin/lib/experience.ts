import { apiFetch } from './api'

// A tuple, not a plain array: z.enum needs one.
export const EXPERIENCE_KINDS = ['work', 'education'] as const

export type ExperienceKind = (typeof EXPERIENCE_KINDS)[number]

// Matches the API's JSON, so snake_case. Dates are plain `YYYY-MM-DD`, with no time or zone.
export type AdminExperience = {
  id: string
  kind: ExperienceKind
  organization_mn: string
  organization_en: string
  position_mn: string
  position_en: string
  description_mn: string
  description_en: string
  start_date: string
  // `null` means the role is ongoing.
  end_date: string | null
  published: boolean
  created_at: string
  updated_at: string
}

export type ExperienceInput = Omit<AdminExperience, 'id' | 'created_at' | 'updated_at'>

type ExperienceList = { items: AdminExperience[] }

// Newest `start_date` first. The table keeps this order.
export async function listExperience(): Promise<AdminExperience[]> {
  return (await apiFetch<ExperienceList>('/admin/experience')).items
}

export function createExperience(input: ExperienceInput): Promise<AdminExperience> {
  return apiFetch<AdminExperience>('/admin/experience', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateExperience(id: string, input: ExperienceInput): Promise<AdminExperience> {
  return apiFetch<AdminExperience>(`/admin/experience/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteExperience(id: string): Promise<void> {
  await apiFetch<null>(`/admin/experience/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
