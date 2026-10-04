export type AboutCopy = {
  navLabel: string
  heading: string
  paragraphs: string[]
  /** Rendered as a TypeScript object in an editor. Keys stay in English, like real code. */
  profile: {
    comment: string
    role: string
    location: string
    experience: string
    education: string
    languages: string[]
    frontend: string[]
    backend: string[]
    currently: string
  }
}

// Tool names are not translated.
const frontend = ['React', 'Next.js', 'TypeScript', 'TanStack', 'Tailwind', 'Vue']
const backend = ['Node.js', 'Go', 'Elixir', 'PostgreSQL']

export const mn: AboutCopy = {
  navLabel: 'Миний тухай',
  heading: 'Миний тухай',
  paragraphs: [
    'Би 5 гаруй жилийн туршлагатай Frontend / Fullstack инженер. Тэтгэлэг, UbCab, UbEats зэрэг өндөр ачаалалтай платформ, StableLab-ийн DAO аналитик, одоо Танасофт дээр банкны back-office систем хөгжүүлж байна.',
    'Нарийн төвөгтэй шаардлагыг энгийн, найдвартай интерфейс болгох дуртай. Ихэвчлэн React, Next.js, TypeScript-ээр ажилладаг ч backend талд Node.js, Go, Elixir, PostgreSQL ашиглан бүтэн функцийг эхнээс нь дуустал хүргэдэг.',
  ],
  profile: {
    comment: 'Миний тухай товчхон',
    role: 'Fullstack инженер',
    location: 'Улаанбаатар → Берлин',
    experience: '5+ жил',
    education: 'ШУТИС, Программ хангамж',
    languages: ['Монгол', 'Англи'],
    frontend,
    backend,
    currently: 'Танасофт, банкны back-office',
  },
}

export const en: AboutCopy = {
  navLabel: 'About',
  heading: 'A bit about me',
  paragraphs: [
    "I'm a Frontend / Fullstack engineer with 5+ years of experience. I've worked on high-traffic platforms like Tetgeleg, UbCab and UbEats, on DAO analytics at StableLab, and now on a core banking back office at Tanasoft.",
    'I like turning complicated requirements into simple, dependable interfaces. Most of my work is React, Next.js and TypeScript, and on the backend I use Node.js, Go, Elixir and PostgreSQL to ship features end to end.',
  ],
  profile: {
    comment: 'me, in short',
    role: 'Fullstack Engineer',
    location: 'Ulaanbaatar → Berlin',
    experience: '5+ years',
    education: 'Software Engineering, MUST',
    languages: ['Mongolian', 'English'],
    frontend,
    backend,
    currently: 'Core banking back office at Tanasoft',
  },
}
