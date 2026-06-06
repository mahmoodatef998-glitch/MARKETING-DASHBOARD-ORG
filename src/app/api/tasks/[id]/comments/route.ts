export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { rateLimit } from '@/lib/rate-limit'
import { parseBody, CommentCreateSchema } from '@/lib/validation'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('task_comments')
    .select('*, author:profiles(display_name)')
    .eq('task_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const comments = (data ?? []).map((c: { author?: { display_name?: string } | null } & Record<string, unknown>) => ({
    ...c,
    author_name: c.author?.display_name ?? null,
  }))

  return NextResponse.json(comments)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimit(req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown', { limit: 30, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const raw = await req.json().catch(() => null)
  if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  const parsed = parseBody(CommentCreateSchema, raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 422 })
  const { content } = parsed.data

  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: id, user_id: user.id, content: content })
    .select('*, author:profiles(display_name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const commentData = data as { author?: { display_name?: string } | null } & Record<string, unknown>
  return NextResponse.json(
    { ...commentData, author_name: commentData.author?.display_name ?? null },
    { status: 201 }
  )
}
