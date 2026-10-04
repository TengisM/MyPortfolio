import type { ElementType } from 'react'

// A section title in poster type with outlined copies stacked above it, fading upward. The copies
// are aria-hidden, so a screen reader hears the word once.
export function EchoTitle({ as: Tag, text }: { as: ElementType; text: string }) {
  return (
    <Tag className="echo font-display text-giant pt-16 font-black md:pt-24">
      {[3, 2, 1].map((n) => (
        <span key={n} data-echo={n} aria-hidden="true" className="pt-16 md:pt-24">
          {text}
        </span>
      ))}
      <span className="relative">{text}</span>
    </Tag>
  )
}
