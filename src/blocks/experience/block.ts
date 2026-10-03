import type { BlockManifest } from '@/lib/types'
import { type ExperienceCopy, en, mn } from './copy'

// No component import here: this file is imported eagerly by registry.ts, so anything reachable
// from it lands in the main chunk. Components are reached through ./variants.ts only.
const variantNames = ['simple'] as const

export type ExperienceVariant = (typeof variantNames)[number]

export const experience = {
  id: 'experience',
  variantNames,
  defaultVariant: 'simple',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
} satisfies BlockManifest<ExperienceCopy, ExperienceVariant>
