import type { ElementType } from 'react'

// A section title in poster type with outlined copies stacked above it, fading upward. The copies
// are aria-hidden, so a screen reader hears the word once.
export function EchoTitle({
  as: Tag,
  text,
  outline = false,
}: {
  as: ElementType
  text: string
  /** Draw the main word hollow too, not only its echoes. */
  outline?: boolean
}) {
  return (
    <Tag className="echo font-display text-giant pt-20 font-black uppercase md:pt-28">
      {[3, 2, 1].map((n) => (
        <span key={n} data-echo={n} aria-hidden="true" className="pt-20 md:pt-28">
          {text}
        </span>
      ))}
      {outline ? (
        <span className="text-outline relative">{text}</span>
      ) : (
        <span className="relative">{text}</span>
      )}
    </Tag>
  )
}
