import { Link, useNavigate } from '@tanstack/react-router'
import { Briefcase, FolderKanban, Inbox, LogOut, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { LanguageToggle } from '@/admin/components/language-toggle'
import { PublishStatusPanel, usePublishPolling } from '@/admin/components/publish-status'
import { useT } from '@/admin/i18n/use-t'
import { logout } from '@/admin/lib/api'
import { useSession } from '@/admin/lib/session'
import { Button } from '@/admin/ui/button'
import { Toaster } from '@/admin/ui/sonner'
import { site } from '@/config/site.config'

type NavItem = {
  to: '/admin/leads' | '/admin/projects' | '/admin/experience'
  icon: LucideIcon
  label: 'navLeads' | 'navProjects' | 'navExperience'
}

const NAV: NavItem[] = [
  { to: '/admin/leads', icon: Inbox, label: 'navLeads' },
  { to: '/admin/projects', icon: FolderKanban, label: 'navProjects' },
  { to: '/admin/experience', icon: Briefcase, label: 'navExperience' },
]

const NAV_LINK =
  'text-muted-foreground hover:bg-accent hover:text-foreground rounded-base flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium transition-colors'
const NAV_LINK_ACTIVE =
  'bg-background text-foreground shadow-xs ring-1 ring-border hover:bg-background'

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useT()
  const { email } = useSession()
  const navigate = useNavigate()
  usePublishPolling()

  const signOut = async () => {
    await logout()
    await navigate({ to: '/admin/login' })
  }

  return (
    <div className="bg-background text-foreground min-h-screen md:flex">
      <aside className="border-border bg-muted hidden w-60 shrink-0 flex-col border-r md:sticky md:top-0 md:flex md:h-screen">
        <div className="px-5 pt-6 pb-5">
          <p className="font-display truncate text-base font-bold">{site.name}</p>
          <p className="text-muted-foreground text-sm">{t.panelTitle}</p>
        </div>

        <nav className="grid gap-0.5 px-3">
          {/* <Link> is fine here. The panel is an SPA, exempt from the no-<Link> rule. */}
          {NAV.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={NAV_LINK}
              // Ignore search params, or the link looks inactive on ?page=2.
              activeOptions={{ includeSearch: false }}
              activeProps={{ className: NAV_LINK_ACTIVE }}
            >
              <Icon className="size-4" aria-hidden />
              {t[label]}
            </Link>
          ))}
        </nav>

        {/* One wrapper owns `mt-auto`, so the footer stays at the bottom while the status loads. */}
        <div className="mt-auto">
          <PublishStatusPanel className="border-border flex-col border-t px-5 py-4" />
          <div className="border-border border-t px-3 py-3">
            <p className="text-muted-foreground truncate px-2.5 pb-2 text-sm" title={email ?? ''}>
              {email}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={signOut} className="flex-1 justify-start">
                <LogOut aria-hidden />
                {t.signOut}
              </Button>
              <LanguageToggle />
            </div>
          </div>
        </div>
      </aside>

      <header className="border-border bg-muted flex items-center gap-2 border-b px-4 py-3 md:hidden">
        <p className="font-display mr-auto truncate text-base font-bold">{site.name}</p>
        <LanguageToggle />
        <Button variant="ghost" size="sm" onClick={signOut}>
          {t.signOut}
        </Button>
      </header>
      <PublishStatusPanel className="border-border bg-muted items-center justify-between border-b px-4 py-2 md:hidden" />

      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>

      <Toaster />
    </div>
  )
}
