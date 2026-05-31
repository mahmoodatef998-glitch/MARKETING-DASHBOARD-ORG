import { describe, it, expect } from 'vitest'
import { parseBody, TaskCreateSchema, ClientCreateSchema, InvoiceCreateSchema, CommentCreateSchema } from './validation'

describe('TaskCreateSchema', () => {
  it('accepts valid task', () => {
    const r = parseBody(TaskCreateSchema, { title: 'Design logo', priority: 'high' })
    expect(r.success).toBe(true)
  })
  it('rejects empty title', () => {
    const r = parseBody(TaskCreateSchema, { title: '' })
    expect(r.success).toBe(false)
  })
  it('rejects invalid status', () => {
    const r = parseBody(TaskCreateSchema, { title: 'Test', status: 'unknown' })
    expect(r.success).toBe(false)
  })
  it('rejects invalid priority', () => {
    const r = parseBody(TaskCreateSchema, { title: 'Test', priority: 'critical' })
    expect(r.success).toBe(false)
  })
  it('rejects invalid delivery_url', () => {
    const r = parseBody(TaskCreateSchema, { title: 'Test', delivery_url: 'not-a-url' })
    expect(r.success).toBe(false)
  })
})

describe('ClientCreateSchema', () => {
  it('accepts valid client', () => {
    const r = parseBody(ClientCreateSchema, { name: 'Acme', email: 'a@acme.com' })
    expect(r.success).toBe(true)
  })
  it('rejects invalid email', () => {
    const r = parseBody(ClientCreateSchema, { name: 'Acme', email: 'not-email' })
    expect(r.success).toBe(false)
  })
  it('rejects missing name', () => {
    const r = parseBody(ClientCreateSchema, { email: 'a@b.com' })
    expect(r.success).toBe(false)
  })
})

describe('InvoiceCreateSchema', () => {
  const validItem = { description: 'Design work', quantity: 2, unit_price: 500 }
  it('accepts valid invoice', () => {
    const r = parseBody(InvoiceCreateSchema, { client_id: crypto.randomUUID(), items: [validItem] })
    expect(r.success).toBe(true)
  })
  it('rejects empty items', () => {
    const r = parseBody(InvoiceCreateSchema, { client_id: crypto.randomUUID(), items: [] })
    expect(r.success).toBe(false)
  })
  it('rejects negative unit_price', () => {
    const r = parseBody(InvoiceCreateSchema, {
      client_id: crypto.randomUUID(),
      items: [{ ...validItem, unit_price: -10 }],
    })
    expect(r.success).toBe(false)
  })
  it('rejects tax > 100', () => {
    const r = parseBody(InvoiceCreateSchema, {
      client_id: crypto.randomUUID(), items: [validItem], tax: 150,
    })
    expect(r.success).toBe(false)
  })
})

describe('CommentCreateSchema', () => {
  it('accepts valid comment', () => {
    const r = parseBody(CommentCreateSchema, { content: 'Great work!' })
    expect(r.success).toBe(true)
  })
  it('rejects empty content', () => {
    const r = parseBody(CommentCreateSchema, { content: '' })
    expect(r.success).toBe(false)
  })
})
