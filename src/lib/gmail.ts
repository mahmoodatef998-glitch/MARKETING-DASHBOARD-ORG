import { google } from 'googleapis'

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Agency'

function getGmailClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  )
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return google.gmail({ version: 'v1', auth: oauth2 })
}

function textSignature(): string {
  return `\n\n--\nMahmoud Atef\n${BRAND}`
}

function htmlSignature(): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;">
  <tr>
    <td>
      <p style="margin:0;font-size:13px;font-weight:700;color:#1e1b4b;">Mahmoud Atef</p>
      <p style="margin:3px 0 0;font-size:11px;font-weight:600;color:#7c3aed;letter-spacing:1.5px;text-transform:uppercase;">${BRAND}</p>
    </td>
  </tr>
</table>`
}

function buildRawEmail(opts: {
  to: string
  subject: string
  body: string
  html?: string
  from?: string
}): string {
  const from     = opts.from ?? process.env.GMAIL_SENDER_EMAIL ?? 'noreply@agencyos.app'
  const bodyText = opts.body + textSignature()

  if (opts.html) {
    const htmlWithSig = opts.html.replace('</body>', `${htmlSignature()}</body>`)
    const boundary    = 'boundary_pixelmkt_' + Date.now()
    const raw = [
      `From: ${BRAND} <${from}>`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      bodyText,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlWithSig,
      '',
      `--${boundary}--`,
    ].join('\n')
    return Buffer.from(raw).toString('base64url')
  }

  const raw = [
    `From: ${BRAND} <${from}>`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    bodyText,
  ].join('\n')

  return Buffer.from(raw).toString('base64url')
}

export async function sendEmail(opts: {
  to: string
  subject: string
  body: string
  html?: string
}): Promise<void> {
  const gmail = getGmailClient()
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: buildRawEmail(opts) },
  })
}
