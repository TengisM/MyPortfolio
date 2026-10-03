import type { BlockId } from '@/blocks/registry'
import type { PageConfig } from '@/lib/types'

export const pages: PageConfig<BlockId>[] = [
  {
    id: 'home',
    path: '/',
    blocks: ['hero', 'contact', 'about', 'experience', 'projects'],
    seo: {
      mn: { title: 'Эхлэл', description: 'Хурдан, хайлтад оновчлогдсон вэб хуудас.' },
      en: { title: 'Home', description: 'A fast, search-optimised landing page.' },
    },
  },
]
