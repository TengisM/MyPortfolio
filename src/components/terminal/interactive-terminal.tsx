import {
  type FormEvent,
  type KeyboardEvent,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Effect, GameId, Line, Segment, ShellData } from './shell'
import { buildFs, complete, displayPath, run, START } from './shell'

// Three.js and the game only download when someone actually starts it.
const GameWindow = lazy(() => import('@/components/games/game-window'))

type Entry = { id: number; cwd: string; input: string; lines: Line[] }

function Seg({ seg }: { seg: Segment }) {
  if (seg.href) {
    return (
      <a
        href={seg.href}
        download={seg.download || undefined}
        target={seg.href.startsWith('http') ? '_blank' : undefined}
        rel="noopener noreferrer"
        className="text-primary underline-offset-4 hover:underline"
      >
        {seg.text}
      </a>
    )
  }
  switch (seg.tone) {
    case 'dir':
      return <span className="text-primary font-semibold">{seg.text}</span>
    case 'exec':
      return <span className="tok-str font-semibold">{seg.text}</span>
    case 'err':
      return <span className="text-destructive">{seg.text}</span>
    case 'muted':
      return <span className="text-muted-foreground">{seg.text}</span>
    case 'accent':
      return <span className="text-foreground font-semibold">{seg.text}</span>
    default:
      return <>{seg.text}</>
  }
}

function Prompt({ cwd, user }: { cwd: string; user: string }) {
  return (
    <span className="select-none">
      <span className="tok-str">{user}</span>
      <span className="text-muted-foreground">:</span>
      <span className="text-primary">{displayPath(cwd)}</span>
      <span className="text-muted-foreground">$ </span>
    </span>
  )
}

function followLink(href: string, download?: boolean) {
  const a = document.createElement('a')
  a.href = href
  if (download) a.download = ''
  else if (href.startsWith('http')) {
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
  }
  a.click()
}

// The dev-server start-up played by `pnpm dev`: [delay ms, line]. A null line is where the
// progress bar animates.
const BOOT: [number, Line | null][] = [
  [0, [{ text: '> tenggis-portfolio@1.0.0 dev', tone: 'muted' }]],
  [60, [{ text: '> vite dev', tone: 'muted' }]],
  [120, []],
  [200, null],
  [1350, []],
  [
    1400,
    [
      { text: '  VITE ', tone: 'accent' },
      { text: 'v8.3.2', tone: 'muted' },
      { text: '  ready in ' },
      { text: '612 ms', tone: 'accent' },
    ],
  ],
  [1460, []],
  [1520, [{ text: '  ➜  Local:   ' }, { text: 'https://tenggis.vercel.app/', tone: 'dir' }]],
  [1580, [{ text: '  ➜  opening the website…', tone: 'muted' }]],
]
const BOOT_DONE_MS = 2100
const BAR_STEPS = 12

const bar = (step: number): Line => {
  const width = 24
  const filled = Math.round((step / BAR_STEPS) * width)
  return [
    { text: '  building ', tone: 'muted' },
    { text: '█'.repeat(filled), tone: 'dir' },
    { text: '░'.repeat(width - filled), tone: 'muted' },
    { text: ` ${String(Math.round((step / BAR_STEPS) * 100)).padStart(3)}%` },
  ]
}

function Clock() {
  const [now, setNow] = useState<string | null>(null)
  useEffect(() => {
    const format = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
    const tick = () => setNow(format.format(new Date()))
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])
  return <span className="tabular">{now ?? '--:--'}</span>
}

/**
 * The full-screen terminal: the scripted `intro` (server-rendered, types itself out with CSS),
 * then a working prompt, and a tmux-style status bar. A game opens as a second tmux window.
 */
