// The portfolio as a tiny shell: a read-only virtual filesystem built from the site's content,
// and the commands that walk it. Pure functions, no React, so the UI only renders what comes back.

export type Tone = 'dir' | 'exec' | 'link' | 'err' | 'muted' | 'accent'
export type Segment = { text: string; tone?: Tone; href?: string; download?: boolean }
export type Line = Segment[]

export type GameId = 'tetris'

export type Effect =
  | { kind: 'clear' }
  | { kind: 'open'; href: string; download?: boolean }
  | { kind: 'game'; game: GameId }
  /** Jump straight to the regular site, optionally at one section. */
  | { kind: 'website'; target?: string }
  /** Play the dev-server start-up, then open the regular site. */
  | { kind: 'boot'; tool: string }

type FileNode = { type: 'file'; body: Line[]; open?: Effect }
type ExecNode = { type: 'exec'; game: GameId }
type DirNode = { type: 'dir'; children: Record<string, Node>; open?: Effect; note?: Line[] }
type Node = FileNode | ExecNode | DirNode

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
export const START = `${HOME}/tenggis-port`
export const WEBSITE = `${START}/website`

/**
 * The top-level entries, in `ls` order, and what choosing one does. Used by the clickable menu
 * in the intro, and when someone types just the name ("projects") as a command.
 */
export const MENU: { name: string; tone: 'exec' | 'dir' | 'file'; command: string }[] = [
  { name: 'website', tone: 'dir', command: 'cd ~/tenggis-port/website && pnpm dev' },
  { name: 'about-me', tone: 'dir', command: 'cat ~/tenggis-port/about-me/about.md' },
  { name: 'projects', tone: 'dir', command: 'ls ~/tenggis-port/projects' },
  { name: 'experience', tone: 'dir', command: 'cat ~/tenggis-port/experience/career.log' },
  { name: 'contact', tone: 'dir', command: 'ls ~/tenggis-port/contact' },
  { name: 'games', tone: 'dir', command: 'ls ~/tenggis-port/games' },
  { name: 'cv.pdf', tone: 'file', command: 'open ~/tenggis-port/cv.pdf' },
]

const text = (s: string, tone?: Tone): Line => [{ text: s, tone }]
const lines = (s: string, tone?: Tone): Line[] => s.split('\n').map((l) => text(l, tone))
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const PACKAGE_JSON = `{
  "name": "tenggis-portfolio",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build"
  },
  "dependencies": {
    "@tanstack/react-start": "^1.168.0",
    "react": "^19.3.0",
    "three": "^0.186.0"
  },
  "devDependencies": {
    "tailwindcss": "^4.3.0",
    "typescript": "6.0.3",
    "vite": "^8.3.0"
  }
}`

