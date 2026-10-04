export type ContactCopy = {
  navLabel: string
  title: string
  emailLabel: string
  heading: string
  lead: string
  fields: { name: string; email: string; message: string }
  submit: string
  submitting: string
  success: string
  error: string
  validation: string
}

export const mn: ContactCopy = {
  navLabel: 'Холбоо барих',
  title: 'Ярилцъя',
  emailLabel: 'Эсвэл шууд бичээрэй',
  heading: 'Надтай холбогдоорой',
  lead: 'Ажлын санал, төсөл, эсвэл зүгээр л мэндчилгээ. Ихэвчлэн 1-2 өдөрт хариулдаг.',
  fields: { name: 'Нэр', email: 'И-мэйл', message: 'Захидал' },
  submit: 'Илгээх',
  submitting: 'Илгээж байна…',
  success: 'Баярлалаа! Удахгүй хариу бичнэ.',
  error: 'Илгээхэд алдаа гарлаа. Дахин оролдоно уу.',
  validation: 'Бүх талбарыг зөв бөглөнө үү.',
}

export const en: ContactCopy = {
  navLabel: 'Contact',
  title: "Let's talk",
  emailLabel: 'Or write directly',
  heading: 'Get in touch',
  lead: 'A role, a project, or just hello. I usually reply within a day or two.',
  fields: { name: 'Name', email: 'Email', message: 'Message' },
  submit: 'Send',
  submitting: 'Sending…',
  success: "Thanks! I'll get back to you soon.",
  error: 'Something went wrong. Please try again.',
  validation: 'Please complete every field correctly.',
}
