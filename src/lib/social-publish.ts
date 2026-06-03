// Social media publishing helpers — Meta (Instagram + Facebook) and TikTok

export type Platform = 'instagram' | 'facebook' | 'tiktok'

export interface PublishOptions {
  mediaUrl:    string         // public URL of image/video
  caption:     string
  mediaType:   'image' | 'video' | 'reel'
}

export interface PublishResult {
  success:    boolean
  postId?:    string
  error?:     string
}

// ─── Detect media type from URL ───────────────────────────────────────────────
export function detectMediaType(url: string): 'image' | 'video' {
  const lower = url.toLowerCase()
  if (lower.match(/\.(mp4|mov|avi|mkv|webm)(\?|$)/)) return 'video'
  return 'image'
}

// ─── Instagram ────────────────────────────────────────────────────────────────
export async function publishToInstagram(
  igUserId: string,
  accessToken: string,
  opts: PublishOptions,
): Promise<PublishResult> {
  const base = `https://graph.facebook.com/v19.0`

  // Step 1 — create container
  const containerParams: Record<string, string> = {
    caption:      opts.caption,
    access_token: accessToken,
  }

  if (opts.mediaType === 'reel' || opts.mediaType === 'video') {
    containerParams.media_type = 'REELS'
    containerParams.video_url  = opts.mediaUrl
  } else {
    containerParams.image_url = opts.mediaUrl
  }

  const containerRes = await fetch(
    `${base}/${igUserId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerParams),
    },
  )
  const container = await containerRes.json()
  if (!containerRes.ok || container.error) {
    return { success: false, error: container.error?.message ?? 'Container creation failed' }
  }

  const creationId: string = container.id

  // Step 2 — wait for video processing (videos/reels only)
  if (opts.mediaType !== 'image') {
    await waitForVideoProcessing(igUserId, creationId, accessToken)
  }

  // Step 3 — publish
  const publishRes = await fetch(`${base}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  })
  const published = await publishRes.json()
  if (!publishRes.ok || published.error) {
    return { success: false, error: published.error?.message ?? 'Publish failed' }
  }

  return { success: true, postId: published.id }
}

async function waitForVideoProcessing(
  igUserId: string,
  creationId: string,
  accessToken: string,
  maxWaitMs = 5 * 60 * 1000,
) {
  const start    = Date.now()
  const interval = 10_000
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, interval))
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${accessToken}`,
    )
    const data = await res.json()
    if (data.status_code === 'FINISHED') return
    if (data.status_code === 'ERROR') throw new Error('Instagram video processing error')
  }
  throw new Error('Instagram video processing timed out')
}

// ─── Facebook Page ────────────────────────────────────────────────────────────
export async function publishToFacebook(
  pageId: string,
  accessToken: string,
  opts: PublishOptions,
): Promise<PublishResult> {
  const base = `https://graph.facebook.com/v19.0`

  if (opts.mediaType === 'image') {
    const res = await fetch(`${base}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url:          opts.mediaUrl,
        caption:      opts.caption,
        access_token: accessToken,
      }),
    })
    const data = await res.json()
    if (!res.ok || data.error) return { success: false, error: data.error?.message ?? 'Photo post failed' }
    return { success: true, postId: data.id }
  }

  // Video / Reel
  const res = await fetch(`${base}/${pageId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_url:     opts.mediaUrl,
      description:  opts.caption,
      access_token: accessToken,
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) return { success: false, error: data.error?.message ?? 'Video post failed' }
  return { success: true, postId: data.id }
}

// ─── TikTok ───────────────────────────────────────────────────────────────────
export async function publishToTikTok(
  accessToken: string,
  opts: PublishOptions,
): Promise<PublishResult> {
  // TikTok Content Posting API v2
  if (opts.mediaType === 'image') {
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title:       opts.caption,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source:    'PULL_FROM_URL',
          photo_images: [opts.mediaUrl],
          photo_cover_index: 0,
        },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      }),
    })
    const data = await res.json()
    if (data.error?.code && data.error.code !== 'ok') {
      return { success: false, error: data.error.message ?? 'TikTok photo failed' }
    }
    return { success: true, postId: data.data?.publish_id }
  }

  // Video init
  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title:          opts.caption,
        privacy_level:  'PUBLIC_TO_EVERYONE',
        disable_duet:   false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source:    'PULL_FROM_URL',
        video_url: opts.mediaUrl,
      },
    }),
  })
  const initData = await initRes.json()
  if (initData.error?.code && initData.error.code !== 'ok') {
    return { success: false, error: initData.error.message ?? 'TikTok video init failed' }
  }
  return { success: true, postId: initData.data?.publish_id }
}
