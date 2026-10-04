import { registry } from '@/blocks/registry'
import { Container } from '@/components/layout/container'
import { pages } from '@/config/pages.config'
import { localePath } from '@/lib/pages/enumerate'
import { normalizePath } from '@/lib/pages/resolve-request'
import type { Locale, SiteConfig } from '@/lib/types'
import { ThemeToggle } from '@/theme'

// Each language named in itself, the way a visitor looking for it would read it.
const LANGUAGE_NAME: Record<Locale, string> = { en: 'English', mn: 'Монгол' }

function labelFor(target: string, locale: Locale): string {
  const page = pages.find((p) => p.id === target)
  if (page) return page.seo[locale].title

  const manifest = registry[target as keyof typeof registry]
  if (manifest?.nav) {
    const copy = manifest.copy[locale] as Record<string, unknown>
    const label = copy[manifest.nav.labelKey]
    if (typeof label === 'string') return label
  }
  return target
}

export function Header({
  site,
  locale,
  path,
  resolve,
}: {
  site: SiteConfig
  locale: Locale
  path: string
  resolve: (target: string) => string
}) {
  const others = site.locales.filter((l) => l !== locale)
  const navLabel = locale === 'mn' ? 'Үндсэн цэс' : 'Main navigation'

  const pageLinks = site.nav.map((item) => (
    <a
      key={item.target}
      href={resolve(item.target)}
      className="hover:text-primary flex min-h-11 items-center transition-colors"
    >
      {labelFor(item.target, locale)}
    </a>
  ))

  const localeLinks = others.map((l) => (
    <a
      key={l}
      href={switchLocale(path, locale, l, site)}
      hrefLang={l}
      className="text-muted-foreground hover:text-primary flex min-h-11 items-center transition-colors"
    >
      {LANGUAGE_NAME[l]}
    </a>
  ))

  const themeToggle = <ThemeToggle label={locale === 'mn' ? 'Өнгө хувиргах' : 'Toggle theme'} />

  return (
    <header className="bg-background/95 sticky top-0 z-30 backdrop-blur">
      <Container className="flex items-center justify-between gap-4 py-3">
        {/* First name only; site.name stays complete for titles and JSON-LD. */}
        <a
          href={localePath('/', locale, site)}
          className="flex min-h-11 items-center font-semibold"
        >
          {site.name.split(' ')[0]}
        </a>

        <nav aria-label={navLabel} className="hidden items-center gap-7 text-sm md:flex">
          {pageLinks}
          {localeLinks}
          {themeToggle}
        </nav>

        <details className="relative md:hidden">
          <summary
            aria-label={locale === 'mn' ? 'Цэс' : 'Menu'}
            className="border-border rounded-base flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center border [&::-webkit-details-marker]:hidden"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ☰
            </span>
          </summary>
          <nav
            aria-label={navLabel}
            // Preset shadow token, not a fixed one, so it follows the preset.
            className="border-border bg-background rounded-base shadow-card absolute right-0 z-50 mt-2 flex w-56 flex-col border p-3 text-sm"
          >
            {pageLinks}
            <span className="border-border my-2 border-t" aria-hidden="true" />
            {localeLinks}
            {themeToggle}
          </nav>
        </details>
      </Container>
      {/* Fills left to right as you scroll the page. */}
      <span aria-hidden="true" className="scroll-progress" />
    </header>
  )
}

function switchLocale(path: string, from: Locale, to: Locale, site: SiteConfig): string {
  if (from === site.defaultLocale) return localePath(normalizePath(path), to, site)

  // Split into segments like resolveRequest does. A prefix regex misses non-canonical paths.
  const segments = normalizePath(path).split('/').filter(Boolean)
  const bare = `/${segments.slice(1).join('/')}`
  return localePath(normalizePath(bare), to, site)
}
