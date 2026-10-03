import type { BlockId } from '@/blocks/registry'
import type { PageConfig } from '@/lib/types'

export const pages: PageConfig<BlockId>[] = [
  {
    id: 'home',
    path: '/',
    blocks: ['hero', 'about', 'experience', 'projects', 'contact'],
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
