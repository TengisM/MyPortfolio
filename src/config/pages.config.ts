import type { BlockId } from '@/blocks/registry'
import type { PageConfig } from '@/lib/types'

export const pages: PageConfig<BlockId>[] = [
  {
    id: 'home',
    path: '/',
    // All on the plain surface: the rail and the type do the work, not alternating bands.
    blocks: [
      { id: 'hero', surface: 'default' },
      { id: 'about', surface: 'default' },
      { id: 'experience', surface: 'default' },
      { id: 'projects', surface: 'default' },
      { id: 'contact', surface: 'default' },
    ],
    seo: {
      mn: {
        title: 'Frontend / Fullstack инженер',
        description:
          'React, Next.js, TypeScript, Go дээр ажилладаг Frontend / Fullstack инженер Тэнгисийн портфолио: туршлага, төслүүд, холбоо барих.',
      },
      en: {
        title: 'Frontend / Fullstack Engineer',
        description:
          'Portfolio of Tenggis Munkhbaatar, a Frontend / Fullstack engineer working with React, Next.js, TypeScript and Go: experience, projects and contact.',
      },
    },
  },
]
