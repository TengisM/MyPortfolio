// The fixed left edge of every public page: the name in traditional Mongolian script, read top
// to bottom the way the script is written. A hairline on its right fills as you scroll.
// Desktop only; on phones the hero carries a smaller copy of the script.
export const SCRIPT_NAME = 'ᠲᠡᠩᠭᠢᠰ'

export function ScriptRail({ label }: { label: string }) {
  return (
    <aside
      aria-label={label}
      className="border-border bg-background fixed inset-y-0 left-0 z-40 hidden w-36 flex-col items-center border-r md:flex"
    >
      <div className="relative flex flex-1 items-center justify-center">
        {/* Pale copy underneath, blue copy on top. The blue one is clipped open on load. */}
        <span aria-hidden="true" className="script text-accent text-rail">
          {SCRIPT_NAME}
        </span>
        <span
          aria-hidden="true"
          className="script script-ink text-primary text-rail absolute inset-0 flex items-center justify-center"
        >
          {SCRIPT_NAME}
        </span>
      </div>
      <span
        aria-hidden="true"
        className="rail-progress bg-primary absolute top-0 -right-px h-full w-0.5"
      />
    </aside>
  )
}
