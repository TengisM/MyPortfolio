import { Container } from '@/components/layout/container'
import type { SiteConfig } from '@/lib/types'

const LINK = 'hover:underline underline-offset-4 decoration-2'

// Continues the blue of the contact section.
export function Footer({ site }: { site: SiteConfig }) {
  const { organization: org } = site
  return (
    <footer className="surface-blue bg-background text-foreground">
      <Container className="border-border flex flex-wrap items-center justify-between gap-3 border-t py-4 text-xs font-semibold">
        <p className="font-display font-bold uppercase">
          © {new Date().getFullYear()} {org.legalName ?? site.name}
        </p>
        <p className="flex flex-wrap gap-4 tracking-wide uppercase">
          <a
            className={LINK}
            href="https://github.com/TengisM"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub ↗
          </a>
          <a
            className={LINK}
            href="https://www.linkedin.com/in/tenggis-munkhbaatar-2a32b025a/"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn ↗
          </a>
          <a className={LINK} href="/files/Tenggis_CV.pdf" download>
            CV
          </a>
          <a className={LINK} href="/files/config.cfg" download>
            CFG
          </a>
        </p>
      </Container>
    </footer>
  )
}
