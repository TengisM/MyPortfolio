export type MarqueeCopy = {
  /** Read by screen readers only. The strips are decorative repeats of the same list. */
  heading: string
  rows: [string[], string[]]
}

// Tool names are not translated.
const rows: MarqueeCopy['rows'] = [
  ['React', 'Next.js', 'TypeScript', 'TanStack', 'Tailwind', 'Vue'],
  ['Go', 'Elixir', 'Phoenix', 'Node.js', 'PostgreSQL', 'Web3'],
]

export const mn: MarqueeCopy = {
  heading: 'Ашигладаг технологиуд',
  rows,
}

export const en: MarqueeCopy = {
  heading: 'Tools I work with',
  rows,
}
