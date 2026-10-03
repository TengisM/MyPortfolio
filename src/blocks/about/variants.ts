import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import { AboutSimple } from './about-simple'
import type { AboutVariant } from './block'
import type { AboutCopy } from './copy'

// The only static import of these components anywhere — that is what gives Vite its split point.
// `satisfies` makes a variant named in block.ts but missing here a compile error.
export const variants = {
  simple: AboutSimple,
} satisfies Record<AboutVariant, ComponentType<BlockProps<AboutCopy>>>
