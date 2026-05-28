import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const ACCOUNT_ID  = process.env.R2_ACCOUNT_ID ?? ''
const ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID ?? ''
const SECRET_KEY  = process.env.R2_SECRET_ACCESS_KEY ?? ''
const BUCKET      = process.env.R2_BUCKET_NAME ?? ''
const PUBLIC_URL  = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')

export function isR2Configured(): boolean {
  return !!(ACCOUNT_ID && ACCESS_KEY && SECRET_KEY && BUCKET && PUBLIC_URL)
}

function getClient() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  })
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string
): Promise<{ uploadUrl: string; fileUrl: string }> {
  const client  = getClient()
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType })
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })
  return { uploadUrl, fileUrl: `${PUBLIC_URL}/${key}` }
}
