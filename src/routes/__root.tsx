import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router'
import { Analytics } from '@vercel/analytics/react'
import { ScrollEffects } from '@/components/scroll-effects'
import { ViewScript } from '@/components/view-script'
import { site } from '@/config/site.config'
import { ThemeScript } from '@/theme'
import '@/styles/theme.css'

export const Route = createRootRoute({
  head: () => ({
    links: [
      { rel: 'icon', type: 'image/png', href: '/favicon.png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  component: RootDocument,
})

function useActiveLocale(): string {
  const matches = useRouterState({ select: (s) => s.matches })
  for (let i = matches.length - 1; i >= 0; i--) {
    const data = matches[i]?.loaderData as { locale?: string } | undefined
    if (data?.locale) return data.locale
  }
  return site.defaultLocale
}

function RootDocument() {
  const lang = useActiveLocale()
  return (
    <html lang={lang} className={site.theme.mode === 'dark' ? 'dark' : undefined}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
        <ThemeScript />
        <ViewScript />
      </head>
      <body>
        <Outlet />
        <ScrollEffects />
        {/* A no-op outside Vercel, so local and preview builds are unaffected. */}
        <Analytics />
        <Scripts />
      </body>
    </html>
  )
}
