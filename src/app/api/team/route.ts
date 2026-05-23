export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { createNotionTeamMember } from '@/lib/notion'
import { generateId } from '@/lib/utils'
import { DEMO_TEAM } from '@/lib/demo-data'
import type { TeamMember } from '@/types'

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export async function GET() {
  if (DEMO) return NextResponse.json(DEMO_TEAM)
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('team_members').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (DEMO) {
    const body = await req.json()
    return NextResponse.json({ id: generateId(), ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { status: 201 })
  }
  const supabase = await createServerClient()
  const body = await req.json()
  const member: TeamMember = {
    id: generateId(), name: body.name, email: body.email,
    role: body.role ?? 'developer', status: body.status ?? 'active',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('team_members').insert(member)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { const notionId = await createNotionTeamMember(member); await supabase.from('team_members').update({ notion_id: notionId }).eq('id', member.id) } catch {}
  return NextResponse.json(member, { status: 201 })
}
