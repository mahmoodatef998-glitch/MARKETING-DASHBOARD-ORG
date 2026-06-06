export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const FB_APP_ID    = process.env.FB_APP_ID!
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const CALLBACK_URL = `${APP_URL}/api/social/oauth/callback`

const SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
].join(',')

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = new URL(req.url).searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  if (!FB_APP_ID) {
    return NextResponse.redirect(`${APP_URL}/settings?error=${encodeURIComponent('FB_APP_ID not configured')}`)
  }

  const returnTo = new URL(req.url).searchParams.get('returnTo') ?? '/settings'
  const state = Buffer.from(JSON.stringify({ clientId, userId: user.id, returnTo })).toString('base64url')

  const oauthUrl = new URL('https://www.facebook.com/dialog/oauth')
  oauthUrl.searchParams.set('client_id',     FB_APP_ID)
  oauthUrl.searchParams.set('redirect_uri',  CALLBACK_URL)
  oauthUrl.searchParams.set('scope',         SCOPES)
  oauthUrl.searchParams.set('state',         state)
  oauthUrl.searchParams.set('response_type', 'code')

  return NextResponse.redirect(oauthUrl.toString())
}
