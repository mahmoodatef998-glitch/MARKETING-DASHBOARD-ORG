/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client } from '@notionhq/client'
import type { Client as AgencyClient, TeamMember, Task, Invoice } from '@/types'

const notion = new Client({ auth: process.env.NOTION_API_KEY }) as any

const DB = {
  clients: process.env.NOTION_CLIENTS_DB_ID!,
  team: process.env.NOTION_TEAM_DB_ID!,
  tasks: process.env.NOTION_TASKS_DB_ID!,
  invoices: process.env.NOTION_INVOICES_DB_ID!,
}

// ─── Property builders ────────────────────────────────────────────────────────
function text(value: string) { return { rich_text: [{ text: { content: value } }] } }
function titleProp(value: string) { return { title: [{ text: { content: value } }] } }
function selectProp(value: string) { return { select: { name: value } } }
function emailProp(value: string) { return { email: value } }
function phoneProp(value: string) { return { phone_number: value } }
function dateProp(value: string) { return { date: { start: value } } }
function numberProp(value: number) { return { number: value } }

// ─── Property readers ─────────────────────────────────────────────────────────
function getRichText(prop: any): string { return prop?.rich_text?.[0]?.plain_text ?? '' }
function getTitle(prop: any): string { return prop?.title?.[0]?.plain_text ?? '' }
function getSelect(prop: any): string { return prop?.select?.name ?? '' }
function getEmail(prop: any): string { return prop?.email ?? '' }
function getPhone(prop: any): string { return prop?.phone_number ?? '' }
function getDate(prop: any): string { return prop?.date?.start ?? '' }
function getNumber(prop: any): number { return prop?.number ?? 0 }

// ─── CLIENTS ─────────────────────────────────────────────────────────────────
export async function getNotionClients(): Promise<Partial<AgencyClient>[]> {
  const res = await notion.databases.query({ database_id: DB.clients })
  return res.results.map((page: any) => ({
    notion_id: page.id,
    name: getTitle(page.properties.Name),
    email: getEmail(page.properties.Email),
    phone: getPhone(page.properties.Phone),
    status: getSelect(page.properties.Status) as AgencyClient['status'],
    country: getRichText(page.properties.Country),
    notes: getRichText(page.properties.Notes),
  }))
}

export async function createNotionClient(client: Partial<AgencyClient>): Promise<string> {
  const page = await notion.pages.create({
    parent: { database_id: DB.clients },
    properties: {
      Name: titleProp(client.name ?? ''),
      Email: emailProp(client.email ?? ''),
      Phone: phoneProp(client.phone ?? ''),
      Status: selectProp(client.status ?? 'pending'),
      Country: text(client.country ?? ''),
      Notes: text(client.notes ?? ''),
    },
  })
  return page.id
}

export async function updateNotionClient(notionId: string, client: Partial<AgencyClient>) {
  await notion.pages.update({
    page_id: notionId,
    properties: {
      ...(client.name && { Name: titleProp(client.name) }),
      ...(client.email && { Email: emailProp(client.email) }),
      ...(client.phone && { Phone: phoneProp(client.phone) }),
      ...(client.status && { Status: selectProp(client.status) }),
      ...(client.country !== undefined && { Country: text(client.country ?? '') }),
      ...(client.notes !== undefined && { Notes: text(client.notes ?? '') }),
    },
  })
}

export async function deleteNotionPage(notionId: string) {
  await notion.pages.update({ page_id: notionId, archived: true })
}

// ─── TEAM ─────────────────────────────────────────────────────────────────────
export async function getNotionTeam(): Promise<Partial<TeamMember>[]> {
  const res = await notion.databases.query({ database_id: DB.team })
  return res.results.map((page: any) => ({
    notion_id: page.id,
    name: getTitle(page.properties.Name),
    email: getEmail(page.properties.Email),
    role: getSelect(page.properties.Role) as TeamMember['role'],
    status: getSelect(page.properties.Status) as TeamMember['status'],
  }))
}

