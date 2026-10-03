import { useState } from 'react'
import { useT } from '@/admin/i18n/use-t'
import { Button } from '@/admin/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/admin/ui/dialog'

// `name` is null while closed. `onConfirm` reports its own errors; this only keeps the buttons
// disabled until it settles, so a double click cannot send two DELETEs.
export function ConfirmDelete({
  name,
  onCancel,
  onConfirm,
}: {
  name: string | null
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={name !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent closeLabel={t.close} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.confirmDelete}</DialogTitle>
          <DialogDescription>
            <span className="text-foreground font-medium break-words">{name}</span>
            <br />
            {t.confirmDeleteHint}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {t.cancel}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? t.deleting : t.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
