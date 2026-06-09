/**
 * Integration tests for /api/tasks (GET, POST) and /api/tasks/[id] (PUT, DELETE).
 * Uses a queue-based Supabase mock — no DB or credentials required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [] })) }))
vi.mock('@/lib/notion',  () => ({ createNotionTask: vi.fn(() => 'notion-id'), updateNotionTask: vi.fn(), deleteNotionPage: vi.fn() }))
vi.mock('@/lib/slack',   () => ({ sendSlack: vi.fn() }))
vi.mock('@/lib/gmail',   () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/gemini',  () => ({ generateEmailContent: vi.fn(() => Promise.resolve({ subject: 'S', body: 'B' })) }))
vi.mock('@/lib/webpush', () => ({ sendPushNotification: vi.fn() }))
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
  const chain = makeChain(adminQueue) as Record<string, unknown>
  chain.auth = { admin: { getUserById: vi.fn(() => Promise.resolve(dequeue(adminQueue))) } }
  return chain
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(() => Promise.resolve(makeServerClient())),
  createAdminClient:  vi.fn(() => makeAdminClient()),
}))

vi.mock('@/lib/utils', async () => {
  const real = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils')
  return { ...real, generateId: vi.fn(() => 'task-id-123') }
})

// ─── Auth queue helpers ────────────────────────────────────────────────────────
function queueAdmin() {
  serverQueue.push({ data: { user: { id: 'user-admin' } }, error: null })
  serverQueue.push({ data: { role: 'admin', client_id: null, team_member_id: null }, error: null })
}

function queueMediaBuyer() {
  serverQueue.push({ data: { user: { id: 'user-mb' } }, error: null })
  serverQueue.push({ data: { role: 'media_buyer', client_id: null, team_member_id: null }, error: null })
}

function queueVideoMaker() {
  serverQueue.push({ data: { user: { id: 'user-vm' } }, error: null })
  serverQueue.push({ data: { role: 'video_maker', client_id: null, team_member_id: 'tm-1' }, error: null })
}

function queueClient(clientId = 'client-1') {
  serverQueue.push({ data: { user: { id: 'user-client' } }, error: null })
  serverQueue.push({ data: { role: 'client', client_id: clientId, team_member_id: null }, error: null })
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

beforeEach(() => {
  serverQueue.length = 0
  adminQueue.length  = 0
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/tasks
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/tasks', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('./route')
    queueNoAuth()
    const res = await GET(makeReq('GET', 'http://x/api/tasks'))
    expect(res.status).toBe(401)
  })

  it('admin receives all non-deleted tasks', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    const tasks = [{ id: 't1', title: 'Task 1', deleted_at: null }]
    serverQueue.push({ data: tasks, error: null })
    const res = await GET(makeReq('GET', 'http://x/api/tasks'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(tasks)
  })

  it('admin: null data returns empty array', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: null })
    const res = await GET(makeReq('GET', 'http://x/api/tasks'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('media_buyer gets all tasks with filters', async () => {
    const { GET } = await import('./route')
    queueMediaBuyer()
    serverQueue.push({ data: [{ id: 't2' }], error: null })
    const res = await GET(makeReq('GET', 'http://x/api/tasks'))
    expect(res.status).toBe(200)
  })

  it('video_maker gets tasks (no role restriction on GET)', async () => {
    const { GET } = await import('./route')
    queueVideoMaker()
    serverQueue.push({ data: [{ id: 't3', assigned_to: 'user-vm' }], error: null })
    const res = await GET(makeReq('GET', 'http://x/api/tasks'))
    expect(res.status).toBe(200)
  })

  it('client with client_id sees own tasks', async () => {
    const { GET } = await import('./route')
    queueClient('client-1')
    serverQueue.push({ data: [{ id: 't4', client_id: 'client-1' }], error: null })
    const res = await GET(makeReq('GET', 'http://x/api/tasks'))
    expect(res.status).toBe(200)
  })

  it('client without client_id gets empty array immediately', async () => {
    const { GET } = await import('./route')
    queueClientNoId()
    const res = await GET(makeReq('GET', 'http://x/api/tasks'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('500 on DB error', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: { message: 'connection failed' } })
    const res = await GET(makeReq('GET', 'http://x/api/tasks'))
    expect(res.status).toBe(500)
  })

  it('admin can filter by status param', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: [{ id: 't5', status: 'done' }], error: null })
    const res = await GET(makeReq('GET', 'http://x/api/tasks?status=done'))
    expect(res.status).toBe(200)
  })

  it('admin can filter by client_id param', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: [{ id: 't6', client_id: 'c1' }], error: null })
    const res = await GET(makeReq('GET', 'http://x/api/tasks?client_id=c1'))
    expect(res.status).toBe(200)
  })

  it('admin can filter by approval_status param', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: [{ id: 't7', approval_status: 'pending' }], error: null })
    const res = await GET(makeReq('GET', 'http://x/api/tasks?approval_status=pending'))
    expect(res.status).toBe(200)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/tasks
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/tasks', () => {
  it('401 when unauthenticated', async () => {
    const { POST } = await import('./route')
    queueNoAuth()
    const res = await POST(makeReq('POST', 'http://x/api/tasks', { title: 'Test' }))
    expect(res.status).toBe(401)
  })

  it('403 when video_maker tries to create task', async () => {
    const { POST } = await import('./route')
    queueVideoMaker()
    const res = await POST(makeReq('POST', 'http://x/api/tasks', { title: 'Test' }))
    expect(res.status).toBe(403)
  })

  it('201 when media_buyer creates a task', async () => {
    const { POST } = await import('./route')
    queueMediaBuyer()
    serverQueue.push({ data: null, error: null }) // tasks.insert
    const res = await POST(makeReq('POST', 'http://x/api/tasks', { title: 'Media Buy Task' }))
    expect(res.status).toBe(201)
  })

  it('400 when title is missing', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    const res = await POST(makeReq('POST', 'http://x/api/tasks', { priority: 'high' }))
    expect(res.status).toBe(400)
  })

  it('400 on invalid JSON body', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    const req = new NextRequest('http://x/api/tasks', { method: 'POST', body: '{bad-json}' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('400 when priority is invalid', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    const res = await POST(makeReq('POST', 'http://x/api/tasks', { title: 'T', priority: 'critical' }))
    expect(res.status).toBe(400)
  })

  it('201 creates task with minimal valid body', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: null }) // tasks.insert
    const res = await POST(makeReq('POST', 'http://x/api/tasks', { title: 'Design Logo' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('task-id-123')
    expect(body.title).toBe('Design Logo')
    expect(body.status).toBe('todo')
    expect(body.priority).toBe('medium')
  })

  it('201 respects explicit status and priority', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: null })
    const res = await POST(makeReq('POST', 'http://x/api/tasks', { title: 'Urgent Task', status: 'in_progress', priority: 'urgent' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('in_progress')
    expect(body.priority).toBe('urgent')
  })

  it('500 on DB insert error', async () => {
    const { POST } = await import('./route')
    queueAdmin()
    serverQueue.push({ data: null, error: { message: 'db connection error' } })
    const res = await POST(makeReq('POST', 'http://x/api/tasks', { title: 'Test' }))
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/tasks/[id]
// ══════════════════════════════════════════════════════════════════════════════
async function idParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PUT /api/tasks/[id]', () => {
  const validUpdate = { title: 'Updated Title', status: 'in_progress', priority: 'high' }

  it('401 when unauthenticated', async () => {
    const { PUT } = await import('./[id]/route')
    queueNoAuth()
    const res = await PUT(makeReq('PUT', 'http://x/api/tasks/t1', validUpdate), await idParams('t1'))
    expect(res.status).toBe(401)
  })

  it('403 when client tries to update', async () => {
    const { PUT } = await import('./[id]/route')
    queueClient()
    const res = await PUT(makeReq('PUT', 'http://x/api/tasks/t1', validUpdate), await idParams('t1'))
    expect(res.status).toBe(403)
  })

  it('400 on invalid JSON body', async () => {
    const { PUT } = await import('./[id]/route')
    queueAdmin()
    const req = new NextRequest('http://x/api/tasks/t1', { method: 'PUT', body: 'not-json' })
    const res = await PUT(req, await idParams('t1'))
    expect(res.status).toBe(400)
  })

  it('403 when video_maker tries to update a task not assigned to them', async () => {
    const { PUT } = await import('./[id]/route')
    queueVideoMaker()
    // task check — assigned_to is someone else
    adminQueue.push({ data: { assigned_to: 'other-user' }, error: null })
    const res = await PUT(makeReq('PUT', 'http://x/api/tasks/t1', validUpdate), await idParams('t1'))
    expect(res.status).toBe(403)
  })

  it('200 when video_maker updates their own task', async () => {
    const { PUT } = await import('./[id]/route')
    queueVideoMaker()
    // task assignment check — matches user-vm
    adminQueue.push({ data: { assigned_to: 'user-vm' }, error: null })
    // old task fetch (for activity log)
    serverQueue.push({ data: { status: 'todo', client_id: null, title: 'T', description: null, priority: 'medium', due_date: null, assigned_to: 'user-vm', scheduled_publish_at: null }, error: null })
    // task update result
    serverQueue.push({ data: { id: 't1', title: 'Updated Title', status: 'in_progress', client: null, assignee: null }, error: null })
    const res = await PUT(makeReq('PUT', 'http://x/api/tasks/t1', validUpdate), await idParams('t1'))
    expect(res.status).toBe(200)
  })

  it('200 when admin updates any task', async () => {
    const { PUT } = await import('./[id]/route')
    queueAdmin()
    // old task fetch
    serverQueue.push({ data: { status: 'todo', client_id: null, title: 'T', description: null, priority: 'medium', due_date: null, assigned_to: null, scheduled_publish_at: null }, error: null })
    // task update
    serverQueue.push({ data: { id: 't1', ...validUpdate, client: null, assignee: null }, error: null })
    const res = await PUT(makeReq('PUT', 'http://x/api/tasks/t1', validUpdate), await idParams('t1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('in_progress')
  })

  it('500 on DB update error', async () => {
    const { PUT } = await import('./[id]/route')
    queueAdmin()
    // old task fetch
    serverQueue.push({ data: { status: 'todo', client_id: null, title: 'T', description: null, priority: 'medium', due_date: null, assigned_to: null, scheduled_publish_at: null }, error: null })
    // update fails
    serverQueue.push({ data: null, error: { message: 'db error' } })
    const res = await PUT(makeReq('PUT', 'http://x/api/tasks/t1', validUpdate), await idParams('t1'))
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/tasks/[id]  (soft-delete)
// ══════════════════════════════════════════════════════════════════════════════
describe('DELETE /api/tasks/[id]', () => {
  it('401 when unauthenticated', async () => {
    const { DELETE } = await import('./[id]/route')
    queueNoAuth()
    const res = await DELETE(makeReq('DELETE', 'http://x/api/tasks/t1'), await idParams('t1'))
    expect(res.status).toBe(401)
  })

  it('403 when video_maker tries to delete', async () => {
    const { DELETE } = await import('./[id]/route')
    queueVideoMaker()
    const res = await DELETE(makeReq('DELETE', 'http://x/api/tasks/t1'), await idParams('t1'))
    expect(res.status).toBe(403)
  })

  it('200 when admin soft-deletes a task', async () => {
    const { DELETE } = await import('./[id]/route')
    queueAdmin()
    serverQueue.push({ data: { notion_id: null }, error: null }) // select notion_id
    serverQueue.push({ data: null, error: null })                // update deleted_at
    const res = await DELETE(makeReq('DELETE', 'http://x/api/tasks/t1'), await idParams('t1'))
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })

  it('500 on DB soft-delete error', async () => {
    const { DELETE } = await import('./[id]/route')
    queueAdmin()
    serverQueue.push({ data: { notion_id: null }, error: null }) // select notion_id
    serverQueue.push({ data: null, error: { message: 'db error' } })
    const res = await DELETE(makeReq('DELETE', 'http://x/api/tasks/t1'), await idParams('t1'))
    expect(res.status).toBe(500)
  })
})
