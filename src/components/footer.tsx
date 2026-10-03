import { Container } from '@/components/layout/container'
import type { SiteConfig } from '@/lib/types'

const LINK = 'hover:text-primary transition-colors'

export function Footer({ site }: { site: SiteConfig }) {
  const { organization: org } = site
  return (
    <footer className="border-border bg-muted border-t">
      <Container className="text-muted-foreground flex flex-wrap items-center justify-between gap-4 py-10 text-sm">
        <p className="font-mono">
          {'<> '}© {new Date().getFullYear()} {org.legalName ?? site.name}
          {' </>'}
        </p>
        <p className="flex flex-wrap gap-4">
          {org.email ? (
            <a className={LINK} href={`mailto:${org.email}`}>
              {org.email}
            </a>
          ) : null}
          <a
            className={LINK}
            href="https://github.com/TengisM"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            className={LINK}
            href="https://www.linkedin.com/in/tenggis-munkhbaatar-2a32b025a/"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
          <a className={LINK} href="/files/config.cfg" download>
            CFG
          </a>
        </p>
      </Container>
    </footer>
  )
}
