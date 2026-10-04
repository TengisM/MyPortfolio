// The portfolio as a tiny shell: a read-only virtual filesystem built from the site's content,
// and the commands that walk it. Pure functions, no React, so the UI only renders what comes back.

export type Tone = 'dir' | 'exec' | 'link' | 'err' | 'muted' | 'accent'
export type Segment = { text: string; tone?: Tone; href?: string; download?: boolean }
export type Line = Segment[]

export type GameId = 'tetris' | 'snake'

export type Effect =
  | { kind: 'clear' }
  | { kind: 'open'; href: string; download?: boolean }
  | { kind: 'scroll'; target: string }
  | { kind: 'game'; game: GameId }
  /** Leave the terminal for the regular site, optionally at one section. */
  | { kind: 'website'; target?: string }

type FileNode = { type: 'file'; body: Line[]; open?: Effect }
type ExecNode = { type: 'exec'; game: GameId; about: string }
type SiteNode = { type: 'site' }
type DirNode = { type: 'dir'; children: Record<string, Node>; open?: Effect }
type Node = FileNode | ExecNode | SiteNode | DirNode

export type ShellData = {
  aboutParagraphs: string[]
  skills: string[]
  projects: { title: string; url: string; description: string }[]
  career: { period: string; position: string; organization: string }[]
  email?: string
  socials: { label: string; href: string }[]
  cvHref: string
}

export const HOME = '/home/tenggis'

/**
 * The top-level entries, in `ls` order, and what choosing one does. Used by the clickable menu
 * in the intro, and when someone types just the name ("projects") as a command.
 */
export const MENU: { name: string; tone: 'exec' | 'dir' | 'file'; command: string }[] = [
  { name: 'website', tone: 'exec', command: 'website' },
  { name: 'about-me', tone: 'dir', command: 'cat ~/tenggis-port/about-me/about.md' },
  { name: 'projects', tone: 'dir', command: 'ls ~/tenggis-port/projects' },
  { name: 'experience', tone: 'dir', command: 'cat ~/tenggis-port/experience/career.log' },
  { name: 'contact', tone: 'dir', command: 'ls ~/tenggis-port/contact' },
  { name: 'games', tone: 'dir', command: 'ls ~/tenggis-port/games' },
  { name: 'cv.pdf', tone: 'file', command: 'open ~/tenggis-port/cv.pdf' },
]
export const START = `${HOME}/tenggis-port`

