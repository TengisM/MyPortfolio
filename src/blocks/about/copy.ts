export type AboutCopy = {
  navLabel: string
  heading: string
  paragraphs: string[]
}

export const mn: AboutCopy = {
  navLabel: 'Миний тухай',
  heading: 'Миний тухай',
  paragraphs: [
    'Миний нэр монголоор "далай" гэсэн утгатай. Далайд гарцгүй орны хүнд бол нэлээд сонирхолтой нэр.',
    'Би 5 гаруй жил вэб хөгжүүлж байна. Тэтгэлэг, UbCab, UbEats зэрэг өндөр ачаалалтай платформ, StableLab-ийн DAO аналитик дээр ажилласан бөгөөд одоо Танасофт дээр банкны back-office систем хөгжүүлж байна.',
    'Нарийн төвөгтэй шаардлагыг энгийн, найдвартай интерфейс болгох дуртай. Ихэвчлэн React, Next.js, TypeScript-ээр ажилладаг ч backend талд Node.js, Go, Elixir, PostgreSQL ашиглан функцийг эхнээс нь дуустал хүргэдэг. ШУТИС-ийг программ хангамжийн инженерээр төгссөн.',
  ],
}

export const en: AboutCopy = {
  navLabel: 'About',
  heading: 'About',
  paragraphs: [
    'My name means "sea" in Mongolian, which is a funny thing to be called in a country without a coastline.',
    "I've been building for the web for five years. I worked on high-traffic platforms like Tetgeleg, UbCab and UbEats, on DAO analytics at StableLab, and now on a core banking back office at Tanasoft.",
    'I like turning complicated requirements into simple, dependable interfaces. Most of my work is React, Next.js and TypeScript, and on the backend I use Node.js, Go, Elixir and PostgreSQL to ship features end to end. I studied software engineering at MUST in Ulaanbaatar.',
  ],
}
