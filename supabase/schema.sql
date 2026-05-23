-- Agency OS — Supabase Schema
-- Run this in your Supabase SQL editor

-- ── Enable UUID extension ─────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Clients ───────────────────────────────────────────────────────────────────
create table if not exists clients (
  id           uuid primary key default uuid_generate_v4(),
  notion_id    text,
  name         text not null,
  email        text not null,
  phone        text,
  status       text not null default 'pending' check (status in ('active','pending','inactive')),
  country      text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Team Members ──────────────────────────────────────────────────────────────
create table if not exists team_members (
  id           uuid primary key default uuid_generate_v4(),
  notion_id    text,
  name         text not null,
  email        text not null unique,
  role         text not null default 'developer' check (role in ('developer','designer','manager','accountant','support')),
  status       text not null default 'active' check (status in ('active','inactive')),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Tasks ─────────────────────────────────────────────────────────────────────
create table if not exists tasks (
  id           uuid primary key default uuid_generate_v4(),
  notion_id    text,
  title        text not null,
  description  text,
  status       text not null default 'todo' check (status in ('todo','in_progress','done','overdue')),
  priority     text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  due_date     date,
  assignee_id  uuid references team_members(id) on delete set null,
  client_id    uuid references clients(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Invoices ──────────────────────────────────────────────────────────────────
create table if not exists invoices (
  id              uuid primary key default uuid_generate_v4(),
  notion_id       text,
  invoice_number  text not null unique,
  client_id       uuid references clients(id) on delete set null,
  items           jsonb not null default '[]',
  subtotal        numeric(12,2) not null default 0,
  tax             numeric(5,2) default 0,
  total           numeric(12,2) not null default 0,
  status          text not null default 'draft' check (status in ('draft','sent','paid','overdue')),
  due_date        date,
  issued_date     timestamptz not null default now(),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── Automation Logs ───────────────────────────────────────────────────────────
create table if not exists automation_logs (
  id              uuid primary key default uuid_generate_v4(),
  type            text not null check (type in ('payment_reminder','task_reminder')),
  recipient_email text not null,
  subject         text not null,
  status          text not null check (status in ('sent','failed')),
  error           text,
  created_at      timestamptz not null default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table clients        enable row level security;
alter table team_members   enable row level security;
alter table tasks          enable row level security;
alter table invoices       enable row level security;
alter table automation_logs enable row level security;

-- Authenticated users can read/write all rows
create policy "auth_all" on clients        for all using (auth.role() = 'authenticated');
create policy "auth_all" on team_members   for all using (auth.role() = 'authenticated');
create policy "auth_all" on tasks          for all using (auth.role() = 'authenticated');
create policy "auth_all" on invoices       for all using (auth.role() = 'authenticated');
create policy "auth_all" on automation_logs for all using (auth.role() = 'authenticated');

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_tasks_status      on tasks(status);
create index if not exists idx_tasks_due_date    on tasks(due_date);
create index if not exists idx_tasks_assignee    on tasks(assignee_id);
create index if not exists idx_invoices_status   on invoices(status);
create index if not exists idx_invoices_due_date on invoices(due_date);
create index if not exists idx_invoices_client   on invoices(client_id);