const text = (s: string, tone?: Tone): Line => [{ text: s, tone }]
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function buildFs(data: ShellData): DirNode {
  const projects: Record<string, Node> = {}
  for (const p of data.projects) {
    projects[`${slug(p.title)}.md`] = {
      type: 'file',
      body: [
        text(`# ${p.title}`, 'accent'),
        [{ text: p.url, tone: 'link', href: p.url }],
        [],
        text(p.description),
      ],
      open: { kind: 'open', href: p.url },
    }
  }

  const contact: Record<string, Node> = {}
  if (data.email) {
    const href = `mailto:${data.email}`
    contact['email.txt'] = {
      type: 'file',
      body: [[{ text: data.email, tone: 'link', href }]],
      open: { kind: 'open', href },
    }
  }
  for (const s of data.socials) {
    contact[`${slug(s.label)}.url`] = {
      type: 'file',
      body: [[{ text: s.href, tone: 'link', href: s.href }]],
      open: { kind: 'open', href: s.href },
    }
  }

  const longestPeriod = Math.max(...data.career.map((c) => c.period.length))

  return {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: {
          tenggis: {
            type: 'dir',
            children: {
              'tenggis-port': {
                type: 'dir',
                children: {
                  website: { type: 'site' },
                  'README.md': {
                    type: 'file',
                    body: [
                      text("# tenggis-port: Tenggis Munkhbaatar's portfolio", 'accent'),
                      [],
                      text('Run `website` for the regular site.'),
                      text('Or look around with `ls`, `cd <dir>` and `cat <file>`.'),
                      text('`open <name>` jumps to a section or opens a link.'),
                      text('There are games in ./games. Try `./games/tetris`.'),
                      text('`help` lists everything.'),
                    ],
                  },
                  'about-me': {
                    type: 'dir',
                    open: { kind: 'website', target: 'about' },
                    children: {
                      'about.md': {
                        type: 'file',
                        body: data.aboutParagraphs.flatMap((p, i) =>
                          i ? [[], text(p)] : [text(p)],
                        ),
                        open: { kind: 'website', target: 'about' },
                      },
                      'stack.json': {
                        type: 'file',
                        body: JSON.stringify({ skills: data.skills }, null, 2)
                          .split('\n')
                          .map((l) => text(l)),
                      },
                    },
                  },
                  projects: {
                    type: 'dir',
                    open: { kind: 'website', target: 'projects' },
                    children: projects,
                  },
                  experience: {
                    type: 'dir',
                    open: { kind: 'website', target: 'experience' },
                    children: {
                      'career.log': {
                        type: 'file',
                        body: data.career.map((c) => [
                          { text: `${c.period.padEnd(longestPeriod)}  `, tone: 'muted' },
                          { text: c.position },
                          { text: ` @ ${c.organization}`, tone: 'accent' },
                        ]),
                        open: { kind: 'website', target: 'experience' },
                      },
                    },
                  },
                  contact: {
                    type: 'dir',
                    open: { kind: 'website', target: 'contact' },
                    children: contact,
                  },
                  'cv.pdf': {
                    type: 'file',
                    body: [
                      text('cv.pdf is a binary file.', 'muted'),
                      text('Run `open cv.pdf` to download it.', 'muted'),
                    ],
                    open: { kind: 'open', href: data.cvHref, download: true },
                  },
                  games: {
                    type: 'dir',
                    children: {
                      tetris: { type: 'exec', game: 'tetris', about: 'blocks, falling, in 3D' },
                      snake: { type: 'exec', game: 'snake', about: 'eat, grow, avoid yourself' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

// ---- paths -----------------------------------------------------------------------------------

export function resolvePath(cwd: string, input: string): string {
  let path = input.trim()
  if (path === '' || path === '~') return HOME
  if (path.startsWith('~/')) path = `${HOME}/${path.slice(2)}`
  const parts = (path.startsWith('/') ? path : `${cwd}/${path}`).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return `/${out.join('/')}`
}

function lookup(root: DirNode, path: string): Node | null {
  let node: Node = root
  for (const part of path.split('/').filter(Boolean)) {
    if (node.type !== 'dir') return null
    const next: Node | undefined = node.children[part]
    if (!next) return null
    node = next
  }
  return node
}

export function displayPath(path: string): string {
  return path === HOME
    ? '~'
    : path.startsWith(`${HOME}/`)
      ? `~/${path.slice(HOME.length + 1)}`
      : path
}

function listing(dir: DirNode): Line {
  const names = Object.keys(dir.children).sort((a, b) => {
    const da = dir.children[a]?.type === 'dir' ? 0 : 1
    const db = dir.children[b]?.type === 'dir' ? 0 : 1
    return da - db || a.localeCompare(b)
  })
  return names.flatMap((name, i): Segment[] => {
    const n = dir.children[name]
    const seg: Segment =
      n?.type === 'dir'
        ? { text: `${name}/`, tone: 'dir' }
        : n?.type === 'exec' || n?.type === 'site'
          ? { text: `${name}*`, tone: 'exec' }
          : { text: name }
    return i === 0 ? [seg] : [{ text: '   ' }, seg]
  })
}

// ---- commands --------------------------------------------------------------------------------

export const COMMANDS = [
  'help',
  'ls',
  'cd',
  'pwd',
  'cat',
  'open',
  'clear',
  'whoami',
  'history',
  'echo',
  'date',
  'website',
  'play',
  'tetris',
  'snake',
] as const

const HELP: [string, string][] = [
  ['website', 'open the regular website'],
  ['ls [dir]', 'list what is in a folder'],
  ['cd <dir>', 'move into a folder (`cd ..` goes up)'],
  ['cat <file>', 'print a file'],
  ['open <name>', 'jump to that section, or open the link'],
  ['tetris, snake', 'start a game (also ./games/tetris, play snake)'],
  ['pwd', 'show where you are'],
  ['whoami', 'who runs this machine'],
  ['history', 'commands you have typed'],
  ['clear', 'clear the screen'],
]

export type RunResult = { lines: Line[]; effects: Effect[]; cwd: string }

export function run(root: DirNode, cwd: string, input: string, history: string[]): RunResult {
  // `ls` marks programs with a trailing *, and people type it back. Accept it.
  const words = input
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/\*$/, ''))
  let [cmd = '', ...args] = words
  // `play tetris`, `run snake`, `start website` all mean "run that thing".
  if ((cmd === 'play' || cmd === 'run' || cmd === 'start') && args[0]) {
    cmd = args[0]
    args = args.slice(1)
  }
  const arg = args.join(' ')
  const out = (lines: Line[], effects: Effect[] = [], next = cwd): RunResult => ({
    lines,
    effects,
    cwd: next,
  })
  const err = (s: string) => out([text(s, 'err')])

  if (cmd === '') return out([])

  // Running a program by path: ./tetris, ./games/tetris, games/snake, ./website.
  const execTarget = cmd.includes('/') ? resolvePath(cwd, cmd) : null
  const execNode = execTarget ? lookup(root, execTarget) : null
  if (execNode?.type === 'exec') {
    return out(
      [text(`starting ${execTarget?.split('/').pop()}…`, 'muted')],
      [{ kind: 'game', game: execNode.game }],
    )
  }
  if (execNode?.type === 'site' || cmd === 'website' || cmd === 'site' || cmd === 'exit') {
    return out([text('opening the website…', 'muted')], [{ kind: 'website' }])
  }
  if (cmd === 'tetris' || cmd === 'snake') {
    return out([text(`starting ${cmd}…`, 'muted')], [{ kind: 'game', game: cmd }])
  }
  // Typing just a name from the menu ("projects", "about-me/") does what clicking it does.
  const menuHit = MENU.find((m) => m.name === cmd.replace(/\/$/, ''))
  if (menuHit && args.length === 0) return run(root, cwd, menuHit.command, history)

  switch (cmd) {
    case 'help':
      return out([
        text('Commands:', 'accent'),
        ...HELP.map(([c, d]): Line => [{ text: c.padEnd(16) }, { text: d, tone: 'muted' }]),
        [],
        text('Tab completes names, ↑ and ↓ walk your history.', 'muted'),
      ])
    case 'pwd':
      return out([text(cwd)])
    case 'whoami':
      return out([
        text('tenggis'),
        text('Frontend / Fullstack Engineer, Ulaanbaatar → Berlin', 'muted'),
      ])
    case 'date':
      return out([text(new Date().toString())])
    case 'echo':
      return out([text(arg)])
    case 'history':
      return out(
        history.map(
          (h, i): Line => [{ text: `${String(i + 1).padStart(3)}  `, tone: 'muted' }, { text: h }],
        ),
      )
    case 'clear':
      return out([], [{ kind: 'clear' }])
    case 'ls': {
      const path = arg ? resolvePath(cwd, arg) : cwd
      const node = lookup(root, path)
      if (!node) return err(`ls: ${arg}: No such file or directory`)
      if (node.type !== 'dir') return out([text(arg)])
      return out([listing(node)])
    }
    case 'cd': {
      const path = resolvePath(cwd, arg || '~')
      const node = lookup(root, path)
      if (!node) return err(`cd: ${arg}: No such file or directory`)
      if (node.type !== 'dir') return err(`cd: ${arg}: Not a directory`)
      return out([], [], path)
    }
    case 'cat': {
      if (!arg) return err('cat: which file? Try `ls` to see what is here.')
      const node = lookup(root, resolvePath(cwd, arg))
      if (!node) return err(`cat: ${arg}: No such file or directory`)
      if (node.type === 'dir') return err(`cat: ${arg}: Is a directory. Try \`ls ${arg}\`.`)
      if (node.type === 'exec' || node.type === 'site')
        return err(`cat: ${arg}: It's a program. Run it with ./${arg.split('/').pop()}`)
      return out(node.body)
    }
    case 'open': {
      if (!arg) return err('open: open what? Try `open projects` or `open cv.pdf`.')
      // Section names work from anywhere: fall back to the portfolio's top folder.
      const node = lookup(root, resolvePath(cwd, arg)) ?? lookup(root, resolvePath(START, arg))
      if (!node) return err(`open: ${arg}: No such file or directory`)
      if (node.type === 'exec')
        return out([text(`starting ${arg}…`, 'muted')], [{ kind: 'game', game: node.game }])
      if (node.type === 'site')
        return out([text('opening the website…', 'muted')], [{ kind: 'website' }])
      if (!node.open) return err(`open: ${arg}: nothing to open. Try \`cat ${arg}\`.`)
      return out([text(`opening ${arg}…`, 'muted')], [node.open])
    }
    case 'sudo':
      return err('sudo: you are not in the sudoers file. This incident will be reported.')
    case 'rm':
      return err('rm: read-only file system. Nice try.')
    default:
      return err(`${cmd}: command not found. Type \`help\` for the list.`)
  }
}

// ---- tab completion ----------------------------------------------------------------------------

/** Completes the last word of the input. Returns the new input, or null when nothing fits. */
export function complete(root: DirNode, cwd: string, input: string): string | null {
  const words = input.split(' ')
  const last = words[words.length - 1] ?? ''
  if (words.length === 1 && !last.includes('/')) {
    const hits = COMMANDS.filter((c) => c.startsWith(last))
    return hits.length === 1 ? `${hits[0]} ` : null
  }
  const slash = last.lastIndexOf('/')
  const dirPart = slash >= 0 ? last.slice(0, slash + 1) : ''
  const namePart = slash >= 0 ? last.slice(slash + 1) : last
  const dir = lookup(root, resolvePath(cwd, dirPart || '.'))
  if (dir?.type !== 'dir') return null
  const hits = Object.keys(dir.children).filter((n) => n.startsWith(namePart))
  if (hits.length !== 1) return null
  const hit = hits[0] as string
  const suffix = dir.children[hit]?.type === 'dir' ? '/' : ''
  words[words.length - 1] = `${dirPart}${hit}${suffix}`
  return words.join(' ')
}
