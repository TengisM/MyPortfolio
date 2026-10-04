import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { EchoTitle } from '@/components/type/echo-title'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { ProjectsCopy } from './copy'

// Cards with a screenshot of each live site in a small browser frame. The screenshot drifts up
// on hover, as if you'd started scrolling the page.
export function ProjectsSimple({
  copy,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<ProjectsCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <Reveal>
          <EchoTitle as={H} text={copy.heading} />
          <p className="text-muted-foreground mt-4 text-lg">{copy.lead}</p>
        </Reveal>

        <ul className="mt-12 grid gap-8 md:mt-16 md:grid-cols-2">
          {copy.items.map((project, i) => (
            <li key={project.id}>
              <Reveal delay={(i % 2) * 0.08} className="h-full">
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-background border-border hover:border-primary flex h-full flex-col overflow-hidden rounded-3xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
                >
                  <div className="bg-muted border-border flex items-center gap-1.5 border-b px-4 py-3">
                    <span aria-hidden="true" className="bg-border size-2.5 rounded-full" />
                    <span aria-hidden="true" className="bg-border size-2.5 rounded-full" />
                    <span aria-hidden="true" className="bg-border size-2.5 rounded-full" />
                    <span className="text-muted-foreground ml-3 truncate text-xs">
                      {project.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    </span>
                  </div>
                  <div className="bg-muted relative aspect-video overflow-hidden">
                    {project.shot ? (
                      <img
                        src={project.shot}
                        srcSet={project.shotSrcSet ?? undefined}
                        sizes="(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw"
                        alt=""
                        loading="lazy"
                        width={1200}
                        height={750}
                        className="absolute inset-x-0 top-0 h-auto w-full transition-transform duration-700 group-hover:-translate-y-6 group-hover:scale-105"
                      />
                    ) : (
                      <div className="from-primary/30 to-muted grid h-full place-items-center bg-linear-to-br">
                        {project.logo ? (
                          <img
                            src={project.logo}
                            alt=""
                            loading="lazy"
                            width={56}
                            height={56}
                            className="h-14 w-auto rounded-2xl bg-white p-3 shadow-lg transition-transform duration-500 group-hover:scale-110"
                          />
                        ) : (
                          <span className="font-display text-4xl font-black transition-transform duration-500 group-hover:scale-110">
                            {project.title}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-display text-xl font-black">{project.title}</h3>
                      <span
                        aria-hidden="true"
                        className="border-foreground grid size-10 shrink-0 place-items-center rounded-full border transition-all duration-300 group-hover:rotate-45 group-hover:bg-foreground group-hover:text-background"
                      >
                        ↗
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-3 text-sm text-pretty">
                      {project.description}
                    </p>
                  </div>
                </a>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}
