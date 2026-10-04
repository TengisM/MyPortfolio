import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import type { MarqueeVariant } from './block'
import type { MarqueeCopy } from './copy'
import { MarqueeSimple } from './marquee-simple'

// The only static import of these components anywhere — that is what gives Vite its split point.
// `satisfies` makes a variant named in block.ts but missing here a compile error.
export const variants = {
  simple: MarqueeSimple,
} satisfies Record<MarqueeVariant, ComponentType<BlockProps<MarqueeCopy>>>
