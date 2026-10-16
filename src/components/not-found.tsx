import { useLocation } from '@tanstack/react-router'

/** The 404 page, written as the shell's answer to `cd` into a path that isn't there. */
export function NotFound() {
  const { pathname } = useLocation()
  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col justify-center gap-2 p-6 font-mono text-sm md:p-12 md:text-base">
      <p>
        <span className="text-primary select-none">$ </span>cd {pathname}
      </p>
      <p className="text-destructive">cd: no such file or directory: {pathname}</p>
      <h1 className="font-display mt-6 text-5xl font-black md:text-7xl">404</h1>
      <p className="text-muted-foreground">This page doesn't exist.</p>
      <p className="mt-6">
        <span className="text-primary select-none">$ </span>
        {/* A plain link, not <Link>: a client-side jump would skip loading the home page's blocks. */}
        <a href="/" className="text-primary underline underline-offset-4">
          cd ~
        </a>
      </p>
    </main>
  )
}
