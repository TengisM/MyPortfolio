import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import type { ExperienceVariant } from './block'
import type { ExperienceCopy } from './copy'
import { ExperienceSimple } from './experience-simple'

// The only static import of these components anywhere — that is what gives Vite its split point.
// `satisfies` makes a variant named in block.ts but missing here a compile error.
export const variants = {
  simple: ExperienceSimple,
} satisfies Record<ExperienceVariant, ComponentType<BlockProps<ExperienceCopy>>>
