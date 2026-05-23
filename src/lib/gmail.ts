import { google } from 'googleapis'

function getGmailClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  )
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return google.gmail({ version: 'v1', auth: oauth2 })
}

function buildRawEmail(opts: {
  to: string
  subject: string
  body: string
  from?: string
}): string {
  const from = opts.from ?? process.env.GMAIL_SENDER_EMAIL ?? 'noreply@agencyos.app'
  const raw = [
    `From: Agency OS <${from}>`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    opts.body,
  ].join('\n')

  return Buffer.from(raw).toString('base64url')
}

export async function sendEmail(opts: {
  to: string
  subject: string
  body: string
}): Promise<void> {
  const gmail = getGmailClient()
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: buildRawEmail(opts) },
  })
}
