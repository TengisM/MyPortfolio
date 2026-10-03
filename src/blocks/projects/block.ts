import type { BlockManifest } from '@/lib/types'
import { en, mn, type ProjectsCopy } from './copy'

// No component import here: this file is imported eagerly by registry.ts, so anything reachable
// from it lands in the main chunk. Components are reached through ./variants.ts only.
const variantNames = ['simple'] as const

export type ProjectsVariant = (typeof variantNames)[number]

export const projects = {
  id: 'projects',
  variantNames,
  defaultVariant: 'simple',
  copy: { mn, en },
  // Add `nav: { labelKey: 'heading' }` to put this block in the header menu.
  // Add `requires: { blocks: ['contact'] }` if this block's copy links to another block.
} satisfies BlockManifest<ProjectsCopy, ProjectsVariant>
