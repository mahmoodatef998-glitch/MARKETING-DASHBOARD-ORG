/**
 * Integration tests for /api/approvals (GET, PATCH).
 * Covers role-based visibility and approval action permissions.
 * Uses a queue-based Supabase mock — no DB or credentials required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [] })) }))
vi.mock('@/lib/slack',  () => ({ sendSlack: vi.fn() }))
vi.mock('@/lib/gmail',  () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/gemini', () => ({ generateEmailContent: vi.fn(() => Promise.resolve({ subject: 'S', body: 'B' })) }))
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

// ─── Auth queue helpers ────────────────────────────────────────────────────────
function queueAdmin() {
  serverQueue.push({ data: { user: { id: 'user-admin' } }, error: null })
  serverQueue.push({ data: { role: 'admin', client_id: null }, error: null })
}

function queueClient(clientId = 'client-1') {
  serverQueue.push({ data: { user: { id: 'user-c' } }, error: null })
  serverQueue.push({ data: { role: 'client', client_id: clientId }, error: null })
}

function queueVideoMaker() {
  serverQueue.push({ data: { user: { id: 'user-vm' } }, error: null })
  serverQueue.push({ data: { role: 'video_maker', client_id: null }, error: null })
}

function queueMediaBuyer() {
  serverQueue.push({ data: { user: { id: 'user-mb' } }, error: null })
  serverQueue.push({ data: { role: 'media_buyer', client_id: null }, error: null })
}

function queueClientNoId() {
  serverQueue.push({ data: { user: { id: 'user-c2' } }, error: null })
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
// GET /api/approvals
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/approvals', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('./route')
    queueNoAuth()
    const res = await GET(makeReq('GET', 'http://x/api/approvals'))
    expect(res.status).toBe(401)
  })

  it('admin sees all pending approvals', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    const tasks = [{ id: 't1', approval_status: 'pending', status: 'done' }]
    adminQueue.push({ data: tasks, error: null })
    const res = await GET(makeReq('GET', 'http://x/api/approvals'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(tasks)
  })

  it('admin: null data returns empty array', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    adminQueue.push({ data: null, error: null })
    const res = await GET(makeReq('GET', 'http://x/api/approvals'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('media_buyer sees all pending approvals', async () => {
    const { GET } = await import('./route')
    queueMediaBuyer()
    adminQueue.push({ data: [{ id: 't2' }], error: null })
    const res = await GET(makeReq('GET', 'http://x/api/approvals'))
    expect(res.status).toBe(200)
  })

  it('client without client_id gets empty array', async () => {
    const { GET } = await import('./route')
    queueClientNoId()
    const res = await GET(makeReq('GET', 'http://x/api/approvals'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('client with client_id sees only their tasks', async () => {
    const { GET } = await import('./route')
    queueClient('client-1')
    adminQueue.push({ data: [{ id: 't3', client_id: 'client-1', approval_status: 'pending' }], error: null })
    const res = await GET(makeReq('GET', 'http://x/api/approvals'))
    expect(res.status).toBe(200)
  })

  it('video_maker sees only their submitted tasks', async () => {
    const { GET } = await import('./route')
    queueVideoMaker()
    adminQueue.push({ data: [{ id: 't4', assigned_to: 'user-vm', approval_status: 'pending' }], error: null })
    const res = await GET(makeReq('GET', 'http://x/api/approvals'))
    expect(res.status).toBe(200)
  })

  it('admin can filter by approval_status param', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    adminQueue.push({ data: [{ id: 't5', approval_status: 'client_approved' }], error: null })
    const res = await GET(makeReq('GET', 'http://x/api/approvals?approval_status=client_approved'))
    expect(res.status).toBe(200)
  })

  it('500 on DB error', async () => {
    const { GET } = await import('./route')
    queueAdmin()
    adminQueue.push({ data: null, error: { message: 'db error' } })
    const res = await GET(makeReq('GET', 'http://x/api/approvals'))
    expect(res.status).toBe(500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/approvals  (approve / reject)
// ══════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/approvals', () => {
  it('401 when unauthenticated', async () => {
    const { PATCH } = await import('./route')
    queueNoAuth()
    const res = await PATCH(makeReq('PATCH', 'http://x/api/approvals', { task_id: 't1', action: 'admin_approve' }))
    expect(res.status).toBe(401)
  })

  it('400 when task_id is missing', async () => {
    const { PATCH } = await import('./route')
    queueAdmin()
    const res = await PATCH(makeReq('PATCH', 'http://x/api/approvals', { action: 'admin_approve' }))
    expect(res.status).toBe(400)
  })

  it('400 when action is missing', async () => {
    const { PATCH } = await import('./route')
    queueAdmin()
    const res = await PATCH(makeReq('PATCH', 'http://x/api/approvals', { task_id: 't1' }))
    expect(res.status).toBe(400)
  })

  it('400 on invalid JSON', async () => {
    const { PATCH } = await import('./route')
    queueAdmin()
    const req = new NextRequest('http://x/api/approvals', { method: 'PATCH', body: 'not-json' })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('404 when task does not exist', async () => {
    const { PATCH } = await import('./route')
    queueAdmin()
    adminQueue.push({ data: null, error: { message: 'not found' } }) // task fetch
    const res = await PATCH(makeReq('PATCH', 'http://x/api/approvals', { task_id: 't99', action: 'admin_approve' }))
    expect(res.status).toBe(404)
  })

  it('403 when video_maker tries to approve (not admin or client)', async () => {
    const { PATCH } = await import('./route')
    queueVideoMaker()
    // task fetch
    adminQueue.push({ data: { id: 't1', client_id: 'c1', assigned_to: 'user-vm', approval_status: 'pending' }, error: null })
    const res = await PATCH(makeReq('PATCH', 'http://x/api/approvals', { task_id: 't1', action: 'admin_approve' }))
    expect(res.status).toBe(403)
  })

  it('403 when client tries to admin_approve (admin-only action)', async () => {
    const { PATCH } = await import('./route')
    queueClient('client-1')
    adminQueue.push({ data: { id: 't1', client_id: 'client-1', assigned_to: null, approval_status: 'client_approved' }, error: null })
    const res = await PATCH(makeReq('PATCH', 'http://x/api/approvals', { task_id: 't1', action: 'admin_approve' }))
    expect(res.status).toBe(403)
  })

  it('403 when client tries to approve a task that belongs to another client', async () => {
    const { PATCH } = await import('./route')
    queueClient('client-1')
    // Task belongs to a DIFFERENT client
    adminQueue.push({ data: { id: 't1', client_id: 'other-client', assigned_to: null, approval_status: 'pending' }, error: null })
    const res = await PATCH(makeReq('PATCH', 'http://x/api/approvals', { task_id: 't1', action: 'client_approve' }))
    expect(res.status).toBe(403)
  })

  it('200 when client approves their own task', async () => {
    const { PATCH } = await import('./route')
    queueClient('client-1')
    adminQueue.push({ data: { id: 't1', client_id: 'client-1', assigned_to: null, approval_status: 'pending', task_type: 'reel_video' }, error: null })
    adminQueue.push({ data: null, error: null }) // approval update
    const res = await PATCH(makeReq('PATCH', 'http://x/api/approvals', { task_id: 't1', action: 'client_approve' }))
    expect(res.status).toBe(200)
  })

  it('200 when admin approves a task', async () => {
    const { PATCH } = await import('./route')
    queueAdmin()
    adminQueue.push({ data: { id: 't1', client_id: 'c1', assigned_to: 'user-vm', approval_status: 'client_approved', task_type: null }, error: null })
    adminQueue.push({ data: null, error: null }) // approval update
    // Optional: task re-fetch for response
    adminQueue.push({ data: { id: 't1', approval_status: 'admin_approved', client: null, assignee: null }, error: null })
    const res = await PATCH(makeReq('PATCH', 'http://x/api/approvals', { task_id: 't1', action: 'admin_approve' }))
    expect(res.status).toBe(200)
  })

  it('200 when admin requests revision', async () => {
    const { PATCH } = await import('./route')
    queueAdmin()
    adminQueue.push({ data: { id: 't1', client_id: 'c1', assigned_to: 'user-vm', approval_status: 'pending', task_type: null }, error: null })
    adminQueue.push({ data: null, error: null }) // status update
    const res = await PATCH(makeReq('PATCH', 'http://x/api/approvals', { task_id: 't1', action: 'revision_requested', note: 'Please redo the intro' }))
    expect(res.status).toBe(200)
  })
})
