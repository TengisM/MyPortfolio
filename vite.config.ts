import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pages } from './src/config/pages.config.ts'
import { site } from './src/config/site.config.ts'
import { enumerateUrls } from './src/lib/pages/enumerate.ts'
import { emitSeoFiles } from './src/lib/seo/emit-plugin.ts'
import { OUT_DIR } from './src/lib/seo/out-dir.ts'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // Read by `src/lib/seo/block-preloads.ts` at prerender time: dist/client/.vite/manifest.json
  // maps each block's `variants.ts` to its built chunk, so the prerendered <head> can
  // modulepreload exactly the chunks a page's blocks need.
  build: { manifest: true },
  // The panel calls the API with relative paths, so this makes development same-origin the way
  // production already is, where the Go binary serves the site and the API together.
  //
  // Same-origin is what makes `credentials: 'same-origin'` enough to send the refresh cookie. It
  // is also why nothing the panel sends is preflighted, why development needs no entry in the
  // API's origin allowlist, and why the panel has no base URL to configure.
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000' },
    },
  },
  resolve: {
    alias: {
      '@/motion': r('./src/integrations/motion.animated.tsx'),
      // Read from the config, not frozen at scaffold time: changing `theme.mode` in
      // src/config/site.config.ts switches the site between light, dark and both. Resolved
      // during the build, so a pinned mode still bundles no theme-switching code.
      '@/theme':
        site.theme.mode === 'both'
          ? r('./src/integrations/theme.both.tsx')
          : r('./src/integrations/theme.single.tsx'),
      '@/submit': r('./src/integrations/submit.endpoint.ts'),
      '@/config': r('./src/config'),
      // Must stay LAST: '@' is a catch-all and would shadow the specific aliases above.
      '@': r('./src'),
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // By default these are found by filename directly under `src/`. They live in `src/app/`
      // here, so each one must be named. The paths are relative to `src/`.
      router: { entry: './app/router.tsx', generatedRouteTree: './app/routeTree.gen.ts' },
      client: { entry: './app/client.tsx' },
      server: { entry: './app/server.ts' },
      prerender: {
        enabled: true,
        // Both false is what keeps /docs (absent from pages.config.ts) out of prerendering —
        // flip either and it prerenders into dist/client with no other warning in the source.
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
        concurrency: 8,
      },
      pages: [
        ...enumerateUrls(pages, site).map((u) => ({
          path: u.path,
          prerender: { enabled: true, outputPath: u.outputPath },
        })),
        // Appended here, never added to pages.config.ts. Going through pages.config.ts would put
        // /admin in enumerateUrls, and from there into the sitemap, the nav and the SEO layer,
        // which is the opposite of what a noindex route wants.
        //
        // It is here at all because the Go binary answers every /admin URL by falling back to one
        // file (api/internal/static/static.go). Delete this line and the only file left to fall
        // back to is the prerendered home page, so a hard load of /admin/leads paints the landing
        // hero until hydration replaces it.
        //
        // What lands in the file is the index route's `pendingComponent` (PanelSkeleton):
        // src/routes/admin/index.tsx is `ssr: false` with no `component` at all, so the
        // prerenderer emits the pending frame, which is the skeleton.
        { path: '/admin', prerender: { enabled: true, outputPath: '/admin/index.html' } },
        // Same reason as /admin: a standalone route outside pages.config.ts. Static hosting has
        // no server to render it, so it must exist as a file.
        { path: '/love', prerender: { enabled: true, outputPath: '/love/index.html' } },
      ],
    }),
    viteReact(),
    emitSeoFiles({ pages, site, outDir: OUT_DIR }),
  ],
})
