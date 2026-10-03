import type { SiteConfig } from '@/lib/types'

// Annotated `: SiteConfig`, not `satisfies SiteConfig`. `satisfies` narrows every value here to
// the literal that was written, so `mode: 'light'` stops being `'light' | 'dark' | 'both'` and any
// `site.theme.mode === 'both'` check becomes a TS2367 "no overlap" error rather than a comparison.
export const site: SiteConfig = {
  name: 'Your Company',
  // Replace this before you ship. `pnpm verify` fails while it is still here, on purpose: every
  // canonical URL, hreflang tag and sitemap entry is built from it, and a wrong one is invisible
  // on the page while ranking the site as a duplicate of a domain nobody owns.
  url: 'https://your-domain.example',
  defaultLocale: 'mn',
  locales: ['mn', 'en'],
  ogImageDefault: '/og-default.jpg',
  organization: {
    kind: 'Organization',
    legalName: 'Your Company LLC',
    logo: '/logo.svg',
    email: 'hello@your-domain.example',
    phone: '+976 0000 0000',
    address: { country: 'MN', city: 'Ulaanbaatar', street: 'Street address', postalCode: '00000' },
  },
  nav: [{ target: 'hero' }, { target: 'contact' }],
  // `both` gives light, dark and a toggle. Change it to `'dark'` or `'light'` to pin the
  // site to one palette, which also drops the toggle and all theme-switching JavaScript.
  theme: { mode: 'dark' },
}
