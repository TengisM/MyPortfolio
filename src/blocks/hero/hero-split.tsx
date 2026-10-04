import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { SCRIPT_NAME } from '@/components/script-rail'
import type { BlockProps } from '@/lib/types'
import type { HeroCopy } from './copy'
import { LocalTime } from './local-time'

const LINK =
  'text-primary underline decoration-1 underline-offset-4 transition-all hover:decoration-2'

export function HeroSplit({
  copy,
  site,
  resolve,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<HeroCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <div className="grid gap-10 md:grid-cols-12">
          <div className="min-w-0 md:col-span-9">
            <div className="flex items-start justify-between gap-6">
              <H className="font-stretch-condensed min-w-0 text-5xl leading-none font-semibold tracking-tight text-balance sm:text-6xl md:text-8xl">
                {copy.heading}
              </H>
              {/* Phones have no rail, so the script sits beside the name instead. */}
              <span
                aria-hidden="true"
                className="script script-ink text-primary shrink-0 text-5xl md:hidden"
              >
                {SCRIPT_NAME}
              </span>
            </div>
            <p className="mt-6 text-xl font-medium md:text-2xl">{copy.role}</p>
            <p className="text-muted-foreground mt-4 text-lg text-pretty md:w-5/6">{copy.lead}</p>

            <dl className="border-border mt-12 grid grid-cols-2 gap-8 border-t pt-6 md:w-2/3">
              {copy.cities.map((c) => (
                <div key={c.timeZone}>
                  <dt className="text-muted-foreground text-sm">{c.label}</dt>
                  <dd className="mt-1 text-3xl font-medium">
                    <LocalTime timeZone={c.timeZone} />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground mt-3 text-sm">{copy.moving}</p>

            <p className="mt-10 flex flex-wrap gap-x-6 gap-y-3">
              <a className={LINK} href={resolve(copy.primaryCta.target)}>
                {copy.primaryCta.label}
              </a>
              {site.organization.email ? (
                <a className={LINK} href={`mailto:${site.organization.email}`}>
                  {copy.emailLabel}
                </a>
              ) : null}
              {copy.socials.map((s) => (
                <a
                  key={s.href}
                  className={LINK}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.label}
                </a>
              ))}
              <a className={LINK} href={copy.cv.href} download>
                {copy.cv.label}
              </a>
            </p>
          </div>

          {copy.image ? (
            <div className="hidden md:col-span-3 md:block md:self-end">
              <img
                src={copy.image.src}
                alt={copy.image.alt}
                width={copy.image.width}
                height={copy.image.height}
                fetchPriority="high"
                className="aspect-square w-full object-cover"
              />
            </div>
          ) : null}
        </div>
      </Container>
    </Section>
  )
}
