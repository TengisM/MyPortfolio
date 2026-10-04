// Splits a word into letters that rise into place one after another (see `.rise` in
// src/styles/portfolio.css). Pure CSS, so it plays without JavaScript and adds nothing to the
// bundle. Array.from keeps Cyrillic and other multi-byte letters whole.
export function RiseText({ text }: { text: string }) {
  return (
    <span aria-hidden="true" className="rise">
      {Array.from(text).map((ch, i) => (
        // Letters repeat (the N in TENGGIS), so the index is part of the key.
        // biome-ignore lint/suspicious/noArrayIndexKey: the string never reorders.
        <span key={`${ch}-${i}`}>{ch === ' ' ? ' ' : ch}</span>
      ))}
    </span>
  )
}
