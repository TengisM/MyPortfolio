import type { SiteConfig } from '@/lib/types'

// Annotated `: SiteConfig`, not `satisfies SiteConfig`. `satisfies` narrows every value here to
// the literal that was written, so `mode: 'light'` stops being `'light' | 'dark' | 'both'` and any
// `site.theme.mode === 'both'` check becomes a TS2367 "no overlap" error rather than a comparison.
export const site: SiteConfig = {
  name: 'Tenggis Munkhbaatar',
  // Every canonical URL, hreflang tag and sitemap entry is built from this. Change it when the
  // site moves to its own domain.
  url: 'https://tenggis.vercel.app',
  defaultLocale: 'mn',
  locales: ['mn', 'en'],
  ogImageDefault: '/og-default.jpg',
  organization: {
    kind: 'Organization',
    legalName: 'Tenggis Munkhbaatar',
    logo: '/logo.png',
    email: 'diditrimorum72@gmail.com',
    address: { country: 'MN', city: 'Ulaanbaatar' },
    sameAs: [
      'https://github.com/TengisM',
      'https://www.linkedin.com/in/tenggis-munkhbaatar-2a32b025a/',
    ],
  },
  nav: [
    { target: 'about' },
    { target: 'experience' },
    { target: 'projects' },
    { target: 'contact' },
  ],
  theme: { mode: 'dark' },
}
