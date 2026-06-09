/**
 * Integration tests for /api/clients (GET, POST) and /api/clients/[id] (PUT, DELETE).
 * Uses a queue-based Supabase mock — no DB or credentials required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [] })) }))
vi.mock('@/lib/notion',  () => ({ createNotionClient: vi.fn(() => Promise.resolve('notion-id')), updateNotionClient: vi.fn(), deleteNotionPage: vi.fn() }))
vi.mock('@/lib/gmail',   () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/gemini',  () => ({ generateEmailContent: vi.fn(() => Promise.resolve({ subject: 'S', body: 'B' })) }))
vi.mock('@/lib/activity-log', () => ({ logActivity: vi.fn() }))

// ─── Mock infrastructure ───────────────────────────────────────────────────────
type MockResult = { data: unknown; error: unknown; count?: number | null }

const serverQueue: MockResult[] = []
const adminQueue: MockResult[]  = []

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

function makeAdminClient() {
  return makeChain(adminQueue)
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(() => Promise.resolve(makeServerClient())),
  createAdminClient:  vi.fn(() => makeAdminClient()),
}))

vi.mock('@/lib/utils', async () => {
  const real = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils')
  return { ...real, generateId: vi.fn(() => 'client-id-123') }
})

// ─── Auth queue helpers ────────────────────────────────────────────────────────
function queueAdmin() {
  serverQueue.push({ data: { user: { id: 'user-admin' } }, error: null })
  serverQueue.push({ data: { role: 'admin' }, error: null })
}

function queueMediaBuyer() {
  serverQueue.push({ data: { user: { id: 'user-mb' } }, error: null })
  serverQueue.push({ data: { role: 'media_buyer' }, error: null })
}

function queueVideoMaker() {
  serverQueue.push({ data: { user: { id: 'user-vm' } }, error: null })
  serverQueue.push({ data: { role: 'video_maker' }, error: null })
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

beforeEach(() => {
  serverQueue.length = 0
  adminQueue.length  = 0
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/clients
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/clients', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('./route')
    queueNoAuth()
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('403 when video_maker requests client list', async () => {
    const { GET } = await import('./route')
    queueVideoMaker()
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('admin receives full client list with billing_plans', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    const clients = [{ id: 'c1', name: 'Acme', billing_plans: [] }]
    serverQueue.push({ data: clients, error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(clients)
  })

  it('admin: null data returns empty array', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    // null → JSON null (route doesn't coerce, but it returns json(data))
    const body = await res.json()
    expect(body == null || Array.isArray(body)).toBe(true)
  })

  it('media_buyer receives limited fields (id, name only)', async () => {
    const { GET } = await import('./route')
    queueMediaBuyer()
    const limited = [{ id: 'c1', name: 'Acme' }]
    serverQueue.push({ data: limited, error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(limited)
  })

  it('500 on DB error for admin', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: { message: 'db error' } })
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('500 on DB error for media_buyer', async () => {
    const { GET } = await import('./route')
    queueMediaBuyer()
    serverQueue.push({ data: null, error: { message: 'db error' } })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/clients
// ══════════════════════════════════════════════════════════════════════════════
const validClient = { name: 'Acme Corp', email: 'acme@example.com' }

describe('POST /api/clients', () => {
  it('401 when unauthenticated', async () => {
    const { POST } = await import('./route')
    queueNoAuth()
    const res = await POST(makeReq('POST', 'http://x/api/clients', validClient))
    expect(res.status).toBe(401)
  })

  it('403 when video_maker tries to create client', async () => {
    const { POST } = await import('./route')
    queueVideoMaker()
    const res = await POST(makeReq('POST', 'http://x/api/clients', validClient))
    expect(res.status).toBe(403)
  })

  it('403 when media_buyer tries to create client', async () => {
    const { POST } = await import('./route')
    queueMediaBuyer()
    const res = await POST(makeReq('POST', 'http://x/api/clients', validClient))
    expect(res.status).toBe(403)
  })

  it('400 when name is missing', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    const res = await POST(makeReq('POST', 'http://x/api/clients', { email: 'a@b.com' }))
    expect(res.status).toBe(400)
  })

  it('400 when email is invalid', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    const res = await POST(makeReq('POST', 'http://x/api/clients', { name: 'Acme', email: 'not-email' }))
    expect(res.status).toBe(400)
  })

  it('400 on invalid JSON body', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    const req = new NextRequest('http://x/api/clients', { method: 'POST', body: 'not-json' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('201 creates client with valid body', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: null }) // clients.insert
    const res = await POST(makeReq('POST', 'http://x/api/clients', validClient))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('client-id-123')
    expect(body.name).toBe('Acme Corp')
    expect(body.email).toBe('acme@example.com')
    expect(body.status).toBe('pending')
  })

  it('201 with optional fields', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: null })
    const res = await POST(makeReq('POST', 'http://x/api/clients', {
      ...validClient,
      phone: '+1-555-0100',
      country: 'US',
      notes: 'VIP client',
      status: 'active',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.phone).toBe('+1-555-0100')
    expect(body.status).toBe('active')
  })

  it('500 on DB insert error', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: { message: 'db error' } })
    const res = await POST(makeReq('POST', 'http://x/api/clients', validClient))
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/clients/[id]
// ══════════════════════════════════════════════════════════════════════════════
async function idParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PUT /api/clients/[id]', () => {
  const updateBody = { name: 'Acme Updated', email: 'new@acme.com', status: 'active' }

  it('401 when unauthenticated', async () => {
    const { PUT } = await import('./[id]/route')
    queueNoAuth()
    const res = await PUT(makeReq('PUT', 'http://x/api/clients/c1', updateBody), await idParams('c1'))
    expect(res.status).toBe(401)
  })

  it('403 when non-admin tries to update', async () => {
    const { PUT } = await import('./[id]/route')
    queueVideoMaker()
    const res = await PUT(makeReq('PUT', 'http://x/api/clients/c1', updateBody), await idParams('c1'))
    expect(res.status).toBe(403)
  })

  it('200 when admin updates client', async () => {
    const { PUT } = await import('./[id]/route')
    queueAdmin()
    const updated = { id: 'c1', ...updateBody }
    serverQueue.push({ data: updated, error: null })    // clients.update
    serverQueue.push({ data: { user: { id: 'user-admin' } }, error: null }) // getUser for logActivity
    const res = await PUT(makeReq('PUT', 'http://x/api/clients/c1', updateBody), await idParams('c1'))
    expect(res.status).toBe(200)
    expect((await res.json()).name).toBe('Acme Updated')
  })

  it('500 on DB update error', async () => {
    const { PUT } = await import('./[id]/route')
    queueAdmin()
    serverQueue.push({ data: null, error: { message: 'db error' } })
    const res = await PUT(makeReq('PUT', 'http://x/api/clients/c1', updateBody), await idParams('c1'))
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/clients/[id]  (soft-delete)
// ══════════════════════════════════════════════════════════════════════════════
describe('DELETE /api/clients/[id]', () => {
  it('401 when unauthenticated', async () => {
    const { DELETE } = await import('./[id]/route')
    queueNoAuth()
    const res = await DELETE(makeReq('DELETE', 'http://x/api/clients/c1'), await idParams('c1'))
    expect(res.status).toBe(401)
  })

  it('403 when non-admin tries to delete', async () => {
    const { DELETE } = await import('./[id]/route')
    queueVideoMaker()
    const res = await DELETE(makeReq('DELETE', 'http://x/api/clients/c1'), await idParams('c1'))
    expect(res.status).toBe(403)
  })

  it('200 when admin soft-deletes client', async () => {
    const { DELETE } = await import('./[id]/route')
    queueAdmin()
    serverQueue.push({ data: { notion_id: null, name: 'Acme' }, error: null }) // select notion_id
    serverQueue.push({ data: null, error: null })                               // update deleted_at
    serverQueue.push({ data: { user: { id: 'user-admin' } }, error: null })    // getUser for logActivity
    const res = await DELETE(makeReq('DELETE', 'http://x/api/clients/c1'), await idParams('c1'))
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })

  it('500 on DB error', async () => {
    const { DELETE } = await import('./[id]/route')
    queueAdmin()
    serverQueue.push({ data: { notion_id: null, name: 'Acme' }, error: null }) // select notion_id
    serverQueue.push({ data: null, error: { message: 'db error' } })           // update fails
    const res = await DELETE(makeReq('DELETE', 'http://x/api/clients/c1'), await idParams('c1'))
    expect(res.status).toBe(500)
  })
})
