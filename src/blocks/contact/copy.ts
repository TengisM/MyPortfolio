export type ContactCopy = {
  navLabel: string
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
  emailLabel: 'Шууд и-мэйл бичих бол:',
  heading: 'Холбоо барих',
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
  emailLabel: 'To email me directly:',
  heading: 'Contact',
  lead: 'A role, a project, or just hello. I usually reply within a day or two.',
  fields: { name: 'Name', email: 'Email', message: 'Message' },
  submit: 'Send message',
  submitting: 'Sending…',
  success: "Thanks! I'll get back to you soon.",
  error: 'Something went wrong. Please try again.',
  validation: 'Please complete every field correctly.',
}
