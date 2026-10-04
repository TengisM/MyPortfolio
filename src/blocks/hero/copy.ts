import type { Locale } from '@/lib/types'

export type HeroCopy = {
  navLabel: string
  /** Which language this copy is, so the terminal can load the matching content. */
  locale: Locale
  /** Accessible name of the terminal's input, and the hint shown in it before the first command. */
  inputLabel: string
  inputHint: string
  /** The window title of the terminal. */
  terminalTitle: string
  heading: string
  role: string
  lead: string
  location: string
  /** Labels for the files `ls ./links` prints. */
  linkNames: { github: string; linkedin: string; cv: string; contact: string }
  primaryCta: { label: string; target: string }
  /** A file under public/, downloaded rather than navigated to. */
  cv: { label: string; href: string }
  socials: { label: string; href: string }[]
  image?: { src: string; alt: string; width: number; height: number }
}

const socials = [
  { label: 'GitHub', href: 'https://github.com/TengisM' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/tenggis-munkhbaatar-2a32b025a/' },
]
const cvHref = '/files/Tenggis_CV.pdf'
const image = { src: '/images/tenggis.webp', width: 720, height: 720 }
// File names stay in English in both languages, as they would in a real shell.
const linkNames = { github: 'github', linkedin: 'linkedin', cv: 'cv.pdf', contact: 'contact' }

export const mn: HeroCopy = {
  navLabel: 'Эхлэл',
  locale: 'mn',
  inputLabel: 'Терминалын тушаал',
  inputHint: '`help` гэж бичээд Enter дарна уу',
  terminalTitle: 'tenggis@ulaanbaatar: ~',
  heading: 'Тэнгис Мөнхбаатар',
  role: 'Frontend / Fullstack инженер',
  lead: '2020 оноос хойш банк, тээвэр, боловсрол, Web3 салбарын back-office болон хэрэглэгчийн бүтээгдэхүүн хөгжүүлж байна.',
  location: 'Улаанбаатар → Берлин (удахгүй нүүнэ)',
  linkNames,
  primaryCta: { label: 'Холбоо барих', target: 'contact' },
  cv: { label: 'CV татах', href: cvHref },
  socials,
  image: { ...image, alt: 'Тэнгис Мөнхбаатарын хөрөг зураг' },
}

export const en: HeroCopy = {
  navLabel: 'Home',
  locale: 'en',
  inputLabel: 'Terminal command',
  inputHint: 'type `help` and press Enter',
  terminalTitle: 'tenggis@ulaanbaatar: ~',
  heading: 'Tenggis Munkhbaatar',
  role: 'Frontend / Fullstack Engineer',
  lead: "Since 2020 I've shipped back-office tools and user-facing products in banking, ride-hailing, education and Web3.",
  location: 'Ulaanbaatar → Berlin (moving soon)',
  linkNames,
  primaryCta: { label: 'Get in touch', target: 'contact' },
  cv: { label: 'Download CV', href: cvHref },
  socials,
  image: { ...image, alt: 'Portrait of Tenggis Munkhbaatar' },
}
