import type { BlockManifest } from '@/lib/types'
import { type AboutCopy, en, mn } from './copy'

// No component import here: this file is imported eagerly by registry.ts, so anything reachable
// from it lands in the main chunk. Components are reached through ./variants.ts only.
const variantNames = ['simple'] as const

export type AboutVariant = (typeof variantNames)[number]

export const about = {
  id: 'about',
  variantNames,
  defaultVariant: 'simple',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
} satisfies BlockManifest<AboutCopy, AboutVariant>
