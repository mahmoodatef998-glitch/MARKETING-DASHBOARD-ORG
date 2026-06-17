export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Forward to auto-generate
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`
  const res = await fetch(`${baseUrl}/api/invoices/auto-generate`, {
    method: 'POST',
    headers: { Cookie: req.headers.get('cookie') ?? '' },
  })
  const data = await res.json()
  console.log('[CRON] Auto-generated invoices:', data)
  return NextResponse.json(data)
}
