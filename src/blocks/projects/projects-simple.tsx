import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import type { ProjectsCopy } from './copy'

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')

// One row per project: the live site as it looks today, then what it is and what I did there.
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
        <div className="border-border grid gap-6 border-t pt-8 md:grid-cols-12">
          <H className="text-2xl font-semibold md:col-span-3">{copy.heading}</H>
          <ul className="md:col-span-9">
            {copy.items.map((project) => (
              <li
                key={project.id}
                className="border-border grid gap-6 border-b py-8 first:pt-0 last:border-b-0 sm:grid-cols-9"
              >
                <div className="border-border bg-muted rounded-base aspect-video overflow-hidden border sm:col-span-4">
                  {project.shot ? (
                    <img
                      src={project.shot}
                      alt=""
                      loading="lazy"
                      width={1200}
                      height={750}
                      className="h-full w-full object-cover object-top"
                    />
                  ) : (
                    <span className="grid h-full place-items-center">
                      {project.logo ? (
                        <img src={project.logo} alt="" loading="lazy" className="h-10 w-auto" />
                      ) : (
                        <span className="font-stretch-condensed text-3xl font-semibold">
                          {project.title}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="sm:col-span-5">
                  <h3 className="text-xl font-semibold">
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary underline-offset-4 hover:underline"
                    >
                      {project.title}
                    </a>
                  </h3>
                  <p className="text-muted-foreground tabular mt-1 text-sm">{host(project.url)}</p>
                  <p className="text-muted-foreground mt-3 leading-relaxed text-pretty">
                    {project.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  )
}
