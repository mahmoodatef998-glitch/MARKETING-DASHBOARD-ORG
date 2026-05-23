export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single()

  if (!data) return NextResponse.json({ error: 'No admin found' }, { status: 404 })
  return NextResponse.json({ id: data.id })
}
