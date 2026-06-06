export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

const FB_APP_ID     = process.env.FB_APP_ID!
const FB_APP_SECRET = process.env.FB_APP_SECRET!
const APP_URL       = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const CALLBACK_URL  = `${APP_URL}/api/social/oauth/callback`
const GRAPH         = 'https://graph.facebook.com/v19.0'

interface FBPage {
  id:           string
  name:         string
  access_token: string
  instagram_business_account?: { id: string; username?: string }
}

export async function GET(req: NextRequest) {
  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const state  = url.searchParams.get('state')
  const fbErr  = url.searchParams.get('error')

  let returnTo = '/settings'
  const redirect = (err?: string, clientId?: string) => {
    const base = `${APP_URL}${returnTo}`
    if (err)      return NextResponse.redirect(`${base}?error=${encodeURIComponent(err)}`)
    if (clientId) return NextResponse.redirect(`${base}?success=1&client_id=${clientId}`)
    return NextResponse.redirect(base)
  }

  if (fbErr) return redirect(fbErr)
  if (!code || !state) return redirect('missing_params')

  let clientId: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    clientId = decoded.clientId
    returnTo = decoded.returnTo ?? '/settings'
    if (!clientId) throw new Error('no clientId')
  } catch {
    return redirect('invalid_state')
  }

  try {
    // 1 ── Short-lived user token
    const tokenRes  = await fetch(`${GRAPH}/oauth/access_token?client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&code=${code}`)
    const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } }
    if (tokenData.error) throw new Error(tokenData.error.message)
    const userToken = tokenData.access_token!

    // 2 ── Exchange for long-lived user token (60 days)
    const llRes  = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&fb_exchange_token=${userToken}`)
    const llData = await llRes.json() as { access_token?: string; expires_in?: number }
    const longToken = llData.access_token ?? userToken

    // 3 ── Get pages the user manages
    const pagesRes  = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${longToken}`)
    const pagesData = await pagesRes.json() as { data?: FBPage[]; error?: { message: string } }
    if (pagesData.error) throw new Error(pagesData.error.message)

    const pages = pagesData.data ?? []
    if (pages.length === 0) throw new Error('No Facebook Pages found. Make sure you selected pages during authorization.')

    const admin = createAdminClient()

    for (const page of pages) {
      // Facebook Page ─────────────────────────────────────────────────
      await admin.from('social_connections').upsert({
        client_id:        clientId,
        platform:         'facebook',
        page_id:          page.id,
        ig_user_id:       null,
        access_token:     page.access_token,
        token_expires_at: null,           // page tokens don't expire
        extra:            { page_name: page.name },
        is_active:        true,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'client_id,platform' })

      // Instagram (if page has a linked Business account) ─────────────
      if (page.instagram_business_account?.id) {
        await admin.from('social_connections').upsert({
          client_id:        clientId,
          platform:         'instagram',
          page_id:          page.id,
          ig_user_id:       page.instagram_business_account.id,
          access_token:     page.access_token,   // IG uses the FB page token
          token_expires_at: null,
          extra:            { page_name: page.name, ig_username: page.instagram_business_account.username },
          is_active:        true,
          updated_at:       new Date().toISOString(),
        }, { onConflict: 'client_id,platform' })
      }
    }

    return redirect(undefined, clientId)
  } catch (err) {
    return redirect(err instanceof Error ? err.message : 'Unknown error')
  }
}
