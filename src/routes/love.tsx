import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

// A private page, not part of the portfolio: kept out of pages.config.ts, so it is not in the
// sitemap or the menu, and noindex keeps it out of search.
export const Route = createFileRoute('/love')({
  loader: () => ({ locale: 'en' as const }),
  head: () => ({
    meta: [
      { title: 'Will you be my Valentine?' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: LovePage,
})

const messages = [
  'Are you sure? 🥺',
  'Really sure? 😢',
  'Think again... 💔',
  'Pretty pleaseee? 😭',
  'Last chance! 💖',
]

// Text sizes the Yes button grows through on each "No". Scale utilities, not inline pixel sizes.
const YES_SIZES = [
  'text-2xl',
  'text-3xl',
  'text-4xl',
  'text-5xl',
  'text-6xl',
  'text-7xl',
  'text-8xl',
]

function LovePage() {
  const [messageIndex, setMessageIndex] = useState(0)
  const [noCount, setNoCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = 0.5
    // Browsers block autoplay until the visitor interacts. The toggle covers that case.
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {})
  }, [])

  const toggleMusic = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      void audio.play()
      setIsPlaying(true)
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }

  const handleNo = () => {
    setMessageIndex((i) => (i + 1) % messages.length)
    setNoCount((n) => n + 1)
  }

  const yesSize = YES_SIZES[Math.min(noCount, YES_SIZES.length - 1)]

  return (
    <main className="relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-linear-to-br from-rose-200 via-pink-100 to-rose-300 p-6 text-center">
      {/* biome-ignore lint/a11y/useMediaCaption: background music, no speech to caption. */}
      <audio ref={audioRef} src="/love/i-aint-worried.m4a" loop />
      <button
        type="button"
        onClick={toggleMusic}
        className="absolute top-4 right-4 rounded-full border border-rose-200 bg-rose-50/90 px-4 py-2 text-rose-800 shadow-md transition-colors hover:bg-rose-100"
      >
        {isPlaying ? '🔊 Music On' : '🔇 Music Off'}
      </button>

      {accepted ? (
        <>
          <h1 className="mb-6 text-4xl font-bold text-rose-900">YAAAYYY!!! 💕💖💘</h1>
          <img
            src="https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif"
            alt="Happy love gif"
            className="mb-6 w-72 rounded-xl shadow-lg"
          />
          <p className="text-xl text-rose-800">I love you soooo much! 🥰 You just made my day ❤️</p>
          <p className="mt-4 text-lg text-rose-800">
            And hey, you got this thing. 🎤 It&apos;s your first big gig and you&apos;re singing.
            I&apos;m so proud of you. Go crush it! ✨
          </p>
        </>
      ) : (
        <>
          <h1 className="mb-6 text-3xl font-bold text-rose-900">Will you be my Valentine? 💘</h1>
          <img
            src="https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif"
            alt="Cute love gif"
            className="mb-6 w-64 rounded-xl shadow-lg"
          />
          <p className="mb-4 text-lg text-rose-800">{messages[messageIndex]}</p>
          <div className="mt-4 flex items-center gap-6">
            <button
              type="button"
              onClick={() => setAccepted(true)}
              className={`${yesSize} rounded-full bg-green-500 px-6 py-3 text-white transition-all duration-300 hover:bg-green-600`}
            >
              Yes 💖
            </button>
            <button
              type="button"
              onClick={handleNo}
              className="rounded-full bg-red-500 px-6 py-3 text-white transition-all duration-300 hover:bg-red-600"
            >
              No 😢
            </button>
          </div>
        </>
      )}
    </main>
  )
}
