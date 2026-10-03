import { content } from '@/content'
import type { Locale } from '@/lib/types'

export type ProjectItem = {
  id: string
  title: string
  url: string
  logo: string | null
  description: string
}

export type ProjectsCopy = {
  navLabel: string
  heading: string
  lead: string
  visitLabel: string
  items: ProjectItem[]
}

function itemsFor(locale: Locale): ProjectItem[] {
  return content.projects.map((p) => ({
    id: p.id,
    title: p.title,
    url: p.url,
    logo: p.logo,
    description: p.description[locale],
  }))
}

export const mn: ProjectsCopy = {
  navLabel: 'Төслүүд',
  heading: 'Төслүүд',
  lead: 'Миний хөгжүүлэлтэд оролцсон бүтээгдэхүүнүүд.',
  visitLabel: 'Үзэх',
  items: itemsFor('mn'),
}

export const en: ProjectsCopy = {
  navLabel: 'Projects',
  heading: 'Projects',
  lead: "Products I've helped build.",
  visitLabel: 'Visit',
  items: itemsFor('en'),
}
