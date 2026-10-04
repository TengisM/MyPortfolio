import type { BlockManifest } from '@/lib/types'
import { en, type HeroCopy, mn } from './copy'

// Never import a component here. Manifests load eagerly, so a component would land in the main
// chunk. Derive the variant type from `variantNames`; never write that union by hand.
const variantNames = ['split', 'poster'] as const

// variants.ts uses this so a missing component is a compile error.
export type HeroVariant = (typeof variantNames)[number]

export const hero = {
  id: 'hero',
  variantNames,
  defaultVariant: 'poster',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema`: every page already gets a WebPage node. Use it for FAQPage, Product and the like.
  // copy.ts links to 'contact' (primaryCta) and 'about' (the scroll badge). Keep this in sync.
  requires: { blocks: ['contact', 'about'] },
} satisfies BlockManifest<HeroCopy, HeroVariant>
