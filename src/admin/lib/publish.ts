import { useSyncExternalStore } from 'react'
import { apiFetch } from './api'

// Matches the API's JSON, so snake_case.
export type PublishStatus = {
  // False when the API has no deploy hook URL. Saves still land, but the site never rebuilds.
  configured: boolean
  // A save reset the debounce timer and the deploy hook has not fired yet.
  pending: boolean
  last_triggered_at: string | null
  last_error: string | null
}

// Shared, because the shell shows the status and every content screen refreshes it after a save.
// `null` until the first answer.
let state: PublishStatus | null = null

const listeners = new Set<() => void>()

function emit(): void {
  // Iterate a copy, as in session.ts.
  for (const listener of [...listeners]) listener()
}

// Counts requests so a slow answer cannot overwrite a newer one. A poll can start before a
// save's refresh and finish after it.
let latest = 0

function apply(seq: number, next: PublishStatus): void {
  if (seq < latest) return
  latest = seq
  state = next
  emit()
}

let issued = 0

// Never throws. The status is a hint beside the real work, and a failed poll should not raise a
// toast every 10 seconds. The last known status stays on screen.
export async function refreshPublishStatus(): Promise<void> {
  const seq = ++issued
  try {
    apply(seq, await apiFetch<PublishStatus>('/admin/publish'))
  } catch {
    // Keep the last known status.
  }
}

// Fires the deploy hook now instead of waiting for the debounce. Throws ApiError for the caller
// to show.
export async function publishNow(): Promise<void> {
  const seq = ++issued
  apply(seq, await apiFetch<PublishStatus>('/admin/publish', { method: 'POST' }))
}

function getPublishStatus(): PublishStatus | null {
  return state
}

// No server snapshot to leak: the panel never renders signed in on the server.
function getServerPublishStatus(): PublishStatus | null {
  return null
}

function subscribePublishStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePublishStatus(): PublishStatus | null {
  return useSyncExternalStore(subscribePublishStatus, getPublishStatus, getServerPublishStatus)
}
