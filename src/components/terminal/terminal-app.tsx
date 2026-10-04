import { en as aboutEn, mn as aboutMn } from '@/blocks/about/copy'
import { en as experienceEn, mn as experienceMn } from '@/blocks/experience/copy'
import { en as heroEn, mn as heroMn } from '@/blocks/hero/copy'
import { VIEW_KEY } from '@/components/view-script'
import { content } from '@/content'
import type { Locale, SiteConfig } from '@/lib/types'
import { InteractiveTerminal } from './interactive-terminal'
import { MENU, type ShellData } from './shell'

const HERO = { en: heroEn, mn: heroMn }
const ABOUT = { en: aboutEn, mn: aboutMn }
const EXPERIENCE = { en: experienceEn, mn: experienceMn }

const TEXT = {
  en: {
    label: 'Terminal',
    inputLabel: 'Terminal command',
    hint: 'type a name from the list, or `help`',
    openSite: 'Open website',
    pick: 'Pick one: click it, or type its name.',
  },
  mn: {
    label: 'Терминал',
    inputLabel: 'Терминалын тушаал',
    hint: 'жагсаалтаас нэрийг бичих, эсвэл `help`',
    openSite: 'Вэбсайт нээх',
    pick: 'Нэгийг нь сонго: дарах эсвэл нэрийг нь бичих.',
  },
}

/** Asks the live prompt to run a command, as if typed. */
export const runInTerminal = (command: string) =>
  dispatchEvent(new CustomEvent('terminal:run', { detail: command }))

function shellData(locale: Locale, site: SiteConfig): ShellData {
  const hero = HERO[locale]
  return {
    aboutParagraphs: ABOUT[locale].paragraphs,
    skills: hero.skills,
    projects: content.projects.map((p) => ({
      title: p.title,
      url: p.url,
      description: p.description[locale],
    })),
    career: EXPERIENCE[locale].items.map((i) => ({
      period: i.period,
      position: i.position,
      organization: i.organization,
    })),
    email: site.organization.email,
    socials: hero.socials,
    cvHref: hero.cv.href,
  }
}

/** Leaves the terminal for the regular site, remembered for this browser session. */
export function openWebsite(target?: string) {
  document.documentElement.dataset.view = 'site'
  try {
    sessionStorage.setItem(VIEW_KEY, 'site')
  } catch {
    // Private mode can refuse storage. The switch still works for this page view.
  }
  requestAnimationFrame(() => {
    if (target) document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' })
    else scrollTo({ top: 0 })
  })
}

/** Brings the terminal back over the site. */
export function openTerminal() {
  delete document.documentElement.dataset.view
  try {
    sessionStorage.removeItem(VIEW_KEY)
  } catch {
    // Nothing to forget.
  }
}

const PROMPT = 'text-primary select-none'

/**
 * The first thing a visitor sees: a full-screen terminal. The scripted intro is in the HTML and
 * types itself out with CSS; then the prompt goes live. `website` hides it and shows the site.
 */
export function TerminalApp({ locale, site }: { locale: Locale; site: SiteConfig }) {
  const t = TEXT[locale]
  const hero = HERO[locale]
  return (
    // A div with role="region", not <section>: the kit reserves <section> for its <Section>
    // layout primitive, and this is a fixed overlay, not a page section.
    // biome-ignore lint/a11y/useSemanticElements: see above.
    <div
      role="region"
      aria-label={t.label}
      className="terminal-app bg-background fixed inset-0 z-60 flex flex-col p-2 md:p-4"
    >
      <div className="border-border bg-muted/70 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-2xl">
        <div className="border-border flex items-center gap-2 border-b px-4 py-2.5">
          <button
            type="button"
            onClick={() => openWebsite()}
            aria-label={t.openSite}
            className="size-3 rounded-full bg-red-400/80 hover:bg-red-400"
          />
          <span aria-hidden="true" className="size-3 rounded-full bg-amber-400/80" />
          <span aria-hidden="true" className="size-3 rounded-full bg-green-400/80" />
          <span className="text-muted-foreground ml-3 min-w-0 flex-1 truncate font-mono text-xs">
            tenggis@ulaanbaatar: ~/tenggis-port
          </span>
          <button
            type="button"
            onClick={() => openWebsite()}
            className="border-border hover:border-primary hover:text-primary shrink-0 rounded-md border px-3 py-1 font-mono text-xs transition-colors"
          >
            {t.openSite}
          </button>
        </div>

        <InteractiveTerminal
          user="tenggis@ulaanbaatar"
          inputLabel={t.inputLabel}
          hint={t.hint}
          data={shellData(locale, site)}
          onWebsite={openWebsite}
          intro={
            <>
              <p className="cmd">
                <span className={PROMPT}>$ </span>whoami
              </p>
              <div className="out mb-2">
                <p className="font-display text-3xl leading-tight font-black sm:text-4xl md:text-6xl">
                  {site.organization.legalName ?? site.name}
                </p>
                <p className="text-muted-foreground mt-1">{hero.eyebrow}</p>
              </div>
              <p className="cmd">
                <span className={PROMPT}>$ </span>cat about.txt
              </p>
              <p className="out text-muted-foreground mb-2">
                {hero.lead} {hero.location}.
              </p>
              <p className="cmd">
                <span className={PROMPT}>$ </span>ls
              </p>
              <p className="out flex flex-wrap gap-x-6 gap-y-1">
                {MENU.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => runInTerminal(m.name)}
                    className={
                      m.tone === 'exec'
                        ? 'tok-str font-semibold underline-offset-4 hover:underline'
                        : m.tone === 'dir'
                          ? 'text-primary font-semibold underline-offset-4 hover:underline'
                          : 'underline-offset-4 hover:underline'
                    }
                  >
                    {m.tone === 'exec' ? `${m.name}*` : m.tone === 'dir' ? `${m.name}/` : m.name}
                  </button>
                ))}
              </p>
              <p className="out text-muted-foreground mb-2">{t.pick}</p>
            </>
          }
        />
      </div>
    </div>
  )
}
