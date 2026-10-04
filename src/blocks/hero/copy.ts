export type HeroCopy = {
  navLabel: string
  /** `poster` variant: the one word set in poster type. */
  mega: string
  /** `poster` variant: the handwritten line under the name. */
  tagline: string
  scrollLabel: string
  eyebrow: string
  heading: string
  lead: string
  location: string
  skillsLabel: string
  skills: string[]
  primaryCta: { label: string; target: string }
  /** A file under public/, downloaded rather than navigated to. */
  cv: { label: string; href: string }
  socials: { label: string; href: string }[]
  /** `split` variant only — optional, so `centered` is not forced to supply it. */
  image?: { src: string; alt: string; width: number; height: number }
}

// Shared by both languages: product names are not translated.
const skills = [
  'React',
  'Next.js',
  'TypeScript',
  'TanStack Start',
  'Node.js',
  'Go',
  'Elixir / Phoenix',
  'PostgreSQL',
  'Tailwind CSS',
  'Vue.js',
  'Web3',
]

const socials = [
  { label: 'GitHub', href: 'https://github.com/TengisM' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/tenggis-munkhbaatar-2a32b025a/' },
]

const cvHref = '/files/Tenggis_CV.pdf'

export const mn: HeroCopy = {
  navLabel: 'Эхлэл',
  mega: 'Тэнгис',
  tagline: 'Энгийн, ойлгомжтой, найдвартай.',
  scrollLabel: 'ДООШ ГҮЙЛГЭ · ДООШ ГҮЙЛГЭ · ',
  eyebrow: 'Frontend / Fullstack инженер',
  heading: 'Тэнгис Мөнхбаатар',
  lead: 'Хэрэглэгчдэд ойлгомжтой, найдвартай интерфейс бүтээдэг. 2020 оноос хойш банк, тээвэр, боловсрол, Web3 салбарын back-office болон хэрэглэгчийн бүтээгдэхүүн хөгжүүлж байна.',
  location: 'Улаанбаатар → удахгүй Берлин',
  skillsLabel: 'Ур чадвар',
  skills,
  primaryCta: { label: 'Холбоо барих', target: 'contact' },
  cv: { label: 'CV татах', href: cvHref },
  socials,
  image: {
    src: '/images/tenggis.webp',
    alt: 'Тэнгис Мөнхбаатарын хөрөг зураг',
    width: 720,
    height: 720,
  },
}

export const en: HeroCopy = {
  navLabel: 'Home',
  mega: 'Tenggis',
  tagline: 'Simple, clear, dependable.',
  scrollLabel: 'SCROLL DOWN · SCROLL DOWN · ',
  eyebrow: 'Frontend / Fullstack Engineer',
  heading: 'Tenggis Munkhbaatar',
  lead: "I build interfaces people find clear and can rely on. Since 2020 I've shipped back-office tools and user-facing products in banking, ride-hailing, education and Web3.",
  location: 'Ulaanbaatar → relocating to Berlin',
  skillsLabel: 'Skills',
  skills,
  primaryCta: { label: 'Get in touch', target: 'contact' },
  cv: { label: 'Download CV', href: cvHref },
  socials,
  image: {
    src: '/images/tenggis.webp',
    alt: 'Portrait of Tenggis Munkhbaatar',
    width: 720,
    height: 720,
  },
}
