import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/gmail'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await sendEmail({
      to: user.email!,
      subject: '✅ Gmail Integration Test',
      body: 'This is a test email from your marketing dashboard. Gmail integration is working correctly!',
      html: `<html><body>
        <p style="font-size:16px;">✅ <strong>Gmail integration is working correctly!</strong></p>
        <p>This test email was sent from your marketing dashboard.</p>
      </body></html>`,
    })
    return NextResponse.json({ success: true, sentTo: user.email })
  } catch (err) {
    console.error('Test email error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
