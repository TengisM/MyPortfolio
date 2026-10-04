import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { EchoTitle } from '@/components/type/echo-title'
import { contactSchema, MIN_ELAPSED_MS } from '@/integrations/submit-schema'
import type { BlockProps } from '@/lib/types'
import { submitContact } from '@/submit'
import type { ContactCopy } from './copy'

type Fields = { name: string; email: string; message: string; honeypot_url: string }

export function ContactForm({
  copy,
  site,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<ContactCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  const { register, handleSubmit, reset } = useForm<Fields>()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const mountedAt = useRef(Date.now())

  async function onSubmit(values: Fields) {
    const parsed = contactSchema.safeParse(values)
    if (!parsed.success) {
      setState('error')
      setMessage(copy.validation)
      return
    }

    setState('sending')

    // Too fast? Wait out the rest instead of rejecting. A fast human still gets through.
    const elapsed = Date.now() - mountedAt.current
    if (elapsed < MIN_ELAPSED_MS) {
      await new Promise((r) => setTimeout(r, MIN_ELAPSED_MS - elapsed))
    }

    const payload = { ...parsed.data, elapsedMs: Date.now() - mountedAt.current }
    const result = await submitContact(payload)
    if (result.ok) {
      setState('sent')
      setMessage(copy.success)
      reset()
    } else {
      setState('error')
      setMessage(copy.error)
    }
  }

  const field =
    'border-foreground/40 placeholder:text-muted-foreground focus:border-foreground w-full min-h-11 border-b-2 bg-transparent px-1 py-3 text-lg outline-none transition-colors'

  return (
    // Pulled up over the section above so the rounded corners show it, like Junni's footer.
    <Section id={anchorId} surface={surface} className="relative -mt-10 rounded-t-4xl">
      <Container>
        <EchoTitle as={H} text={copy.heading} />
        <div className="mt-12 grid gap-12 md:mt-16 md:grid-cols-2 md:gap-20">
          <div>
            <p className="font-hand -rotate-1 text-2xl md:text-3xl">{copy.lead}</p>
            {site.organization.email ? (
              <div className="mt-10">
                <p className="text-muted-foreground text-sm font-semibold tracking-widest uppercase">
                  {copy.emailLabel}
                </p>
                <a
                  href={`mailto:${site.organization.email}`}
                  className="font-display mt-2 inline-block text-lg font-bold break-all underline decoration-2 underline-offset-8 transition-colors hover:decoration-transparent md:text-2xl"
                >
                  {site.organization.email}
                </a>
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
            <label className="grid gap-2">
              <span className="text-sm font-semibold tracking-widest uppercase">
                {copy.fields.name}
              </span>
              <input className={field} autoComplete="name" {...register('name')} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold tracking-widest uppercase">
                {copy.fields.email}
              </span>
              <input className={field} type="email" autoComplete="email" {...register('email')} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold tracking-widest uppercase">
                {copy.fields.message}
              </span>
              <textarea className={field} rows={5} {...register('message')} />
            </label>

            {/* Honeypot. Moved off-screen, not display:none: verify-build rejects hidden content,
              and bots detect it. */}
            <div aria-hidden="true" className="absolute -left-96">
              <input
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                {...register('honeypot_url')}
              />
            </div>

            <button
              type="submit"
              disabled={state === 'sending'}
              className="bg-primary text-primary-foreground min-h-11 justify-self-start rounded-full px-8 py-4 font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {state === 'sending' ? copy.submitting : copy.submit}
            </button>

            {/* Keep the live region mounted. Screen readers miss one inserted on change. */}
            <p
              role="status"
              aria-live="polite"
              // Preset tokens, not fixed colours, so they follow the preset.
              className={
                !message
                  ? 'sr-only'
                  : state === 'error'
                    ? 'text-destructive text-sm'
                    : 'text-success text-sm'
              }
            >
              {message}
            </p>
          </form>
        </div>
      </Container>
    </Section>
  )
}
