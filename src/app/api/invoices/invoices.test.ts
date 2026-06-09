/**
 * Integration tests for /api/invoices (GET, POST) and /api/invoices/[id] (PATCH, DELETE).
 * Uses a queue-based Supabase mock — no DB or credentials required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [] })) }))
vi.mock('@/lib/notion', () => ({ createNotionInvoice: vi.fn(() => Promise.resolve('notion-id')), deleteNotionPage: vi.fn() }))
vi.mock('@/lib/activity-log', () => ({ logActivity: vi.fn() }))

// ─── Mock infrastructure ───────────────────────────────────────────────────────
type MockResult = { data: unknown; error: unknown; count?: number | null }

const serverQueue: MockResult[] = []

function dequeue(q: MockResult[]): MockResult {
  return q.shift() ?? { data: null, error: { message: 'no mock result queued', code: 'MOCK' } }
}

function makeChain(queue: MockResult[]) {
  const chain: Record<string, unknown> = {}
  const terminal = () => Promise.resolve(dequeue(queue))
  const self = () => chain
  chain.from        = self
  chain.select      = self
  chain.insert      = self
  chain.update      = self
  chain.delete      = self
  chain.upsert      = self
  chain.eq          = self
  chain.neq         = self
  chain.is          = self
  chain.in          = self
  chain.gte         = self
  chain.lte         = self
  chain.order       = self
  chain.limit       = self
  chain.maybeSingle = terminal
  chain.single      = terminal
  chain.then        = (resolve: (v: MockResult) => unknown) => terminal().then(resolve)
  return chain
}

function makeServerClient() {
  return {
    auth: { getUser: vi.fn(() => Promise.resolve(dequeue(serverQueue))) },
    from: () => makeChain(serverQueue),
  }
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(() => Promise.resolve(makeServerClient())),
  createAdminClient:  vi.fn(() => makeChain(serverQueue)),
}))

vi.mock('@/lib/utils', async () => {
  const real = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils')
  return { ...real, generateId: vi.fn(() => 'invoice-id-123'), generateInvoiceNumber: vi.fn(() => 'INV-2026-0001') }
})

// ─── Auth queue helpers ────────────────────────────────────────────────────────
function queueAdmin() {
  serverQueue.push({ data: { user: { id: 'user-admin' } }, error: null })
  serverQueue.push({ data: { role: 'admin', client_id: null }, error: null })
}

function queueVideoMaker() {
  serverQueue.push({ data: { user: { id: 'user-vm' } }, error: null })
  serverQueue.push({ data: { role: 'video_maker' }, error: null })
}

function queueClient(clientId = 'client-1') {
  serverQueue.push({ data: { user: { id: 'user-c' } }, error: null })
  serverQueue.push({ data: { role: 'client', client_id: clientId }, error: null })
}

function queueClientNoId() {
  serverQueue.push({ data: { user: { id: 'user-c' } }, error: null })
  serverQueue.push({ data: { role: 'client', client_id: null }, error: null })
}

function queueNoAuth() {
  serverQueue.push({ data: { user: null }, error: null })
}

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  })
}

const TEST_CLIENT_ID = '12345678-1234-4234-8234-123456789012'
const validItem = { description: 'Design work', quantity: 2, unit_price: 500 }

beforeEach(() => {
  serverQueue.length = 0
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/invoices
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/invoices', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('./route')
    queueNoAuth()
    const res = await GET(makeReq('GET', 'http://x/api/invoices'))
    expect(res.status).toBe(401)
  })

  it('admin receives all non-deleted invoices', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    const invoices = [{ id: 'inv1', deleted_at: null, client: { id: 'c1' } }]
    serverQueue.push({ data: invoices, error: null })
    const res = await GET(makeReq('GET', 'http://x/api/invoices'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(invoices)
  })

  it('video_maker receives all invoices (no role restriction on GET)', async () => {
    const { GET } = await import('./route')
    queueVideoMaker()
    const invoices = [{ id: 'inv2' }]
    serverQueue.push({ data: invoices, error: null })
    const res = await GET(makeReq('GET', 'http://x/api/invoices'))
    expect(res.status).toBe(200)
  })

  it('client with client_id sees only their invoices', async () => {
    const { GET } = await import('./route')
    queueClient('client-1')
    const invoices = [{ id: 'inv3', client_id: 'client-1' }]
    serverQueue.push({ data: invoices, error: null })
    const res = await GET(makeReq('GET', 'http://x/api/invoices'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(invoices)
  })

  it('client without client_id receives empty array', async () => {
    const { GET } = await import('./route')
    queueClientNoId()
    const res = await GET(makeReq('GET', 'http://x/api/invoices'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('500 on DB error', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: { message: 'db error' } })
    const res = await GET(makeReq('GET', 'http://x/api/invoices'))
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/invoices
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/invoices', () => {
  it('401 when unauthenticated', async () => {
    const { POST } = await import('./route')
    queueNoAuth()
    const res = await POST(makeReq('POST', 'http://x/api/invoices', { client_id: TEST_CLIENT_ID, items: [validItem] }))
    expect(res.status).toBe(401)
  })

  it('403 when video_maker tries to create invoice', async () => {
    const { POST } = await import('./route')
    queueVideoMaker()
    const res = await POST(makeReq('POST', 'http://x/api/invoices', { client_id: TEST_CLIENT_ID, items: [validItem] }))
    expect(res.status).toBe(403)
  })

  it('400 when items array is empty', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    const res = await POST(makeReq('POST', 'http://x/api/invoices', { client_id: 'c1', items: [] }))
    expect(res.status).toBe(400)
  })

  it('400 when client_id is missing', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    const res = await POST(makeReq('POST', 'http://x/api/invoices', { items: [validItem] }))
    expect(res.status).toBe(400)
  })

  it('400 on invalid JSON body', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    const req = new NextRequest('http://x/api/invoices', { method: 'POST', body: '{bad}' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('400 when unit_price is negative', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    const res = await POST(makeReq('POST', 'http://x/api/invoices', {
      client_id: 'c1',
      items: [{ ...validItem, unit_price: -50 }],
    }))
    expect(res.status).toBe(400)
  })

  it('201 creates invoice and calculates totals correctly', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: null }) // invoices.insert
    const res = await POST(makeReq('POST', 'http://x/api/invoices', {
      client_id: TEST_CLIENT_ID,
      items: [{ description: 'Design', quantity: 2, unit_price: 500 }],
      tax: 10,
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('invoice-id-123')
    expect(body.invoice_number).toBe('INV-2026-0001')
    expect(body.subtotal).toBe(1000)      // 2 × 500
    expect(body.total).toBe(1100)         // 1000 + 10% tax
    expect(body.status).toBe('draft')
  })

  it('201 creates invoice with zero tax', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: null })
    const res = await POST(makeReq('POST', 'http://x/api/invoices', {
      client_id: TEST_CLIENT_ID,
      items: [{ description: 'Work', quantity: 1, unit_price: 1000 }],
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.subtotal).toBe(1000)
    expect(body.total).toBe(1000) // no tax
  })

  it('201 uses provided invoice_number when given', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: null })
    const res = await POST(makeReq('POST', 'http://x/api/invoices', {
      client_id: TEST_CLIENT_ID,
      items: [validItem],
      invoice_number: 'CUSTOM-001',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.invoice_number).toBe('CUSTOM-001')
  })

  it('500 on DB insert error', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: { message: 'constraint violation' } })
    const res = await POST(makeReq('POST', 'http://x/api/invoices', { client_id: TEST_CLIENT_ID, items: [validItem] }))
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/invoices/[id]  (status update)
// ══════════════════════════════════════════════════════════════════════════════
async function idParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/invoices/[id]', () => {
  it('401 when unauthenticated', async () => {
    const { PATCH } = await import('./[id]/route')
    queueNoAuth()
    const res = await PATCH(makeReq('PATCH', 'http://x/api/invoices/inv1', { status: 'paid' }), await idParams('inv1'))
    expect(res.status).toBe(401)
  })

  it('403 when non-admin tries to update invoice status', async () => {
    const { PATCH } = await import('./[id]/route')
    queueVideoMaker()
    const res = await PATCH(makeReq('PATCH', 'http://x/api/invoices/inv1', { status: 'paid' }), await idParams('inv1'))
    expect(res.status).toBe(403)
  })

  it('200 when admin marks invoice as paid', async () => {
    const { PATCH } = await import('./[id]/route')
    queueAdmin()
    // invoice fetch (with client + billing_plans)
    serverQueue.push({ data: { id: 'inv1', status: 'sent', client: null }, error: null })
    // invoice update
    serverQueue.push({ data: { id: 'inv1', status: 'paid' }, error: null })
    const res = await PATCH(makeReq('PATCH', 'http://x/api/invoices/inv1', { action: 'mark_paid' }), await idParams('inv1'))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('paid')
  })

  it('200 when admin marks invoice as overdue', async () => {
    const { PATCH } = await import('./[id]/route')
    queueAdmin()
    serverQueue.push({ data: { id: 'inv1', status: 'overdue' }, error: null })
    const res = await PATCH(makeReq('PATCH', 'http://x/api/invoices/inv1', { action: 'mark_overdue' }), await idParams('inv1'))
    expect(res.status).toBe(200)
  })

  it('400 on unknown action', async () => {
    const { PATCH } = await import('./[id]/route')
    queueAdmin()
    const res = await PATCH(makeReq('PATCH', 'http://x/api/invoices/inv1', { action: 'unknown' }), await idParams('inv1'))
    expect(res.status).toBe(400)
  })

  it('500 on DB update error', async () => {
    const { PATCH } = await import('./[id]/route')
    queueAdmin()
    serverQueue.push({ data: { id: 'inv1', status: 'sent', client: null }, error: null }) // invoice fetch
    serverQueue.push({ data: null, error: { message: 'db error' } })                      // update fails
    const res = await PATCH(makeReq('PATCH', 'http://x/api/invoices/inv1', { action: 'mark_paid' }), await idParams('inv1'))
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/invoices/[id]  (soft-delete)
// ══════════════════════════════════════════════════════════════════════════════
describe('DELETE /api/invoices/[id]', () => {
  it('401 when unauthenticated', async () => {
    const { DELETE } = await import('./[id]/route')
    queueNoAuth()
    const res = await DELETE(makeReq('DELETE', 'http://x/api/invoices/inv1'), await idParams('inv1'))
    expect(res.status).toBe(401)
  })

  it('403 when non-admin tries to delete', async () => {
    const { DELETE } = await import('./[id]/route')
    queueVideoMaker()
    const res = await DELETE(makeReq('DELETE', 'http://x/api/invoices/inv1'), await idParams('inv1'))
    expect(res.status).toBe(403)
  })

  it('200 when admin soft-deletes invoice', async () => {
    const { DELETE } = await import('./[id]/route')
    queueAdmin()
    serverQueue.push({ data: { notion_id: null }, error: null }) // select notion_id
    serverQueue.push({ data: null, error: null })                // update deleted_at
    const res = await DELETE(makeReq('DELETE', 'http://x/api/invoices/inv1'), await idParams('inv1'))
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })

  it('500 on DB error', async () => {
    const { DELETE } = await import('./[id]/route')
    queueAdmin()
    serverQueue.push({ data: { notion_id: null }, error: null }) // select notion_id
    serverQueue.push({ data: null, error: { message: 'db error' } }) // update fails
    const res = await DELETE(makeReq('DELETE', 'http://x/api/invoices/inv1'), await idParams('inv1'))
    expect(res.status).toBe(500)
  })
})
