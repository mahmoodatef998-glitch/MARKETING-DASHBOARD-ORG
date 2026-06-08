import webpush from 'web-push'

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_SUBJECT ?? 'admin@agency.com'}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export interface PushPayload {
  title:  string
  body:   string
  url?:   string
  icon?:  string
}

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function sendPushNotification(sub: PushSubscription, payload: PushPayload) {
  await webpush.sendNotification(sub, JSON.stringify(payload))
}
