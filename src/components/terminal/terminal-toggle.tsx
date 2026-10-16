import { openTerminal } from './terminal-app'

/** The header's way back into the terminal. */
export function TerminalToggle({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={openTerminal}
      aria-label={label}
      title={label}
      className="border-foreground/30 hover:border-primary hover:text-primary flex min-h-9 items-center rounded-full border px-3 font-mono text-xs font-bold transition-colors"
    >
      &gt;_
    </button>
  )
}
