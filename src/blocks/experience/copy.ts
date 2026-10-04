import { type ContentExperience, experienceNewestFirst } from '@/content'
import type { Locale } from '@/lib/types'

export type ExperienceItem = {
  id: string
  kind: 'work' | 'education'
  organization: string
  position: string
  description: string
  period: string
  current: boolean
}

export type ExperienceCopy = {
  navLabel: string
  heading: string
  items: ExperienceItem[]
}

const EN_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

// Fixed tables, not Intl: the server and the browser can ship different ICU data, and a
// mismatched string breaks hydration.
function formatMonth(iso: string, locale: Locale): string {
  const [y, m] = iso.split('-')
  const month = Number(m)
  return locale === 'mn' ? `${y}.${m}` : `${EN_MONTHS[month - 1]} ${y}`
}

function formatPeriod(e: ContentExperience, locale: Locale, present: string): string {
  // Degrees read as years. Months there are guesses anyway.
  if (e.kind === 'education') {
    return `${e.start_date.slice(0, 4)} – ${e.end_date?.slice(0, 4) ?? present}`
  }
  const end = e.end_date ? formatMonth(e.end_date, locale) : present
  return `${formatMonth(e.start_date, locale)} – ${end}`
}

function itemsFor(locale: Locale, present: string): ExperienceItem[] {
  return experienceNewestFirst.map((e) => ({
    id: e.id,
    kind: e.kind,
    organization: e.organization[locale],
    position: e.position[locale],
    description: e.description[locale],
    period: formatPeriod(e, locale, present),
    current: e.end_date === null,
  }))
}

export const mn: ExperienceCopy = {
  navLabel: 'Туршлага',
  heading: 'Ажил',
  items: itemsFor('mn', 'одоо'),
}

export const en: ExperienceCopy = {
  navLabel: 'Experience',
  heading: 'Work',
  items: itemsFor('en', 'now'),
}
