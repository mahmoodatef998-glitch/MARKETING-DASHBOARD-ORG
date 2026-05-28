export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createNotionClient } from '@/lib/notion'
import { generateId } from '@/lib/utils'
import { DEMO_CLIENTS } from '@/lib/demo-data'
import { rateLimit } from '@/lib/rate-limit'
import { parseBody, ClientCreateSchema } from '@/lib/validation'
import type { Client } from '@/types'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 120, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  if (DEMO) return NextResponse.json(DEMO_CLIENTS)

  const supabase = await createServerClient()
  const { searchParams } = new URL(req.url)

  const page  = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50')))
  const from  = (page - 1) * limit
  const to    = from + limit - 1

  // If page=all is passed, return everything (for selects/dropdowns)
  if (searchParams.get('page') === 'all') {
    const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const { data, error, count } = await supabase
    .from('clients')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  })
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(getIp(req), { limit: 20, window: 60_000 })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  if (DEMO) {
    const body = await req.json()
    return NextResponse.json({ id: generateId(), ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201 })
  }

  const supabase = await createServerClient()
  const raw = await req.json().catch(() => null)
  if (!raw) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = parseBody(ClientCreateSchema, raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 422 })

  const body = parsed.data
  const client: Client = {
    id: generateId(), name: body.name, email: body.email,
    ...(body.phone   ? { phone:   body.phone   } : {}),
    ...(body.country ? { country: body.country } : {}),
    ...(body.notes   ? { notes:   body.notes   } : {}),
    status: body.status ?? 'pending',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('clients').insert(client)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    const notionId = await createNotionClient(client)
    await supabase.from('clients').update({ notion_id: notionId }).eq('id', client.id)
  } catch {}

  return NextResponse.json(client, { status: 201 })
}
