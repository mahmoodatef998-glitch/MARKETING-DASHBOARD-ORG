export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { createNotionClient } from '@/lib/notion'
import { generateId } from '@/lib/utils'
import { DEMO_CLIENTS } from '@/lib/demo-data'
import type { Client } from '@/types'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export async function GET() {
  if (DEMO) return NextResponse.json(DEMO_CLIENTS)
  const supabase = createServerClient()
  const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (DEMO) {
    const body = await req.json()
    return NextResponse.json({ id: generateId(), ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201 })
  }
  const supabase = createServerClient()
  const body = await req.json()
  const client: Client = {
    id: generateId(), name: body.name, email: body.email, phone: body.phone ?? null,
    status: body.status ?? 'pending', country: body.country ?? null, notes: body.notes ?? null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('clients').insert(client)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { const notionId = await createNotionClient(client); await supabase.from('clients').update({ notion_id: notionId }).eq('id', client.id) } catch {}
  return NextResponse.json(client, { status: 201 })
}
