export type AboutCopy = {
  navLabel: string
  /** The poster word above the section. */
  title: string
  heading: string
  paragraphs: string[]
  highlights: { value: string; label: string }[]
  image: { src: string; alt: string; width: number; height: number }
}

const image = { src: '/images/smile.webp', width: 720, height: 960 }

export const mn: AboutCopy = {
  navLabel: 'Миний тухай',
  title: 'Тухай',
  heading: 'Миний тухай',
  paragraphs: [
    'Би 5 гаруй жилийн туршлагатай Frontend / Fullstack инженер. Тэтгэлэг, UbCab, UbEats зэрэг өндөр ачаалалтай платформ, StableLab-ийн DAO аналитик, одоо Танасофт дээр банкны back-office систем хөгжүүлж байна.',
    'Нарийн төвөгтэй шаардлагыг энгийн, найдвартай интерфейс болгох дуртай. Ихэвчлэн React, Next.js, TypeScript-ээр ажилладаг ч backend талд Node.js, Go, Elixir, PostgreSQL ашиглан бүтэн функцийг эхнээс нь дуустал хүргэдэг.',
  ],
  highlights: [
    { value: '5+', label: 'жилийн туршлага' },
    { value: '2M+', label: 'хэрэглэгчтэй бүтээгдэхүүн' },
    { value: '700+', label: 'файл шилжүүлсэн' },
  ],
  image: { ...image, alt: 'Инээмсэглэж буй Тэнгис' },
}

export const en: AboutCopy = {
  navLabel: 'About',
  title: 'About',
  heading: 'About me',
  paragraphs: [
    "I'm a Frontend / Fullstack engineer with 5+ years of experience. I've worked on high-traffic platforms like Tetgeleg, UbCab and UbEats, on DAO analytics at StableLab, and now on a core banking back office at Tanasoft.",
    'I like turning complicated requirements into simple, dependable interfaces. Most of my work is React, Next.js and TypeScript, and on the backend I use Node.js, Go, Elixir and PostgreSQL to ship features end to end.',
  ],
  highlights: [
    { value: '5+', label: 'years shipping' },
    { value: '2M+', label: 'users on products I built' },
    { value: '700+', label: 'files migrated in one rewrite' },
  ],
  image: { ...image, alt: 'Tenggis smiling' },
}
