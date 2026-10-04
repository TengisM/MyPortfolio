import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { EchoTitle } from '@/components/type/echo-title'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { AboutCopy } from './copy'

// One token of highlighted code: [kind, text]. The colours are in src/styles/portfolio.css.
type Kind = 'kw' | 'prop' | 'str' | 'com' | 'pun' | ''
type Token = [Kind, string]

// Literal class names per kind, so the conventions check can read every one.
function Tok({ kind, text }: { kind: Kind; text: string }) {
  switch (kind) {
    case 'kw':
      return <span className="tok-kw">{text}</span>
    case 'prop':
      return <span className="tok-prop">{text}</span>
    case 'str':
      return <span className="tok-str">{text}</span>
    case 'com':
      return <span className="tok-com">{text}</span>
    case 'pun':
      return <span className="tok-pun">{text}</span>
    default:
      return <>{text}</>
  }
}

const str = (s: string): Token => ['str', `'${s}'`]
const list = (items: string[]): Token[] => [
  ['pun', '['],
  ...items.flatMap((s, i): Token[] => (i === 0 ? [str(s)] : [['pun', ', '], str(s)])),
  ['pun', ']'],
]
const field = (indent: number, key: string, value: Token[]): Token[] => [
  ['', ' '.repeat(indent)],
  ['prop', key],
  ['pun', ': '],
  ...value,
  ['pun', ','],
]

function linesFor(p: AboutCopy['profile']): Token[][] {
  return [
    [['com', `// ${p.comment}`]],
    [
      ['kw', 'const'],
      ['', ' tenggis '],
      ['pun', '= {'],
    ],
    field(2, 'role', [str(p.role)]),
    field(2, 'location', [str(p.location)]),
    field(2, 'experience', [str(p.experience)]),
    field(2, 'education', [str(p.education)]),
    field(2, 'languages', list(p.languages)),
    [
      ['', '  '],
      ['prop', 'stack'],
      ['pun', ': {'],
    ],
    field(4, 'frontend', list(p.frontend)),
    field(4, 'backend', list(p.backend)),
    [['pun', '  },']],
    field(2, 'currently', [str(p.currently)]),
    [['pun', '}']],
    [],
    [
      ['kw', 'export default'],
      ['', ' tenggis'],
    ],
  ]
}

export function AboutSimple({
  copy,
  resolve,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<AboutCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  const lines = linesFor(copy.profile)
  return (
    <Section id={anchorId} surface={surface}>
      <Container>
        <Reveal>
          <EchoTitle as={H} text={copy.heading} />
        </Reveal>

        <div className="mt-10 grid gap-10 md:mt-14 md:grid-cols-12">
          <Reveal className="min-w-0 md:col-span-7">
            {/* An editor window with the profile as code. */}
            <figure className="border-border bg-muted/80 overflow-hidden rounded-2xl border backdrop-blur">
              <figcaption className="border-border flex items-center border-b font-mono text-xs">
                <span className="border-primary text-foreground border-b-2 px-4 py-3">
                  tenggis.ts
                </span>
                {/* The second tab jumps to the projects section. */}
                <a
                  href={resolve('projects')}
                  className="text-muted-foreground hover:text-foreground px-4 py-3 transition-colors"
                >
                  projects.ts
                </a>
              </figcaption>
              <pre className="overflow-x-auto p-5 font-mono text-sm leading-7">
                <code>
                  {lines.map((line, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed lines that never reorder.
                    <span key={i} className="flex">
                      <span
                        aria-hidden="true"
                        className="text-muted-foreground/60 w-8 shrink-0 pr-4 text-right select-none"
                      >
                        {i + 1}
                      </span>
                      <span>
                        {line.map(([kind, text], j) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: tokens never reorder.
                          <Tok key={j} kind={kind} text={text} />
                        ))}
                      </span>
                    </span>
                  ))}
                </code>
              </pre>
            </figure>
          </Reveal>
          <Reveal className="md:col-span-5" delay={0.1}>
            {copy.paragraphs.map((p) => (
              <p key={p} className="text-muted-foreground mt-5 text-lg text-pretty first:mt-0">
                {p}
              </p>
            ))}
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
