export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { generateCaption } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'media_buyer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.taskTitle) {
    return NextResponse.json({ error: 'taskTitle required' }, { status: 400 })
  }

  try {
    const caption = await generateCaption({
      taskTitle:   body.taskTitle,
      taskType:    body.taskType,
      description: body.description,
      clientName:  body.clientName,
    })
    return NextResponse.json({ caption })
  } catch (err) {
    console.error('[generate-caption]', err)
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  }
}
