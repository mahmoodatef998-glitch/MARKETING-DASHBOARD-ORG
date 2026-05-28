const INSTANCE = process.env.ULTRAMSG_INSTANCE ?? ''
const TOKEN    = process.env.ULTRAMSG_TOKEN ?? ''

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '')
}

export async function sendWhatsApp(phone: string, message: string): Promise<void> {
  if (!INSTANCE || !TOKEN) throw new Error('ULTRAMSG_INSTANCE and ULTRAMSG_TOKEN are not configured')
  const to = normalizePhone(phone)
  if (!to) throw new Error('Invalid phone number')

  const res = await fetch(`https://api.ultramsg.com/${INSTANCE}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: TOKEN, to, body: message }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`WhatsApp API error ${res.status}: ${text}`)
  }
}
