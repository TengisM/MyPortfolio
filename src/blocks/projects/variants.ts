import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import type { ProjectsVariant } from './block'
import type { ProjectsCopy } from './copy'
import { ProjectsSimple } from './projects-simple'

// The only static import of these components anywhere — that is what gives Vite its split point.
// `satisfies` makes a variant named in block.ts but missing here a compile error.
export const variants = {
  simple: ProjectsSimple,
} satisfies Record<ProjectsVariant, ComponentType<BlockProps<ProjectsCopy>>>
