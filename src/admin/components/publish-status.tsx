import { CircleAlert, Clock, Rocket } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/admin/i18n/use-t'
import { ApiError } from '@/admin/lib/errors'
import { dateFormatter } from '@/admin/lib/format'
import { useLanguage } from '@/admin/lib/language'
import { publishNow, refreshPublishStatus, usePublishStatus } from '@/admin/lib/publish'
import { cn } from '@/admin/lib/utils'
import { Button } from '@/admin/ui/button'

const POLL_MS = 10_000

// Call once, from the shell. PublishStatusPanel renders twice (sidebar and mobile header), and
// polling from each copy would double the requests.
export function usePublishPolling(): void {
  const pending = usePublishStatus()?.pending === true

  useEffect(() => {
    void refreshPublishStatus()
  }, [])

  // Only while pending: nothing else changes the status except this panel's own saves, and those
  // refresh it themselves.
  useEffect(() => {
    if (!pending) return
    const id = window.setInterval(() => void refreshPublishStatus(), POLL_MS)
    return () => window.clearInterval(id)
  }, [pending])
}

export function PublishStatusPanel({ className }: { className?: string }) {
  const t = useT()
  const language = useLanguage()
  const status = usePublishStatus()
  const [busy, setBusy] = useState(false)
  const formatDate = useMemo(() => dateFormatter(language), [language])

  // Nothing until the first answer, rather than a guess that flips a moment later.
  if (status === null) return null

  const publish = async () => {
    setBusy(true)
    try {
      await publishNow()
      toast.success(t.publishStarted)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.messageFor(t) : t.errUnknown)
    } finally {
      setBusy(false)
    }
  }

  let text: string
  let failed = false
  if (!status.configured) {
    text = t.publishNotConfigured
  } else if (status.pending) {
    text = t.publishPending
  } else if (status.last_error !== null && status.last_error !== '') {
    text = t.publishFailed
    failed = true
  } else if (status.last_triggered_at !== null) {
    text = `${t.publishLast}: ${formatDate(status.last_triggered_at)}`
  } else {
    text = t.publishNever
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <p
        aria-live="polite"
        // The raw error is English from the deploy hook. A tooltip is enough for the owner.
        title={failed ? (status.last_error ?? undefined) : undefined}
        className={cn(
          'text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs',
          failed && 'text-destructive',
        )}
      >
        {failed ? (
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <Clock
            className={cn('size-3.5 shrink-0', status.pending && 'text-primary animate-pulse')}
            aria-hidden
          />
        )}
        <span className="truncate">{text}</span>
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={publish}
        disabled={busy || !status.configured}
        className="shrink-0"
      >
        <Rocket aria-hidden />
        {busy ? t.publishing : t.publishNow}
      </Button>
    </div>
  )
}
