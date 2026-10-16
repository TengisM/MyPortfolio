import type { Locale } from '@/lib/types'
import raw from './content.json'

// The shape of content.json. scripts/fetch-content.mjs writes it from GET /api/content at build
// time, and the committed copy is the fallback when the API is unreachable.
export type Localized = Record<Locale, string>

export type ContentProject = {
  id: string
  title: string
  url: string
  /** A path under public/, or null when the project has no logo. */
  logo: string | null
  description: Localized
}

export type ContentExperience = {
  id: string
  kind: 'work' | 'education'
  organization: Localized
  position: Localized
  description: Localized
  /** YYYY-MM-DD */
  start_date: string
  /** YYYY-MM-DD, or null for a current role. */
  end_date: string | null
}

export type ContentSnapshot = {
  projects: ContentProject[]
  experience: ContentExperience[]
}

// The JSON import types `kind` as string. The fetch script only writes what the API validated.
export const content = raw as ContentSnapshot

// Newest first. The API already sorts this way; sorting here keeps a hand-edited file honest.
export const experienceNewestFirst: ContentExperience[] = [...content.experience].sort((a, b) =>
  b.start_date.localeCompare(a.start_date),
)
