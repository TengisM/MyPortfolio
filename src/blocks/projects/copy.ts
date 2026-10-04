import { content } from '@/content'
import type { Locale } from '@/lib/types'

export type ProjectItem = {
  id: string
  title: string
  url: string
  logo: string | null
  /** A screenshot of the live site, or null to show a designed card instead. */
  shot: string | null
  description: string
}

export type ProjectsCopy = {
  navLabel: string
  heading: string
  lead: string
  visitLabel: string
  items: ProjectItem[]
}

// Screenshots live in src/content/shots/<project id>.webp, so Vite fingerprints them. A project
// added in /admin has none until one is dropped in there; its card falls back to the logo.
const shots = import.meta.glob<string>('../../content/shots/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})
const shotFor = (id: string): string | null => shots[`../../content/shots/${id}.webp`] ?? null

function itemsFor(locale: Locale): ProjectItem[] {
  return content.projects.map((p) => ({
    id: p.id,
    title: p.title,
    url: p.url,
    logo: p.logo,
    shot: shotFor(p.id),
    description: p.description[locale],
  }))
}

export const mn: ProjectsCopy = {
  navLabel: 'Төслүүд',
  heading: 'Миний бүтээсэн зүйлс',
  lead: 'Хөгжүүлэлтэд нь оролцсон бүтээгдэхүүнүүд.',
  visitLabel: 'Үзэх',
  items: itemsFor('mn'),
}

export const en: ProjectsCopy = {
  navLabel: 'Projects',
  heading: "Things I've built",
  lead: "Products I've helped build.",
  visitLabel: 'Visit',
  items: itemsFor('en'),
}
