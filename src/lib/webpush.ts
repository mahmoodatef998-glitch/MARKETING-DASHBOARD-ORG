import webpush from 'web-push'

export interface PushPayload {
  title: string
  body:  string
  url?:  string
  icon?: string
}

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function sendPushNotification(sub: PushSubscription, payload: PushPayload) {
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return // VAPID not configured, skip silently

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_SUBJECT ?? 'admin@agency.com'}`,
    pub,
    priv,
  )
  await webpush.sendNotification(sub, JSON.stringify(payload))
}
