// Imported rather than kept in public/, so the file name carries a hash and browsers can cache it
// for a year. The photo shows at 186 to 340 CSS pixels, so a 360px copy serves most screens.
import portrait from './tenggis.webp'
import portraitSmall from './tenggis.webp?w=360&format=webp&imagetools'

const portraitSrcSet = `${portraitSmall} 360w, ${portrait} 720w`

export type HeroCopy = {
  navLabel: string
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
  image?: { src: string; srcSet?: string; alt: string; width: number; height: number }
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
  eyebrow: 'Frontend / Fullstack инженер',
  heading: 'Сайн уу, би Тэнгис',
  lead: 'Хэрэглэгчдэд ойлгомжтой, найдвартай интерфейс бүтээдэг. 2020 оноос хойш банк, тээвэр, боловсрол, Web3 салбарын back-office болон хэрэглэгчийн бүтээгдэхүүн хөгжүүлж байна.',
  location: 'Улаанбаатарт амьдардаг, Берлин рүү нүүхэд бэлэн',
  skillsLabel: 'Ур чадвар',
  skills,
  primaryCta: { label: 'Холбоо барих', target: 'contact' },
  cv: { label: 'CV татах', href: cvHref },
  socials,
  image: {
    src: portrait,
    srcSet: portraitSrcSet,
    alt: 'Тэнгис Мөнхбаатарын хөрөг зураг',
    width: 720,
    height: 720,
  },
}

export const en: HeroCopy = {
  navLabel: 'Home',
  eyebrow: 'Frontend / Fullstack Engineer',
  heading: "Hi, I'm Tenggis",
  lead: "I build interfaces people find clear and can rely on. Since 2020 I've shipped back-office tools and user-facing products in banking, ride-hailing, education and Web3.",
  location: 'Based in Ulaanbaatar, willing to relocate to Berlin',
  skillsLabel: 'Skills',
  skills,
  primaryCta: { label: 'Get in touch', target: 'contact' },
  cv: { label: 'Download CV', href: cvHref },
  socials,
  image: {
    src: portrait,
    srcSet: portraitSrcSet,
    alt: 'Portrait of Tenggis Munkhbaatar',
    width: 720,
    height: 720,
  },
}