export function InteractiveTerminal({
  intro,
  data,
  user,
  inputLabel,
  hint,
  openSiteLabel,
  onWebsite,
}: {
  intro: ReactNode
  data: ShellData
  user: string
  inputLabel: string
  hint: string
  openSiteLabel: string
  /** Called when the visitor asks for the regular site, with a section id when they named one. */
  onWebsite: (target?: string) => void
}) {
  const root = useMemo(() => buildFs(data), [data])
  const [cwd, setCwd] = useState(START)
  const [entries, setEntries] = useState<Entry[]>([])
  const [introHidden, setIntroHidden] = useState(false)
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [game, setGame] = useState<{ id: GameId; players: 1 | 2 } | null>(null)
  const [booting, setBooting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(0)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const scrollToEnd = () =>
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })

  const appendLines = (id: number, more: Line[]) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, lines: [...e.lines, ...more] } : e)),
    )
    scrollToEnd()
  }
  const replaceLast = (id: number, line: Line) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, lines: [...e.lines.slice(0, -1), line] } : e)),
    )
  }

  // `pnpm dev`: prints the start-up line by line, fills the progress bar, then opens the site.
  const boot = (id: number) => {
    setBooting(true)
    for (const [delay, line] of BOOT) {
      timers.current.push(
        window.setTimeout(() => {
          if (line) return appendLines(id, [line])
          appendLines(id, [bar(0)])
          for (let step = 1; step <= BAR_STEPS; step++) {
            timers.current.push(window.setTimeout(() => replaceLast(id, bar(step)), step * 85))
          }
        }, delay),
      )
    }
    timers.current.push(
      window.setTimeout(() => {
        setBooting(false)
        onWebsite()
      }, BOOT_DONE_MS),
    )
  }

  const applyEffect = (effect: Effect, entryId: number) => {
    switch (effect.kind) {
      case 'open':
        followLink(effect.href, effect.download)
        return
      case 'game':
        // A game takes the keyboard: drop focus so its arrow keys don't walk the history here.
        inputRef.current?.blur()
        setGame({ id: effect.game, players: effect.players ?? 1 })
        return
      case 'website':
        onWebsite(effect.target)
        return
      case 'boot':
        boot(entryId)
        return
      case 'clear':
        return
    }
  }

  // Runs one command line, as typed at the prompt or sent by a click in the intro's menu.
  const execute = (input: string) => {
    if (booting) return
    const nextHistory = input.trim() ? [...history, input] : history
    const result = run(root, cwd, input, nextHistory)
    setValue('')
    setHistory(nextHistory)
    setHistoryIndex(null)
    const id = nextId.current++
    if (result.effects.some((fx) => fx.kind === 'clear')) {
      setEntries([])
      setIntroHidden(true)
    } else {
      setEntries((prev) => [...prev, { id, cwd, input, lines: result.lines }])
    }
    setCwd(result.cwd)
    for (const fx of result.effects) applyEffect(fx, id)
    scrollToEnd()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    execute(value)
  }

  // The intro's clickable menu sends commands here (see runInTerminal in terminal-app.tsx).
  const executeRef = useRef(execute)
  executeRef.current = execute
  useEffect(() => {
    const onRun = (e: Event) => executeRef.current((e as CustomEvent<string>).detail)
    addEventListener('terminal:run', onRun)
    return () => removeEventListener('terminal:run', onRun)
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (game) return
    if (e.key === 'Tab') {
      e.preventDefault()
      const next = complete(root, cwd, value)
      if (next !== null) setValue(next)
    } else if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault()
      const i = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(i)
      setValue(history[i] ?? '')
    } else if (e.key === 'ArrowDown' && historyIndex !== null) {
      e.preventDefault()
      const i = historyIndex + 1
      if (i >= history.length) {
        setHistoryIndex(null)
        setValue('')
      } else {
        setHistoryIndex(i)
        setValue(history[i] ?? '')
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setEntries([])
      setIntroHidden(true)
    }
  }

  const closeGame = (summary: string) => {
    setGame(null)
    setEntries((prev) => [
      ...prev,
      { id: nextId.current++, cwd, input: '', lines: [[{ text: summary, tone: 'muted' }]] },
    ])
    scrollToEnd()
    inputRef.current?.focus({ preventScroll: true })
  }

  return (
    <>
      {/* Its own scroll area; data-lenis-prevent keeps the page's smooth scroll out of it.
          Clicking anywhere puts the cursor in the prompt, like a real terminal. Keyboard users
          reach the input directly, so the click needs no key twin. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse convenience only, see above. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the input itself is keyboard-reachable. */}
      <div
        ref={scrollRef}
        data-lenis-prevent=""
        onClick={() => inputRef.current?.focus({ preventScroll: true })}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 font-mono text-sm md:px-8 md:py-7 md:text-base"
      >
        <div className={introHidden ? 'hidden' : 'term grid gap-1.5'}>{intro}</div>

        <div className="term-live grid gap-1.5" aria-live="polite">
          {entries.map((entry) => (
            <div key={entry.id} className="grid gap-0.5">
              {entry.input || entry.lines.length === 0 ? (
                <p className="break-all">
                  <Prompt cwd={entry.cwd} user={user} />
                  {entry.input}
                </p>
              ) : null}
              {entry.lines.map((line, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: output lines never reorder.
                <p key={i} className="min-h-6 whitespace-pre-wrap break-words">
                  {line.map((seg, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: segments never reorder.
                    <Seg key={j} seg={seg} />
                  ))}
                </p>
              ))}
            </div>
          ))}

          {/* Hidden while `pnpm dev` runs, like a real foreground process. On narrow screens the
              input wraps under the prompt instead of being squeezed. */}
          <form onSubmit={submit} className={booting ? 'hidden' : 'flex flex-wrap items-center'}>
            <label htmlFor="terminal-input" className="sr-only">
              {inputLabel}
            </label>
            <Prompt cwd={cwd} user={user} />
            <input
              ref={inputRef}
              id="terminal-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={entries.length === 0 ? hint : ''}
              className="caret-primary placeholder:text-muted-foreground/60 min-w-48 flex-1 bg-transparent text-base outline-none"
            />
          </form>
        </div>
      </div>

      {/* tmux-style status bar: windows on the left, the way out in the middle, the clock. */}
      <div className="bg-primary text-primary-foreground flex h-8 shrink-0 items-center gap-4 px-3 font-mono text-xs whitespace-nowrap">
        <span className="font-bold">[tenggis-port]</span>
        <span className={game ? '' : 'font-bold'}>0:zsh{game ? '-' : '*'}</span>
        {game ? <span className="font-bold">1:{game.id}*</span> : null}
        <button
          type="button"
          onClick={() => executeRef.current('website')}
          className="ml-auto truncate underline-offset-2 hover:underline"
        >
          {openSiteLabel}
        </button>
        <Clock />
      </div>

      {game ? (
        <Suspense fallback={null}>
          <GameWindow game={game.id} players={game.players} onExit={closeGame} />
        </Suspense>
      ) : null}
    </>
  )
}
