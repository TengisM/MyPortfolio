import type { PanelLanguage } from './language'

// Browsers ship no Mongolian date names (`mn-MN` falls back to English), so Mongolian gets a
// numeric date instead: 2026.09.24 14:05.
export function dateFormatter(language: PanelLanguage): (iso: string) => string {
  if (language === 'en') {
    const f = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    return (iso) => f.format(new Date(iso))
  }
  const f = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return (iso) => {
    const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
    return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`
  }
}

// For `YYYY-MM-DD` dates with no zone: `Apr 2026` in English, `2026.04` in Mongolian.
// Sliced, not parsed: `new Date('2026-04-01')` is UTC midnight, which is March 31 west of UTC.
export function monthFormatter(language: PanelLanguage): (date: string) => string {
  if (language === 'en') {
    const f = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    return (date) => f.format(new Date(`${date.slice(0, 7)}-01T00:00:00Z`))
  }
  return (date) => `${date.slice(0, 4)}.${date.slice(5, 7)}`
}
