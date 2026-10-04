// zod/mini, not zod: the contact form ships this to every visitor, and the full build pulled
// most of zod into the main bundle. Same rules, written in mini's function style.
import { z } from 'zod/mini'

// Fields only. Timing is checked separately so a fast human never sees "your fields are wrong".
export const contactSchema = z.object({
  name: z.string().check(z.minLength(2), z.maxLength(120)),
  email: z.email(),
  message: z.string().check(z.minLength(10), z.maxLength(4000)),
  // Honeypot, must stay empty. Don't rename it to a real-sounding field: autofill would fill it.
  honeypot_url: z._default(z.optional(z.string().check(z.maxLength(0))), ''),
})

export const MIN_ELAPSED_MS = 2000

// `elapsedMs` is required so the server also checks timing, not only the client.
export const submissionSchema = z.extend(contactSchema, {
  elapsedMs: z.int().check(z.gte(MIN_ELAPSED_MS)),
})

export type SubmissionInput = z.infer<typeof submissionSchema>

export type ContactInput = z.infer<typeof contactSchema>
export type SubmitResult = { ok: true } | { ok: false; error: string }

// What `@/submit` must export.
export type SubmitModule = {
  submitContact: (input: SubmissionInput) => Promise<SubmitResult>
}
