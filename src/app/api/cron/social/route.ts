export const dynamic = 'force-dynamic'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import {
  publishToInstagram,
  publishToFacebook,
  publishToTikTok,
  detectMediaType,
  type PublishOptions,
} from '@/lib/social-publish'

// Vercel cron: runs every hour
// vercel.json: { "path": "/api/cron/social", "schedule": "0 * * * *" }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const isVercelCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isVercelCron) {
    const { createServerClient } = await import('@/lib/supabase-server')
    const sc = await createServerClient()
    const { data: { user } } = await sc.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await sc.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin' && profile?.role !== 'media_buyer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Fetch all pending posts that are due
  const { data: duePosts } = await supabase
    .from('scheduled_posts')
    .select('*, task:tasks(delivery_url)')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .lt('attempts', 3)

  if (!duePosts || duePosts.length === 0) {
    return NextResponse.json({ published: 0, message: 'No posts due' })
  }

  const results: { id: string; platform: string; status: string; error?: string }[] = []

  for (const post of duePosts) {
    // Mark as publishing to prevent double-execution
    await supabase
      .from('scheduled_posts')
      .update({ status: 'publishing', attempts: post.attempts + 1, updated_at: now })
      .eq('id', post.id)

    // Resolve media URL: prefer post.media_url, fallback to task.delivery_url
    const mediaUrl: string | null = post.media_url ?? (post.task as any)?.delivery_url ?? null
    if (!mediaUrl) {
      await supabase.from('scheduled_posts').update({
        status: 'failed', error: 'No media URL available', updated_at: now,
      }).eq('id', post.id)
      results.push({ id: post.id, platform: post.platform, status: 'failed', error: 'No media URL' })
      continue
    }

    // Fetch the social connection for this client + platform
    const { data: conn } = await supabase
      .from('social_connections')
      .select('access_token, page_id, ig_user_id')
      .eq('client_id', post.client_id)
      .eq('platform', post.platform)
      .eq('is_active', true)
      .single()

    if (!conn) {
      await supabase.from('scheduled_posts').update({
        status: 'failed', error: `No active ${post.platform} connection for this client`, updated_at: now,
      }).eq('id', post.id)
      results.push({ id: post.id, platform: post.platform, status: 'failed', error: 'No connection' })
      continue
    }

    const mediaType = post.content_type === 'reel' ? 'reel'
      : post.content_type === 'story' ? 'image'  // stories use image/video type
      : detectMediaType(mediaUrl)

    const opts: PublishOptions = {
      mediaUrl,
      caption:   post.caption ?? '',
      mediaType: mediaType as PublishOptions['mediaType'],
    }

    try {
      let result

      if (post.platform === 'instagram') {
        if (!conn.ig_user_id) throw new Error('Missing ig_user_id')
        result = await publishToInstagram(conn.ig_user_id, conn.access_token, opts)
      } else if (post.platform === 'facebook') {
        if (!conn.page_id) throw new Error('Missing page_id')
        result = await publishToFacebook(conn.page_id, conn.access_token, opts)
      } else if (post.platform === 'tiktok') {
        result = await publishToTikTok(conn.access_token, opts)
      } else {
        throw new Error(`Unknown platform: ${post.platform}`)
      }

      if (result.success) {
        await supabase.from('scheduled_posts').update({
          status:           'published',
          platform_post_id: result.postId ?? null,
          error:            null,
          updated_at:       now,
        }).eq('id', post.id)
        results.push({ id: post.id, platform: post.platform, status: 'published' })
      } else {
        const isLastAttempt = post.attempts + 1 >= 3
        await supabase.from('scheduled_posts').update({
          status:     isLastAttempt ? 'failed' : 'pending',
          error:      result.error ?? 'Publish failed',
          updated_at: now,
        }).eq('id', post.id)
        results.push({ id: post.id, platform: post.platform, status: 'failed', error: result.error })
      }
    } catch (err: any) {
      const isLastAttempt = post.attempts + 1 >= 3
      await supabase.from('scheduled_posts').update({
        status:     isLastAttempt ? 'failed' : 'pending',
        error:      err.message ?? 'Unknown error',
        updated_at: now,
      }).eq('id', post.id)
      results.push({ id: post.id, platform: post.platform, status: 'error', error: err.message })
    }
  }

  const published = results.filter(r => r.status === 'published').length
  const failed    = results.filter(r => r.status !== 'published').length
  return NextResponse.json({ published, failed, results })
}
