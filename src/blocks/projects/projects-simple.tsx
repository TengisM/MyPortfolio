import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { ProjectsCopy } from './copy'

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
          <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
          <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>
        </Reveal>

        <ul className="mt-12 grid gap-6 md:grid-cols-2">
          {copy.items.map((project, i) => (
            <li key={project.id}>
              <Reveal delay={(i % 2) * 0.08} className="h-full">
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border bg-background hover:border-primary rounded-base group flex h-full flex-col border p-6 transition-colors"
                >
                  <div className="flex h-10 items-center justify-between gap-4">
                    {project.logo ? (
                      <img
                        src={project.logo}
                        alt=""
                        loading="lazy"
                        className="h-8 w-auto rounded-sm bg-white p-1"
                      />
                    ) : (
                      <span className="font-display text-lg font-bold">{project.title}</span>
                    )}
                    <span className="text-muted-foreground group-hover:text-primary text-sm transition-colors">
                      {copy.visitLabel} ↗
                    </span>
                  </div>
                  <h3 className="text-h3 mt-5 font-semibold">{project.title}</h3>
                  <p className="text-muted-foreground mt-2 text-pretty">{project.description}</p>
                </a>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}