const MAIN_TSX = `import { createRoot } from 'react-dom/client'
import { Portfolio } from './portfolio'

// The site you get after \`pnpm dev\`.
createRoot(document.getElementById('root')!).render(<Portfolio />)`

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

  const portfolio: DirNode = {
    type: 'dir',
    children: {
      'README.md': {
        type: 'file',
        body: [
          text("# tenggis-port: Tenggis Munkhbaatar's portfolio", 'accent'),
          [],
          text('Start the website:  cd website && pnpm dev'),
          text('Look around:        ls, cd <dir>, cat <file>'),
          text('Play:               tetris'),
          text('Everything else:    help'),
        ],
      },
      website: {
        type: 'dir',
        open: { kind: 'boot', tool: 'pnpm' },
        children: {
          'package.json': { type: 'file', body: lines(PACKAGE_JSON) },
          'README.md': {
            type: 'file',
            body: [
              text('# tenggis-portfolio', 'accent'),
              [],
              text('pnpm dev     start the website'),
              text('pnpm build   build it for production'),
            ],
          },
          src: {
            type: 'dir',
            children: { 'main.tsx': { type: 'file', body: lines(MAIN_TSX) } },
          },
          node_modules: {
            type: 'dir',
            children: {},
            note: [text('node_modules is 412 MB. Listing it would take a while.', 'muted')],
          },
        },
      },
      'about-me': {
        type: 'dir',
        open: { kind: 'website', target: 'about' },
        children: {
          'about.md': {
            type: 'file',
            body: data.aboutParagraphs.flatMap((p, i) => (i ? [[], text(p)] : [text(p)])),
            open: { kind: 'website', target: 'about' },
          },
          'skills.json': {
            type: 'file',
            body: lines(JSON.stringify({ skills: data.skills }, null, 2)),
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
        children: { tetris: { type: 'exec', game: 'tetris' } },
      },
    },
  }

  return {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: { tenggis: { type: 'dir', children: { 'tenggis-port': portfolio } } },
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
        : n?.type === 'exec'
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
  'pnpm',
  'npm',
  'yarn',
  'tetris',
] as const

const HELP: [string, string][] = [
  ['cd website && pnpm dev', 'start the website (npm run dev works too)'],
  ['ls [dir]', 'list what is in a folder'],
  ['cd <dir>', 'move into a folder (`cd ..` goes up)'],
  ['cat <file>', 'print a file'],
  ['open <name>', 'jump to that section, or open the link'],
  ['tetris', 'play Tetris'],
  ['pwd', 'show where you are'],
  ['whoami', 'who runs this machine'],
  ['history', 'commands you have typed'],
  ['clear', 'clear the screen'],
]

const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'] as const
type PackageManager = (typeof PACKAGE_MANAGERS)[number]

export type RunResult = { lines: Line[]; effects: Effect[]; cwd: string }

// `pnpm dev`, `npm run dev`, `npm start`, `yarn dev`, `bun dev`, `pnpm install` and friends.
function packageManager(tool: PackageManager, args: string[], cwd: string): RunResult {
  const out = (l: Line[], effects: Effect[] = []): RunResult => ({ lines: l, effects, cwd })
  const inProject = cwd === WEBSITE || cwd.startsWith(`${WEBSITE}/`)
  const script = args.filter((a) => a !== 'run')[0] ?? ''

  if (!inProject) {
    const here = displayPath(cwd)
    const message =
      tool === 'npm'
        ? [
            text('npm error code ENOENT', 'err'),
            text(`npm error path ${here}/package.json`, 'err'),
            text('npm error enoent Could not read package.json', 'err'),
          ]
        : tool === 'pnpm'
          ? [
              text(
                `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND  No package.json was found in "${here}".`,
                'err',
              ),
            ]
          : [text(`error Couldn't find a package.json file in "${here}"`, 'err')]
    return out([
      ...message,
      [],
      text('The website lives in ./website. Try: cd website && pnpm dev', 'muted'),
    ])
  }

  if (script === 'dev' || script === 'start') return out([], [{ kind: 'boot', tool }])
  if (script === '' && tool === 'npm') return out([text('Usage: npm run dev', 'muted')])
  if (script === '' || script === 'install' || script === 'i' || script === 'add') {
    return out([
      text('Lockfile is up to date, resolution step is skipped', 'muted'),
      text('Already up to date', 'muted'),
      [],
      text('Done in 412ms'),
    ])
  }
  if (script === 'build') {
    return out([
      text('vite v8.3.2 building for production...', 'muted'),
      text('✓ 2,782 modules transformed.'),
      text('✓ built in 2.41s', 'accent'),
      text('Prerendered 4 pages.', 'muted'),
    ])
  }
  return out([
    text(
      `${tool}: unknown script "${script}". Try \`${tool} ${tool === 'npm' ? 'run ' : ''}dev\`.`,
      'err',
    ),
  ])
}

function runOne(root: DirNode, cwd: string, input: string, history: string[]): RunResult {
  // `ls` marks programs with a trailing *, and people type it back. Accept it.
  const words = input
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/\*$/, ''))
  let [cmd = '', ...args] = words
  // `play tetris`, `run tetris`, `start tetris` all mean "run that thing".
  if ((cmd === 'play' || cmd === 'run' || cmd === 'start') && args[0]) {
    cmd = args[0]
    args = args.slice(1)
  }
  const arg = args.join(' ')
  const out = (l: Line[], effects: Effect[] = [], next = cwd): RunResult => ({
    lines: l,
    effects,
    cwd: next,
  })
  const err = (s: string) => out([text(s, 'err')])
  const tetris = () => out([text('starting tetris…', 'muted')], [{ kind: 'game', game: 'tetris' }])

  if (cmd === '') return out([])

  if ((PACKAGE_MANAGERS as readonly string[]).includes(cmd)) {
    return packageManager(cmd as PackageManager, args, cwd)
  }

  // Running a program by path: ./tetris, ./games/tetris, games/tetris.
  if (cmd.includes('/') && lookup(root, resolvePath(cwd, cmd))?.type === 'exec') return tetris()
  if (cmd === 'tetris') return tetris()
  if (cmd === 'website' || cmd === 'exit') {
    return runAll(root, cwd, 'cd ~/tenggis-port/website && pnpm dev', history)
  }
  // Typing just a name from the menu ("projects", "about-me/") does what clicking it does.
  const menuHit = MENU.find((m) => m.name === cmd.replace(/\/$/, ''))
  if (menuHit && args.length === 0) return runAll(root, cwd, menuHit.command, history)

  switch (cmd) {
    case 'help':
      return out([
        text('Commands:', 'accent'),
        ...HELP.map(([c, d]): Line => [{ text: c.padEnd(24) }, { text: d, tone: 'muted' }]),
        [],
        text('Tab completes names, ↑ and ↓ walk your history, && chains commands.', 'muted'),
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
      if (node.note) return out(node.note)
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
      if (node.type === 'exec') return err(`cat: ${arg}: It's a program. Run it with \`tetris\`.`)
      return out(node.body)
    }
    case 'open': {
      if (!arg) return err('open: open what? Try `open projects` or `open cv.pdf`.')
      // Section names work from anywhere: fall back to the portfolio's top folder.
      const node = lookup(root, resolvePath(cwd, arg)) ?? lookup(root, resolvePath(START, arg))
      if (!node) return err(`open: ${arg}: No such file or directory`)
      if (node.type === 'exec') return tetris()
      if (!node.open) return err(`open: ${arg}: nothing to open. Try \`cat ${arg}\`.`)
      return out([text(`opening ${arg}…`, 'muted')], [node.open])
    }
    case 'sudo':
      return err('sudo: you are not in the sudoers file. This incident will be reported.')
    case 'rm':
      return err('rm: read-only file system. Nice try.')
    case 'vim':
    case 'nano':
    case 'emacs':
      return err(`${cmd}: read-only file system. Use \`cat\` to read files.`)
    default:
      return err(`${cmd}: command not found. Type \`help\` for the list.`)
  }
}

/** Runs a command line. `a && b` runs b only when a printed no error, like a real shell. */
export function run(root: DirNode, cwd: string, input: string, history: string[]): RunResult {
  return runAll(root, cwd, input, history)
}

function runAll(root: DirNode, cwd: string, input: string, history: string[]): RunResult {
  let result: RunResult = { lines: [], effects: [], cwd }
  for (const part of input.split('&&')) {
    const step = runOne(root, result.cwd, part, history)
    result = {
      lines: [...result.lines, ...step.lines],
      effects: [...result.effects, ...step.effects],
      cwd: step.cwd,
    }
    if (step.lines.some((l) => l.some((s) => s.tone === 'err'))) break
  }
  return result
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
