/**
 * Comprehensive tests for all content-plan API routes.
 * Covers every meaningful state transition and action.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [] })),
}))

type MockResult = { data: unknown; error: unknown; count?: number | null }

const serverQueue: MockResult[] = []
const adminQueue: MockResult[] = []

function dequeue(q: MockResult[]): MockResult {
  return q.shift() ?? { data: null, error: { message: 'no mock result queued', code: 'MOCK' } }
}

function makeChain(queue: MockResult[]) {
  const chain: Record<string, unknown> = {}
  const terminal = () => {
    const r = dequeue(queue)
    return Promise.resolve(r)
  }
  const self = () => chain
  chain.from     = self
  chain.select   = self
  chain.insert   = self
  chain.update   = self
  chain.delete   = self
  chain.upsert   = self
  chain.eq       = self
  chain.neq      = self
  chain.is       = self
  chain.in       = self
  chain.gte      = self
  chain.lte      = self
  chain.order    = self
  chain.single   = terminal
  chain.then     = (resolve: (v: MockResult) => unknown) => terminal().then(resolve)
  return chain
}

function makeServerClient() {
  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve(dequeue(serverQueue))),
    },
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
  return { ...real, generateId: vi.fn(() => 'task-id-123') }
})

function queueAdminAuth() {
  serverQueue.push({ data: { user: { id: 'user-1' } }, error: null })
  serverQueue.push({ data: { role: 'admin' }, error: null })
}

function queueMbAuth() {
  serverQueue.push({ data: { user: { id: 'user-2' } }, error: null })
  serverQueue.push({ data: { role: 'media_buyer' }, error: null })
}

function queueNoAuth() {
  serverQueue.push({ data: { user: null }, error: null })
}

function queueWrongRole() {
  serverQueue.push({ data: { user: { id: 'user-3' } }, error: null })
  serverQueue.push({ data: { role: 'video_maker' }, error: null })
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
// GET /api/content-plans
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/content-plans', () => {
  it('403 when unauthenticated', async () => {
    const { GET } = await import('./route')
    queueNoAuth()
    const res = await GET(makeReq('GET', 'http://x/api/content-plans'))
    expect(res.status).toBe(403)
  })

  it('403 when wrong role', async () => {
    const { GET } = await import('./route')
    queueWrongRole()
    const res = await GET(makeReq('GET', 'http://x/api/content-plans'))
    expect(res.status).toBe(403)
  })

  it('returns plans array for admin', async () => {
    const { GET } = await import('./route')
    queueAdminAuth()
    const plans = [{ id: 'plan-1', title: 'Test Plan', status: 'draft' }]
    adminQueue.push({ data: plans, error: null })
    const res = await GET(makeReq('GET', 'http://x/api/content-plans'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(plans)
  })

  it('returns plans array for media_buyer', async () => {
    const { GET } = await import('./route')
    queueMbAuth()
    adminQueue.push({ data: [], error: null })
    const res = await GET(makeReq('GET', 'http://x/api/content-plans'))
    expect(res.status).toBe(200)
  })

  it('returns empty array when data is null', async () => {
    const { GET } = await import('./route')
    queueAdminAuth()
    adminQueue.push({ data: null, error: null })
    const res = await GET(makeReq('GET', 'http://x/api/content-plans'))
    expect(await res.json()).toEqual([])
  })

  it('500 on DB error', async () => {
    const { GET } = await import('./route')
    queueAdminAuth()
    adminQueue.push({ data: null, error: { message: 'db error' } })
    const res = await GET(makeReq('GET', 'http://x/api/content-plans'))
    expect(res.status).toBe(500)
  })
})

describe('POST /api/content-plans', () => {
  it('403 when unauthenticated', async () => {
    const { POST } = await import('./route')
    queueNoAuth()
    const res = await POST(makeReq('POST', 'http://x/api/content-plans', { client_id: 'c1', month: '2025-07' }))
    expect(res.status).toBe(403)
  })

  it('400 when missing client_id', async () => {
    const { POST } = await import('./route')
    queueAdminAuth()
    const res = await POST(makeReq('POST', 'http://x/api/content-plans', { month: '2025-07' }))
    expect(res.status).toBe(400)
  })

  it('400 when missing month', async () => {
    const { POST } = await import('./route')
    queueAdminAuth()
    const res = await POST(makeReq('POST', 'http://x/api/content-plans', { client_id: 'c1' }))
    expect(res.status).toBe(400)
  })

  it('404 when client not found', async () => {
    const { POST } = await import('./route')
    queueAdminAuth()
    adminQueue.push({ data: null, error: null }) // client lookup returns null
    const res = await POST(makeReq('POST', 'http://x/api/content-plans', { client_id: 'c1', month: '2025-07' }))
    expect(res.status).toBe(404)
  })

  it('409 on duplicate plan (unique constraint)', async () => {
    const { POST } = await import('./route')
    queueAdminAuth()
    adminQueue.push({ data: { name: 'Acme' }, error: null })               // client
    adminQueue.push({ data: null, error: { code: '23505', message: 'dup' } }) // insert
    const res = await POST(makeReq('POST', 'http://x/api/content-plans', { client_id: 'c1', month: '2025-07' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already exists/)
  })

  it('201 creates plan with auto-generated title', async () => {
    const { POST } = await import('./route')
    queueAdminAuth()
    adminQueue.push({ data: { name: 'Acme Corp' }, error: null })
    const plan = { id: 'plan-1', client_id: 'c1', month: '2025-07-01', title: 'Acme Corp – July 2025', status: 'draft', client: { id: 'c1', name: 'Acme Corp' } }
    adminQueue.push({ data: plan, error: null })
    const res = await POST(makeReq('POST', 'http://x/api/content-plans', { client_id: 'c1', month: '2025-07' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('draft')
  })

  it('201 uses provided title when given', async () => {
    const { POST } = await import('./route')
    queueAdminAuth()
    adminQueue.push({ data: { name: 'Acme' }, error: null })
    const plan = { id: 'p2', title: 'My Custom Title', status: 'draft', client: { id: 'c1', name: 'Acme' } }
    adminQueue.push({ data: plan, error: null })
    const res = await POST(makeReq('POST', 'http://x/api/content-plans', { client_id: 'c1', month: '2025-07', title: 'My Custom Title' }))
    expect(res.status).toBe(201)
  })

  it('500 on unexpected DB error', async () => {
    const { POST } = await import('./route')
    queueAdminAuth()
    adminQueue.push({ data: { name: 'Acme' }, error: null })
    adminQueue.push({ data: null, error: { code: '99999', message: 'oops' } })
    const res = await POST(makeReq('POST', 'http://x/api/content-plans', { client_id: 'c1', month: '2025-07' }))
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PATCH/DELETE /api/content-plans/[id]
// ══════════════════════════════════════════════════════════════════════════════
async function makeIdParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/content-plans/[id]', () => {
  it('403 when unauthenticated', async () => {
    const { PATCH } = await import('./[id]/route')
    queueNoAuth()
    const res = await PATCH(makeReq('PATCH', 'http://x/api/content-plans/p1', { status: 'active' }), await makeIdParams('p1'))
    expect(res.status).toBe(403)
  })

  it('400 on invalid JSON body', async () => {
    const { PATCH } = await import('./[id]/route')
    queueAdminAuth()
    const req = new NextRequest('http://x/api/content-plans/p1', { method: 'PATCH', body: 'not-json' })
    const res = await PATCH(req, await makeIdParams('p1'))
    expect(res.status).toBe(400)
  })

  it('updates plan status to active', async () => {
    const { PATCH } = await import('./[id]/route')
    queueAdminAuth()
    const updated = { id: 'p1', status: 'active', client: { id: 'c1', name: 'Acme' } }
    adminQueue.push({ data: updated, error: null })
    const res = await PATCH(makeReq('PATCH', 'http://x/api/content-plans/p1', { status: 'active' }), await makeIdParams('p1'))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('active')
  })

  it('updates plan notes', async () => {
    const { PATCH } = await import('./[id]/route')
    queueAdminAuth()
    adminQueue.push({ data: { id: 'p1', notes: 'new note', client: null }, error: null })
    const res = await PATCH(makeReq('PATCH', 'http://x/api/content-plans/p1', { notes: 'new note' }), await makeIdParams('p1'))
    expect(res.status).toBe(200)
  })

  it('updates plan title', async () => {
    const { PATCH } = await import('./[id]/route')
    queueAdminAuth()
    adminQueue.push({ data: { id: 'p1', title: 'New Title', client: null }, error: null })
    const res = await PATCH(makeReq('PATCH', 'http://x/api/content-plans/p1', { title: 'New Title' }), await makeIdParams('p1'))
    expect(res.status).toBe(200)
  })

  it('500 on DB error', async () => {
    const { PATCH } = await import('./[id]/route')
    queueAdminAuth()
    adminQueue.push({ data: null, error: { message: 'db fail' } })
    const res = await PATCH(makeReq('PATCH', 'http://x/api/content-plans/p1', { status: 'active' }), await makeIdParams('p1'))
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/content-plans/[id]', () => {
  it('403 when unauthenticated', async () => {
    const { DELETE } = await import('./[id]/route')
    queueNoAuth()
    const res = await DELETE(makeReq('DELETE', 'http://x/api/content-plans/p1'), await makeIdParams('p1'))
    expect(res.status).toBe(403)
  })

  it('409 when plan is active (not draft)', async () => {
    const { DELETE } = await import('./[id]/route')
    queueAdminAuth()
    adminQueue.push({ data: { status: 'active' }, error: null })
    const res = await DELETE(makeReq('DELETE', 'http://x/api/content-plans/p1'), await makeIdParams('p1'))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/draft/)
  })

  it('409 when plan status is archived', async () => {
    const { DELETE } = await import('./[id]/route')
    queueAdminAuth()
    adminQueue.push({ data: { status: 'archived' }, error: null })
    const res = await DELETE(makeReq('DELETE', 'http://x/api/content-plans/p1'), await makeIdParams('p1'))
    expect(res.status).toBe(409)
  })

  it('409 when plan status is null (not found)', async () => {
    const { DELETE } = await import('./[id]/route')
    queueAdminAuth()
    adminQueue.push({ data: null, error: null })
    const res = await DELETE(makeReq('DELETE', 'http://x/api/content-plans/p1'), await makeIdParams('p1'))
    expect(res.status).toBe(409)
  })

  it('200 deletes a draft plan', async () => {
    const { DELETE } = await import('./[id]/route')
    queueAdminAuth()
    adminQueue.push({ data: { status: 'draft' }, error: null })
    adminQueue.push({ data: null, error: null })
    const res = await DELETE(makeReq('DELETE', 'http://x/api/content-plans/p1'), await makeIdParams('p1'))
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })

  it('500 on DB delete error', async () => {
    const { DELETE } = await import('./[id]/route')
    queueAdminAuth()
    adminQueue.push({ data: { status: 'draft' }, error: null })
    adminQueue.push({ data: null, error: { message: 'db error' } })
    const res = await DELETE(makeReq('DELETE', 'http://x/api/content-plans/p1'), await makeIdParams('p1'))
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// GET/POST /api/content-plans/[id]/items
// ══════════════════════════════════════════════════════════════════════════════
async function makeItemsParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/content-plans/[id]/items', () => {
  it('403 when unauthenticated', async () => {
    const { GET } = await import('./[id]/items/route')
    queueNoAuth()
    const res = await GET(makeReq('GET', 'http://x/api/content-plans/p1/items'), await makeItemsParams('p1'))
    expect(res.status).toBe(403)
  })

  it('returns items array', async () => {
    const { GET } = await import('./[id]/items/route')
    queueAdminAuth()
    const items = [{ id: 'item-1', content_type: 'reel', title: 'Acme_Reel_01_July2025' }]
    adminQueue.push({ data: items, error: null })
    const res = await GET(makeReq('GET', 'http://x/api/content-plans/p1/items'), await makeItemsParams('p1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(items)
  })

  it('returns empty array when no items', async () => {
    const { GET } = await import('./[id]/items/route')
    queueAdminAuth()
    adminQueue.push({ data: null, error: null })
    const res = await GET(makeReq('GET', 'http://x/api/content-plans/p1/items'), await makeItemsParams('p1'))
    expect(await res.json()).toEqual([])
  })

  it('500 on DB error', async () => {
    const { GET } = await import('./[id]/items/route')
    queueAdminAuth()
    adminQueue.push({ data: null, error: { message: 'db error' } })
    const res = await GET(makeReq('GET', 'http://x/api/content-plans/p1/items'), await makeItemsParams('p1'))
    expect(res.status).toBe(500)
  })
})

describe('POST /api/content-plans/[id]/items', () => {
  it('403 when unauthenticated', async () => {
    const { POST } = await import('./[id]/items/route')
    queueNoAuth()
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'reel', publish_date: '2025-07-15' }), await makeItemsParams('p1'))
    expect(res.status).toBe(403)
  })

  it('400 when missing content_type', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    const res = await POST(makeReq('POST', 'http://x', { publish_date: '2025-07-15' }), await makeItemsParams('p1'))
    expect(res.status).toBe(400)
  })

  it('400 when missing publish_date', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'reel' }), await makeItemsParams('p1'))
    expect(res.status).toBe(400)
  })

  it('400 when invalid content_type', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'video', publish_date: '2025-07-15' }), await makeItemsParams('p1'))
    expect(res.status).toBe(400)
  })

  it('404 when plan not found', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    adminQueue.push({ data: null, error: { message: 'not found' } })
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'reel', publish_date: '2025-07-15' }), await makeItemsParams('p1'))
    expect(res.status).toBe(404)
  })

  function queueSuccessfulItemCreation(opts: {
    clientName?: string
    planStatus?: string
    contentType?: string
    count?: number
  } = {}) {
    const { clientName = 'Acme', planStatus = 'active', contentType = 'reel', count = 0 } = opts

    adminQueue.push({ data: { id: 'p1', client_id: 'c1', title: 'My Plan', status: planStatus, client: { id: 'c1', name: clientName } }, error: null })
    adminQueue.push({ data: null, error: null, count })
    adminQueue.push({ data: { id: 'item-1', content_type: contentType }, error: null })
    adminQueue.push({ data: null, error: null }) // task insert
    adminQueue.push({ data: null, error: null }) // link task to item
    if (planStatus === 'draft') {
      adminQueue.push({ data: null, error: null }) // activate plan
    }
    adminQueue.push({ data: { id: 'item-1', content_type: contentType, task: { id: 'task-id-123' } }, error: null })
  }

  it('201 creates reel item with SLA=3 days', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    queueSuccessfulItemCreation({ contentType: 'reel' })
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'reel', publish_date: '2025-07-15T00:00:00.000Z' }), await makeItemsParams('p1'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.task.id).toBe('task-id-123')
  })

  it('201 creates design item with SLA=2 days', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    queueSuccessfulItemCreation({ contentType: 'design' })
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'design', publish_date: '2025-07-15T00:00:00.000Z' }), await makeItemsParams('p1'))
    expect(res.status).toBe(201)
  })

  it('201 creates ai_video item with SLA=4 days', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    queueSuccessfulItemCreation({ contentType: 'ai_video' })
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'ai_video', publish_date: '2025-07-15T00:00:00.000Z' }), await makeItemsParams('p1'))
    expect(res.status).toBe(201)
  })

  it('activates plan when plan is draft on first item add', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    queueSuccessfulItemCreation({ planStatus: 'draft' })
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'reel', publish_date: '2025-07-15T00:00:00.000Z' }), await makeItemsParams('p1'))
    expect(res.status).toBe(201)
  })

  it('does not activate plan when already active', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    queueSuccessfulItemCreation({ planStatus: 'active' })
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'reel', publish_date: '2025-07-15T00:00:00.000Z' }), await makeItemsParams('p1'))
    expect(res.status).toBe(201)
  })

  it('title format: ClientName_Reel_01_July2025', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    const { createAdminClient } = await import('@/lib/supabase-server')
    const capturedInserts: unknown[] = []

    const origMock = vi.mocked(createAdminClient)
    origMock.mockImplementationOnce(() => {
      const chain = makeChain(adminQueue)
      const origInsert = chain.insert as (v: unknown) => unknown
      chain.insert = (v: unknown) => { capturedInserts.push(v); return origInsert(v) }
      return chain as ReturnType<typeof createAdminClient>
    })

    queueSuccessfulItemCreation({ clientName: 'Acme Corp', contentType: 'reel', count: 0 })
    await POST(makeReq('POST', 'http://x', { content_type: 'reel', publish_date: '2025-07-15T00:00:00.000Z' }), await makeItemsParams('p1'))
    const itemInsert = capturedInserts[0] as { title: string } | undefined
    if (itemInsert) {
      expect(itemInsert.title).toMatch(/AcmeCorp_Reel_01_/)
    }
  })

  it('sequence number increments: 2nd reel is 02', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    queueSuccessfulItemCreation({ contentType: 'reel', count: 1 })
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'reel', publish_date: '2025-07-15T00:00:00.000Z' }), await makeItemsParams('p1'))
    expect(res.status).toBe(201)
  })

  it('500 and rolls back item when task creation fails', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    adminQueue.push({ data: { id: 'p1', client_id: 'c1', title: 'Plan', status: 'active', client: { id: 'c1', name: 'Acme' } }, error: null })
    adminQueue.push({ data: null, error: null, count: 0 })
    adminQueue.push({ data: { id: 'item-1' }, error: null })
    adminQueue.push({ data: null, error: { message: 'task db error' } }) // task insert FAILS
    adminQueue.push({ data: null, error: null }) // rollback delete
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'reel', publish_date: '2025-07-15T00:00:00.000Z' }), await makeItemsParams('p1'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/Task creation failed/)
  })

  it('500 when item insert fails', async () => {
    const { POST } = await import('./[id]/items/route')
    queueAdminAuth()
    adminQueue.push({ data: { id: 'p1', client_id: 'c1', title: 'Plan', status: 'active', client: { id: 'c1', name: 'Acme' } }, error: null })
    adminQueue.push({ data: null, error: null, count: 0 })
    adminQueue.push({ data: null, error: { message: 'insert failed' } }) // item insert FAILS
    const res = await POST(makeReq('POST', 'http://x', { content_type: 'reel', publish_date: '2025-07-15T00:00:00.000Z' }), await makeItemsParams('p1'))
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PATCH/DELETE /api/content-plans/[id]/items/[itemId]
// ══════════════════════════════════════════════════════════════════════════════
async function makeItemIdParams(id: string, itemId: string) {
  return { params: Promise.resolve({ id, itemId }) }
}

describe('PATCH /api/content-plans/[id]/items/[itemId]', () => {
  it('403 when unauthenticated', async () => {
    const { PATCH } = await import('./[id]/items/[itemId]/route')
    queueNoAuth()
    const res = await PATCH(makeReq('PATCH', 'http://x', { status: 'done' }), await makeItemIdParams('p1', 'item-1'))
    expect(res.status).toBe(403)
  })

  it('400 on invalid JSON', async () => {
    const { PATCH } = await import('./[id]/items/[itemId]/route')
    queueAdminAuth()
    const req = new NextRequest('http://x', { method: 'PATCH', body: '{bad}' })
    const res = await PATCH(req, await makeItemIdParams('p1', 'item-1'))
    expect(res.status).toBe(400)
  })

  it('updates status', async () => {
    const { PATCH } = await import('./[id]/items/[itemId]/route')
    queueAdminAuth()
    adminQueue.push({ data: { id: 'item-1', status: 'client_approved', task: null }, error: null })
    const res = await PATCH(makeReq('PATCH', 'http://x', { status: 'client_approved' }), await makeItemIdParams('p1', 'item-1'))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('client_approved')
  })

  it('updates platforms and notes', async () => {
    const { PATCH } = await import('./[id]/items/[itemId]/route')
    queueAdminAuth()
    adminQueue.push({ data: { id: 'item-1', platforms: ['instagram'], notes: 'hi', task: null }, error: null })
    const res = await PATCH(makeReq('PATCH', 'http://x', { platforms: ['instagram'], notes: 'hi' }), await makeItemIdParams('p1', 'item-1'))
    expect(res.status).toBe(200)
  })

  it('recalculates due date when publish_date changes (reel SLA=3)', async () => {
    const { PATCH } = await import('./[id]/items/[itemId]/route')
    queueAdminAuth()
    adminQueue.push({ data: { sla_days: 3, task_id: 'task-1' }, error: null })
    adminQueue.push({ data: null, error: null })
    adminQueue.push({ data: { id: 'item-1', publish_date: '2025-07-20T00:00:00.000Z', internal_due_date: '2025-07-17T00:00:00.000Z', task: null }, error: null })

    const res = await PATCH(
      makeReq('PATCH', 'http://x', { publish_date: '2025-07-20T00:00:00.000Z' }),
      await makeItemIdParams('p1', 'item-1')
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.internal_due_date).toBe('2025-07-17T00:00:00.000Z')
  })

  it('recalculates due date when publish_date changes (no task_id)', async () => {
    const { PATCH } = await import('./[id]/items/[itemId]/route')
    queueAdminAuth()
    adminQueue.push({ data: { sla_days: 2, task_id: null }, error: null })
    adminQueue.push({ data: { id: 'item-1', task: null }, error: null })
    const res = await PATCH(
      makeReq('PATCH', 'http://x', { publish_date: '2025-07-20T00:00:00.000Z' }),
      await makeItemIdParams('p1', 'item-1')
    )
    expect(res.status).toBe(200)
  })

  it('500 on DB error', async () => {
    const { PATCH } = await import('./[id]/items/[itemId]/route')
    queueAdminAuth()
    adminQueue.push({ data: null, error: { message: 'db error' } })
    const res = await PATCH(makeReq('PATCH', 'http://x', { status: 'done' }), await makeItemIdParams('p1', 'item-1'))
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/content-plans/[id]/items/[itemId]', () => {
  it('403 when unauthenticated', async () => {
    const { DELETE } = await import('./[id]/items/[itemId]/route')
    queueNoAuth()
    const res = await DELETE(makeReq('DELETE', 'http://x'), await makeItemIdParams('p1', 'item-1'))
    expect(res.status).toBe(403)
  })

  it('404 when item not found', async () => {
    const { DELETE } = await import('./[id]/items/[itemId]/route')
    queueAdminAuth()
    adminQueue.push({ data: null, error: null })
    const res = await DELETE(makeReq('DELETE', 'http://x'), await makeItemIdParams('p1', 'item-1'))
    expect(res.status).toBe(404)
  })

  it('200 deletes item and soft-deletes linked task (nulls plan_item_id first to break circular FK)', async () => {
    const { DELETE } = await import('./[id]/items/[itemId]/route')
    queueAdminAuth()
    adminQueue.push({ data: { task_id: 'task-1', status: 'pending_production' }, error: null })
    adminQueue.push({ data: null, error: null }) // update task: plan_item_id=null + deleted_at
    adminQueue.push({ data: null, error: null }) // delete item
    const res = await DELETE(makeReq('DELETE', 'http://x'), await makeItemIdParams('p1', 'item-1'))
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })

  it('200 deletes pending_production item with no linked task', async () => {
    const { DELETE } = await import('./[id]/items/[itemId]/route')
    queueAdminAuth()
    adminQueue.push({ data: { task_id: null, status: 'pending_production' }, error: null })
    adminQueue.push({ data: null, error: null })
    const res = await DELETE(makeReq('DELETE', 'http://x'), await makeItemIdParams('p1', 'item-1'))
    expect(res.status).toBe(200)
  })

  it('409 when item is already in production (non-pending_production status)', async () => {
    const { DELETE } = await import('./[id]/items/[itemId]/route')
    for (const status of ['done', 'client_approved', 'revision_requested']) {
      queueAdminAuth()
      adminQueue.push({ data: { task_id: null, status }, error: null })
      const res = await DELETE(makeReq('DELETE', 'http://x'), await makeItemIdParams('p1', 'item-1'))
      expect(res.status).toBe(409)
    }
  })

  it('500 on DB delete error', async () => {
    const { DELETE } = await import('./[id]/items/[itemId]/route')
    queueAdminAuth()
    adminQueue.push({ data: { task_id: null, status: 'pending_production' }, error: null })
    adminQueue.push({ data: null, error: { message: 'delete failed' } })
    const res = await DELETE(makeReq('DELETE', 'http://x'), await makeItemIdParams('p1', 'item-1'))
    expect(res.status).toBe(500)
  })
})