export async function createNotionTeamMember(member: Partial<TeamMember>): Promise<string> {
  const page = await notion.pages.create({
    parent: { database_id: DB.team },
    properties: {
      Name: titleProp(member.name ?? ''),
      Email: emailProp(member.email ?? ''),
      Role: selectProp(member.role ?? 'developer'),
      Status: selectProp(member.status ?? 'active'),
    },
  })
  return page.id
}

export async function updateNotionTeamMember(notionId: string, member: Partial<TeamMember>) {
  await notion.pages.update({
    page_id: notionId,
    properties: {
      ...(member.name && { Name: titleProp(member.name) }),
      ...(member.email && { Email: emailProp(member.email) }),
      ...(member.role && { Role: selectProp(member.role) }),
      ...(member.status && { Status: selectProp(member.status) }),
    },
  })
}

// ─── TASKS ────────────────────────────────────────────────────────────────────
export async function getNotionTasks(): Promise<Partial<Task>[]> {
  const res = await notion.databases.query({ database_id: DB.tasks })
  return res.results.map((page: any) => ({
    notion_id: page.id,
    title: getTitle(page.properties.Title),
    status: getSelect(page.properties.Status) as Task['status'],
    priority: getSelect(page.properties.Priority) as Task['priority'],
    due_date: getDate(page.properties['Due Date']),
    description: getRichText(page.properties.Description),
  }))
}

export async function createNotionTask(task: Partial<Task>): Promise<string> {
  const page = await notion.pages.create({
    parent: { database_id: DB.tasks },
    properties: {
      Title: titleProp(task.title ?? ''),
      Status: selectProp(task.status ?? 'todo'),
      Priority: selectProp(task.priority ?? 'medium'),
      ...(task.due_date && { 'Due Date': dateProp(task.due_date) }),
      ...(task.description && { Description: text(task.description) }),
    },
  })
  return page.id
}

export async function updateNotionTask(notionId: string, task: Partial<Task>) {
  await notion.pages.update({
    page_id: notionId,
    properties: {
      ...(task.title && { Title: titleProp(task.title) }),
      ...(task.status && { Status: selectProp(task.status) }),
      ...(task.priority && { Priority: selectProp(task.priority) }),
      ...(task.due_date && { 'Due Date': dateProp(task.due_date) }),
    },
  })
}

// ─── INVOICES ─────────────────────────────────────────────────────────────────
export async function getNotionInvoices(): Promise<Partial<Invoice>[]> {
  const res = await notion.databases.query({ database_id: DB.invoices })
  return res.results.map((page: any) => ({
    notion_id: page.id,
    invoice_number: getTitle(page.properties['Invoice #']),
    total: getNumber(page.properties.Amount),
    status: getSelect(page.properties.Status) as Invoice['status'],
    due_date: getDate(page.properties['Due Date']),
  }))
}

export async function createNotionInvoice(invoice: Partial<Invoice>): Promise<string> {
  const page = await notion.pages.create({
    parent: { database_id: DB.invoices },
    properties: {
      'Invoice #': titleProp(invoice.invoice_number ?? ''),
      Amount: numberProp(invoice.total ?? 0),
      Status: selectProp(invoice.status ?? 'draft'),
      ...(invoice.due_date && { 'Due Date': dateProp(invoice.due_date) }),
      Items: text(JSON.stringify(invoice.items ?? [])),
    },
  })
  return page.id
}

export async function updateNotionInvoice(notionId: string, invoice: Partial<Invoice>) {
  await notion.pages.update({
    page_id: notionId,
    properties: {
      ...(invoice.status && { Status: selectProp(invoice.status) }),
      ...(invoice.total !== undefined && { Amount: numberProp(invoice.total) }),
      ...(invoice.items && { Items: text(JSON.stringify(invoice.items)) }),
    },
  })
}
