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

// Three.js and the games only download when someone actually starts one.
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

function applyEffect(
  effect: Effect,
  startGame: (g: GameId) => void,
  openWebsite: (target?: string) => void,
) {
  switch (effect.kind) {
    case 'open': {
      const a = document.createElement('a')
      a.href = effect.href
      if (effect.download) a.download = ''
      else if (effect.href.startsWith('http')) {
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
      }
      a.click()
      return
    }
    case 'scroll':
      document.getElementById(effect.target)?.scrollIntoView({ behavior: 'smooth' })
      return
    case 'game':
      startGame(effect.game)
      return
    case 'website':
      openWebsite(effect.target)
      return
    case 'clear':
      return
  }
}

/**
 * The live half of the hero terminal. `intro` is the scripted session that types itself out
 * (server-rendered, so it is in the HTML); after it, this adds a working prompt.
 */
export function InteractiveTerminal({
  intro,
  data,
  user,
  inputLabel,
  hint,
  onWebsite,
}: {
  intro: ReactNode
  data: ShellData
  user: string
  inputLabel: string
  hint: string
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
  const [game, setGame] = useState<GameId | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(0)

  const scrollToEnd = () =>
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })

  // Runs one command line, as typed at the prompt or sent by a click in the intro's menu.
  const execute = (input: string) => {
    const nextHistory = input.trim() ? [...history, input] : history
    const result = run(root, cwd, input, nextHistory)
    setValue('')
    setHistory(nextHistory)
    setHistoryIndex(null)
    if (result.effects.some((fx) => fx.kind === 'clear')) {
      setEntries([])
      setIntroHidden(true)
    } else {
      setEntries((prev) => [...prev, { id: nextId.current++, cwd, input, lines: result.lines }])
    }
    setCwd(result.cwd)
    // A game takes the keyboard: drop focus so its arrow keys don't also walk the history here.
    if (result.effects.some((fx) => fx.kind === 'game')) inputRef.current?.blur()
    for (const fx of result.effects) applyEffect(fx, setGame, onWebsite)
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
          Clicking anywhere in the window puts the cursor in the prompt, like a real terminal.
          Keyboard users already reach the input directly, so this click needs no key twin. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse convenience only, see above. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the input itself is keyboard-reachable. */}
      <div
        ref={scrollRef}
        data-lenis-prevent=""
        onClick={() => inputRef.current?.focus({ preventScroll: true })}
        className="min-h-0 flex-1 overflow-y-auto p-5 font-mono text-sm md:p-8 md:text-base"
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

          {/* On narrow screens the input wraps under the prompt instead of being squeezed. */}
          <form onSubmit={submit} className="flex flex-wrap items-center">
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

      {game ? (
        <Suspense fallback={null}>
          <GameWindow game={game} onExit={closeGame} />
        </Suspense>
      ) : null}
    </>
  )
}
