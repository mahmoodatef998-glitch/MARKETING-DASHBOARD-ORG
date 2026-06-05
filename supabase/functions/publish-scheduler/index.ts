// Supabase Edge Function — runs every minute via pg_cron
// Picks up pending scheduled_posts whose scheduled_at has passed and publishes them.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface ScheduledPost {
  id:          string
  task_id:     string
  client_id:   string | null
  platform:    string
  caption:     string | null
  attempts:    number
  task:        { delivery_url: string | null; title: string }
}

interface SocialConnection {
  client_id:    string | null
  platform:     string
  page_id:      string | null
  ig_user_id:   string | null
  access_token: string
}

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const now = new Date().toISOString()

  // Fetch due pending posts (max 20 per run)
  const { data: posts, error: fetchErr } = await admin
    .from('scheduled_posts')
    .select('id, task_id, client_id, platform, caption, attempts, task:tasks(delivery_url, title)')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .lt('attempts', 3)
    .order('scheduled_at', { ascending: true })
    .limit(20)

  if (fetchErr) {
    console.error('[scheduler] fetch error', fetchErr.message)
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
  }

  if (!posts || posts.length === 0) {
    return new Response(JSON.stringify({ published: 0 }), { status: 200 })
  }

  // Load ALL active connections — keyed by "client_id:platform"
  const { data: connections } = await admin
    .from('social_connections')
    .select('client_id, platform, page_id, ig_user_id, access_token')
    .eq('is_active', true)

  const connMap: Record<string, SocialConnection> = {}
  for (const c of connections ?? []) {
    connMap[`${c.client_id ?? '_'}:${c.platform}`] = c
  }

  function getConn(clientId: string | null, platform: string): SocialConnection | undefined {
    // Try client-specific first, fall back to global (null client_id)
    return connMap[`${clientId ?? '_'}:${platform}`] ?? connMap[`_:${platform}`]
  }

  let published = 0

  for (const post of posts as ScheduledPost[]) {
    const mediaUrl = post.task?.delivery_url
    if (!mediaUrl) {
      await admin.from('scheduled_posts').update({
        status:   'failed',
        error:    'No delivery_url on task',
        attempts: post.attempts + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', post.id)
      continue
    }

    const conn = getConn(post.client_id, post.platform)
    if (!conn) {
      await admin.from('scheduled_posts').update({
        status:   'failed',
        error:    `No active connection for client + platform: ${post.platform}`,
        attempts: post.attempts + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', post.id)
      continue
    }

    // Mark as publishing (optimistic lock)
    await admin.from('scheduled_posts').update({
      status:   'publishing',
      attempts: post.attempts + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', post.id).eq('status', 'pending')

    const caption   = post.caption ?? post.task?.title ?? ''
    const isVideo   = /\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl)
    const mediaType = isVideo ? 'reel' : 'image'

    let result: { success: boolean; postId?: string; error?: string } = { success: false }

    try {
      if (post.platform === 'instagram' && conn.ig_user_id) {
        result = await publishIG(conn.ig_user_id, conn.access_token, mediaUrl, caption, mediaType)
      } else if (post.platform === 'facebook' && conn.page_id) {
        result = await publishFB(conn.page_id, conn.access_token, mediaUrl, caption, isVideo)
      } else if (post.platform === 'tiktok') {
        result = await publishTT(conn.access_token, mediaUrl, caption, isVideo)
      }
    } catch (e: unknown) {
      result = { success: false, error: e instanceof Error ? e.message : String(e) }
    }

    if (result.success) {
      await admin.from('scheduled_posts').update({
        status:           'published',
        platform_post_id: result.postId ?? null,
        error:            null,
        updated_at:       new Date().toISOString(),
      }).eq('id', post.id)

      // Mark task as published — fetch current platforms first to avoid overwrite
      const { data: currentTask } = await admin
        .from('tasks').select('publish_platforms').eq('id', post.task_id).single()
      const existing = currentTask?.publish_platforms ?? []
      const merged   = existing.includes(post.platform) ? existing : [...existing, post.platform]
      await admin.from('tasks').update({
        published_at:      new Date().toISOString(),
        publish_platforms: merged,
      }).eq('id', post.task_id)

      published++
    } else {
      const failed = post.attempts + 1 >= 3
      await admin.from('scheduled_posts').update({
        status:     failed ? 'failed' : 'pending',
        error:      result.error ?? 'Unknown error',
        updated_at: new Date().toISOString(),
      }).eq('id', post.id)
    }
  }

  return new Response(JSON.stringify({ published }), { status: 200 })
})

// ── Inline publish helpers (avoid cross-module import issues in Edge) ─────────

async function publishIG(
  igUserId: string, token: string,
  mediaUrl: string, caption: string, mediaType: string,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const base = 'https://graph.facebook.com/v19.0'
  const body: Record<string, string> = { caption, access_token: token }

  if (mediaType === 'reel') {
    body.media_type = 'REELS'
    body.video_url  = mediaUrl
  } else {
    body.image_url = mediaUrl
  }

  const cRes  = await fetch(`${base}/${igUserId}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const cData = await cRes.json()
  if (cData.error) return { success: false, error: cData.error.message }

  if (mediaType === 'reel') {
    // poll for processing
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 10_000))
      const s = await (await fetch(`${base}/${cData.id}?fields=status_code&access_token=${token}`)).json()
      if (s.status_code === 'FINISHED') break
      if (s.status_code === 'ERROR') return { success: false, error: 'IG video processing error' }
    }
  }

  const pRes  = await fetch(`${base}/${igUserId}/media_publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creation_id: cData.id, access_token: token }) })
  const pData = await pRes.json()
  if (pData.error) return { success: false, error: pData.error.message }
  return { success: true, postId: pData.id }
}

async function publishFB(
  pageId: string, token: string,
  mediaUrl: string, caption: string, isVideo: boolean,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const base     = 'https://graph.facebook.com/v19.0'
  const endpoint = isVideo ? `${base}/${pageId}/videos` : `${base}/${pageId}/photos`
  const body     = isVideo
    ? { file_url: mediaUrl, description: caption, access_token: token }
    : { url: mediaUrl,      caption,              access_token: token }

  const res  = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (data.error) return { success: false, error: data.error.message }
  return { success: true, postId: data.id }
}

async function publishTT(
  token: string, mediaUrl: string, caption: string, isVideo: boolean,
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const endpoint = isVideo
    ? 'https://open.tiktokapis.com/v2/post/publish/video/init/'
    : 'https://open.tiktokapis.com/v2/post/publish/content/init/'

  const body = isVideo
    ? { post_info: { title: caption, privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false }, source_info: { source: 'PULL_FROM_URL', video_url: mediaUrl }, post_mode: 'DIRECT_POST', media_type: 'VIDEO' }
    : { post_info: { title: caption, privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false }, source_info: { source: 'PULL_FROM_URL', photo_images: [mediaUrl], photo_cover_index: 0 }, post_mode: 'DIRECT_POST', media_type: 'PHOTO' }

  const res  = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (data.error?.code && data.error.code !== 'ok') return { success: false, error: data.error.message }
  return { success: true, postId: data.data?.publish_id }
}
