export type AboutCopy = {
  navLabel: string
  heading: string
  paragraphs: string[]
  /** Small personal facts, each with an emoji. */
  facts: { icon: string; text: string }[]
}

export const mn: AboutCopy = {
  navLabel: 'Миний тухай',
  heading: 'Миний тухай',
  paragraphs: [
    'Би 5 гаруй жилийн туршлагатай Frontend / Fullstack инженер. Тэтгэлэг, UbCab, UbEats зэрэг өндөр ачаалалтай платформ, StableLab-ийн DAO аналитик, одоо Танасофт дээр банкны back-office систем хөгжүүлж байна.',
    'Нарийн төвөгтэй шаардлагыг энгийн, найдвартай интерфейс болгох дуртай. Ихэвчлэн React, Next.js, TypeScript-ээр ажилладаг ч backend талд Node.js, Go, Elixir, PostgreSQL ашиглан бүтэн функцийг эхнээс нь дуустал хүргэдэг.',
  ],
  facts: [
    { icon: '💼', text: '2020 оноос хойш вэб бүтээж байна' },
    { icon: '🎓', text: 'ШУТИС, Программ хангамжийн инженер' },
    { icon: '🗣️', text: 'Монгол, англи хэлтэй' },
  ],
}

export const en: AboutCopy = {
  navLabel: 'About',
  heading: 'A bit about me',
  paragraphs: [
    "I'm a Frontend / Fullstack engineer with 5+ years of experience. I've worked on high-traffic platforms like Tetgeleg, UbCab and UbEats, on DAO analytics at StableLab, and now on a core banking back office at Tanasoft.",
    'I like turning complicated requirements into simple, dependable interfaces. Most of my work is React, Next.js and TypeScript, and on the backend I use Node.js, Go, Elixir and PostgreSQL to ship features end to end.',
  ],
  facts: [
    { icon: '💼', text: 'Building for the web since 2020' },
    { icon: '🎓', text: 'Software Engineering, MUST' },
    { icon: '🗣️', text: 'Speaks Mongolian and English' },
  ],
}
