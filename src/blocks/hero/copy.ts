export type HeroCopy = {
  navLabel: string
  heading: string
  role: string
  lead: string
  /** The two cities, each shown with its live local time. */
  cities: { label: string; timeZone: string }[]
  moving: string
  primaryCta: { label: string; target: string }
  emailLabel: string
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

export const mn: HeroCopy = {
  navLabel: 'Эхлэл',
  heading: 'Тэнгис Мөнхбаатар',
  role: 'Frontend болон fullstack инженер',
  lead: 'Тэтгэлэг, такси дуудлага, Web3, банкны систем зэрэг бүтээгдэхүүнүүдийн back-office болон хэрэглэгчийн хэсгийг хөгжүүлдэг. Таван жил болж байгаа ч нарийн төвөгтэй ажлын урсгалыг энгийн дэлгэц болгох нь одоо ч хамгийн дуртай ажил минь.',
  cities: [
    { label: 'Улаанбаатар', timeZone: 'Asia/Ulaanbaatar' },
    { label: 'Берлин', timeZone: 'Europe/Berlin' },
  ],
  moving: 'Улаанбаатарт амьдардаг, Берлин рүү нүүж байна.',
  primaryCta: { label: 'Зурвас илгээх', target: 'contact' },
  emailLabel: 'И-мэйл',
  cv: { label: 'CV (PDF)', href: cvHref },
  socials,
  image: { ...image, alt: 'Тэнгисийн хөрөг зураг' },
}

export const en: HeroCopy = {
  navLabel: 'Home',
  heading: 'Tenggis Munkhbaatar',
  role: 'Frontend and fullstack engineer',
  lead: "I build back-office tools and the products around them, for scholarship platforms, ride-hailing, Web3 and banking. Five years in, I'm still happiest when a complicated workflow turns into a screen that just works.",
  cities: [
    { label: 'Ulaanbaatar', timeZone: 'Asia/Ulaanbaatar' },
    { label: 'Berlin', timeZone: 'Europe/Berlin' },
  ],
  moving: "I live in Ulaanbaatar and I'm moving to Berlin.",
  primaryCta: { label: 'Send a message', target: 'contact' },
  emailLabel: 'Email',
  cv: { label: 'CV (PDF)', href: cvHref },
  socials,
  image: { ...image, alt: 'Portrait of Tenggis Munkhbaatar' },
}
