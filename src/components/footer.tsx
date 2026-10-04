import { Container } from '@/components/layout/container'
import type { SiteConfig } from '@/lib/types'

const LINK = 'hover:text-primary underline-offset-4 hover:underline'

export function Footer({ site }: { site: SiteConfig }) {
  const { organization: org } = site
  return (
    <footer>
      <Container className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-4 border-t py-8 text-sm">
        <p>
          © {new Date().getFullYear()} {org.legalName ?? site.name}
        </p>
        <p className="flex flex-wrap gap-5">
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
          <a className={LINK} href="/files/Tenggis_CV.pdf" download>
            CV
          </a>
          <a className={LINK} href="/files/config.cfg" download>
            config.cfg
          </a>
        </p>
      </Container>
    </footer>
  )
}
