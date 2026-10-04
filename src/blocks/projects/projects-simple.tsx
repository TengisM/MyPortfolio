import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { EchoTitle } from '@/components/type/echo-title'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { ProjectsCopy } from './copy'

// Numbered rows on the light "paper" surface, like Junni's service list. Hovering a row slides
// the title over and swings the project's logo in.
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
          <EchoTitle as="p" text={copy.title} />
          <H className="text-h3 mt-6 font-bold">{copy.heading}</H>
          <p className="text-muted-foreground mt-2">{copy.lead}</p>
        </Reveal>

        <ul className="border-border mt-12 border-t">
          {copy.items.map((project, i) => (
            <li key={project.id} className="border-border border-b">
              <Reveal>
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative grid items-center gap-4 py-8 md:grid-cols-12 md:gap-8"
                >
                  <span className="font-display text-outline-muted text-5xl font-black md:col-span-2 md:text-7xl">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="transition-transform duration-500 group-hover:translate-x-4 md:col-span-7">
                    <h3 className="font-display text-4xl font-black tracking-tight md:text-6xl">
                      {project.title}
                    </h3>
                    <p className="text-muted-foreground mt-3 text-pretty">{project.description}</p>
                  </div>
                  <div className="flex items-center justify-between gap-4 md:col-span-3 md:justify-end">
                    {project.logo ? (
                      <img
                        src={project.logo}
                        alt=""
                        loading="lazy"
                        className="border-border h-12 w-auto rounded-xl border bg-white p-2 transition-transform duration-500 md:scale-0 md:rotate-12 md:group-hover:scale-100 md:group-hover:rotate-3"
                      />
                    ) : null}
                    <span
                      aria-hidden="true"
                      className="border-foreground grid size-14 shrink-0 place-items-center rounded-full border text-xl transition-all duration-300 group-hover:rotate-45 group-hover:bg-foreground group-hover:text-background"
                    >
                      ↗
                    </span>
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
