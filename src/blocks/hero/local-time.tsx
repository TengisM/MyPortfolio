import { useEffect, useState } from 'react'

// The current time in a city, refreshed every 15 seconds. It renders a dash on the server and
// fills in after mount, so the prerendered HTML never holds a stale (or mismatched) time.
export function LocalTime({ timeZone }: { timeZone: string }) {
  const [time, setTime] = useState<string | null>(null)
  useEffect(() => {
    const format = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    })
    const tick = () => setTime(format.format(new Date()))
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [timeZone])
  return <time className="tabular">{time ?? '––:––'}</time>
}
