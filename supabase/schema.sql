-- ══════════════════════════════════════════════════════════════════════════════
-- Agency OS — Complete Supabase Schema
-- Run once on a fresh project via SQL Editor
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS throughout
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Profiles (linked to auth.users) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role             text NOT NULL DEFAULT 'client'
                   CHECK (role IN ('admin','video_maker','designer','ai_video','media_buyer','client')),
  team_member_id   uuid,   -- DEPRECATED: use id (auth.users FK) directly; kept for data migration only
  client_id        uuid,
  display_name     text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Clients ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  notion_id    text,
  name         text NOT NULL,
  email        text NOT NULL,
  phone        text,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('active','pending','inactive')),
  country      text,
  notes        text,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Team Members ── DEPRECATED ────────────────────────────────────────────────
-- This table is kept for backward compatibility only.
-- All new code MUST use auth.users + profiles instead.
-- Do NOT add new columns or references to this table.
CREATE TABLE IF NOT EXISTS public.team_members (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  notion_id    text,
  name         text NOT NULL,
  email        text NOT NULL UNIQUE,
  role         text NOT NULL DEFAULT 'designer'
               CHECK (role IN ('video_maker','designer','ai_video','media_buyer')),
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','inactive')),
  avatar_url   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Tasks ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  notion_id             text,
  title                 text NOT NULL,
  description           text,
  status                text NOT NULL DEFAULT 'todo'
                        CHECK (status IN ('todo','in_progress','review','done','overdue')),
  approval_status       text NOT NULL DEFAULT 'none'
                        CHECK (approval_status IN ('none','pending','client_approved','admin_approved','revision_requested')),
  priority              text NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low','medium','high','urgent')),
  task_type             text
                        CHECK (task_type IN ('reel_video','design','ai_video','post','custom')),
  due_date              date,
  assignee_id           uuid REFERENCES public.team_members(id) ON DELETE SET NULL, -- DEPRECATED: use assigned_to
  assigned_to           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id             uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  delivery_url          text,
  reference_image_url   text,
  revision_notes        text,
  revision_voice_url    text,
  client_rating         smallint CHECK (client_rating BETWEEN 1 AND 5),
  client_rating_note    text,
  publish_platforms     text[],
  published_at          timestamptz,
  scheduled_publish_at  timestamptz,
  publish_caption       text,
  deleted_at              timestamptz,
  reminder_48h_sent_at    timestamptz,
  reminder_24h_sent_at    timestamptz,
  confirmation_sent_at    timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── Task Comments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_comments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  author_name text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Invoices ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  notion_id       text,
  invoice_number  text NOT NULL UNIQUE,
  client_id       uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  items           jsonb NOT NULL DEFAULT '[]',
  subtotal        numeric(12,2) NOT NULL DEFAULT 0,
  tax             numeric(5,2) DEFAULT 0,
  total           numeric(12,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','paid','overdue')),
  due_date        date,
  issued_date     timestamptz NOT NULL DEFAULT now(),
  notes           text,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Automation Logs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            text NOT NULL
                  CHECK (type IN (
                    'payment_reminder','task_reminder','task_reminder_48h',
                    'task_reminder_24h','task_confirmation','task_completed',
                    'task_in_review','task_assigned','weekly_report','client_welcome',
                    'auto_invoice','package_renewal_alert'
                  )),
  recipient_email text NOT NULL,
  subject         text NOT NULL,
  status          text NOT NULL CHECK (status IN ('sent','failed')),
  error           text,
  task_id         uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Billing Plans ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id         uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cycle_type        text NOT NULL
                    CHECK (cycle_type IN ('monthly','biweekly','every_10_days','custom_days','manual')),
  amount            numeric(12,2) NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'AED',
  custom_days       integer,
  next_invoice_date date NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── Client Packages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_packages (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'Custom Package',
  price        numeric(12,2) NOT NULL DEFAULT 0,
  renewal_type text NOT NULL DEFAULT 'monthly'
               CHECK (renewal_type IN ('monthly','one_time')),
  start_date   date NOT NULL DEFAULT CURRENT_DATE,
  end_date     date,
  is_active    boolean NOT NULL DEFAULT true,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Package Items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.package_items (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id     uuid NOT NULL REFERENCES public.client_packages(id) ON DELETE CASCADE,
  label          text NOT NULL,
  task_type      text NOT NULL,
  total_quantity integer NOT NULL DEFAULT 0,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Meetings ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meetings (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        text NOT NULL,
  client_id    uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name  text,
  scheduled_at timestamptz NOT NULL,
  notes        text,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','done','cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Messages ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Activity Logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name   text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  entity_name text,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Social Connections ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_connections (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id        uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  platform         text NOT NULL CHECK (platform IN ('instagram','facebook','tiktok')),
  page_id          text,
  ig_user_id       text,
  access_token     text NOT NULL,
  token_expires_at timestamptz,
  extra            jsonb NOT NULL DEFAULT '{}',
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_connections_client_platform_key UNIQUE (client_id, platform)
);

-- ── Scheduled Posts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id          uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  client_id        uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  platform         text NOT NULL CHECK (platform IN ('instagram','facebook','tiktok')),
  scheduled_at     timestamptz NOT NULL,
  caption          text,
  content_type     text NOT NULL DEFAULT 'post' CHECK (content_type IN ('post','reel','story')),
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','publishing','published','failed','cancelled')),
  attempts         integer NOT NULL DEFAULT 0,
  platform_post_id text,
  published_at     timestamptz,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Push Subscriptions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  keys       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_tasks_status        ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date      ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee      ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_client        ON public.tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date   ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_client     ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_at  ON public.scheduled_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_messages_users      ON public.messages(sender_id, receiver_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_packages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ── Policies ──────────────────────────────────────────────────────────────────

-- profiles: own row only
DROP POLICY IF EXISTS "Users can read own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON public.profiles;
CREATE POLICY "Users can read own profile"  ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());

-- clients / team_members / tasks / invoices / billing_plans / packages / meetings: authenticated access
DROP POLICY IF EXISTS "auth_all" ON public.clients;
DROP POLICY IF EXISTS "auth_all" ON public.team_members;
DROP POLICY IF EXISTS "auth_all" ON public.tasks;
DROP POLICY IF EXISTS "auth_all" ON public.invoices;
DROP POLICY IF EXISTS "auth_all" ON public.automation_logs;
DROP POLICY IF EXISTS "auth_all" ON public.billing_plans;
DROP POLICY IF EXISTS "auth_all" ON public.client_packages;
DROP POLICY IF EXISTS "auth_all" ON public.package_items;
DROP POLICY IF EXISTS "auth_all" ON public.meetings;

CREATE POLICY "auth_all" ON public.clients        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.team_members   FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.tasks          FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.invoices       FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.automation_logs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.billing_plans  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.client_packages FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.package_items  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON public.meetings       FOR ALL USING (auth.role() = 'authenticated');

-- task_comments: authenticated
DROP POLICY IF EXISTS "auth_all" ON public.task_comments;
CREATE POLICY "auth_all" ON public.task_comments FOR ALL USING (auth.role() = 'authenticated');

-- messages: parties only
DROP POLICY IF EXISTS "Message parties only" ON public.messages;
CREATE POLICY "Message parties only" ON public.messages FOR ALL
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- activity_logs: admin only
DROP POLICY IF EXISTS "Admin only on activity_logs" ON public.activity_logs;
CREATE POLICY "Admin only on activity_logs" ON public.activity_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- social_connections: admin only (contains access tokens — API routes use service role to bypass)
DROP POLICY IF EXISTS "Admin only on social_connections" ON public.social_connections;
CREATE POLICY "Admin only on social_connections" ON public.social_connections FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- scheduled_posts: admin and media_buyer (API routes use service role to bypass RLS)
DROP POLICY IF EXISTS "Admin only on scheduled_posts" ON public.scheduled_posts;
DROP POLICY IF EXISTS "Admin or media_buyer on scheduled_posts" ON public.scheduled_posts;
CREATE POLICY "Admin or media_buyer on scheduled_posts" ON public.scheduled_posts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','media_buyer')));

-- push_subscriptions: own row only
DROP POLICY IF EXISTS "Own push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "Own push_subscriptions" ON public.push_subscriptions FOR ALL
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATIONS — run these if upgrading an existing installation
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS throughout
-- ══════════════════════════════════════════════════════════════════════════════

-- Add approval workflow to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'none'
  CHECK (approval_status IN ('none','pending','client_approved','admin_approved','revision_requested'));

-- Add soft-delete to clients and invoices
ALTER TABLE public.clients  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Add content_type and published_at to scheduled_posts
ALTER TABLE public.scheduled_posts ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'post'
  CHECK (content_type IN ('post','reel','story'));
ALTER TABLE public.scheduled_posts ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_tasks_approval_status ON public.tasks(approval_status);
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at    ON public.clients(deleted_at);
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at   ON public.invoices(deleted_at);

-- Create meetings table (if not created by initial schema run)
CREATE TABLE IF NOT EXISTS public.meetings (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        text NOT NULL,
  client_id    uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name  text,
  scheduled_at timestamptz NOT NULL,
  notes        text,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','done','cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.meetings;
CREATE POLICY "auth_all" ON public.meetings FOR ALL USING (auth.role() = 'authenticated');

-- Expand automation_logs.type CHECK to include auto_invoice and package_renewal_alert
DO $$
BEGIN
  ALTER TABLE public.automation_logs DROP CONSTRAINT IF EXISTS automation_logs_type_check;
  ALTER TABLE public.automation_logs ADD CONSTRAINT automation_logs_type_check
    CHECK (type IN (
      'payment_reminder','task_reminder','task_reminder_48h',
      'task_reminder_24h','task_confirmation','task_completed',
      'task_in_review','task_assigned','weekly_report','client_welcome',
      'auto_invoice','package_renewal_alert'
    ));
END $$;

-- ── Campaigns ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaigns (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  goal        text CHECK (goal IN ('awareness','engagement','leads','sales','retention','custom')),
  platforms   text[] NOT NULL DEFAULT '{}',
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  budget      numeric(12,2),
  currency    text NOT NULL DEFAULT 'AED',
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','active','paused','completed')),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.campaigns;
CREATE POLICY "auth_all" ON public.campaigns FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE public.scheduled_posts ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_client    ON public.campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status    ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_posts_campaign      ON public.scheduled_posts(campaign_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- CONTENT PLANNING SYSTEM — additive migration
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Tasks: approval tracking columns (referenced in approvals route) ──────────
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS client_approved_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS admin_approved_at  timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approved_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL;
-- plan_item_id added later after content_plan_items is created (see below)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS plan_item_id uuid;

-- ── Earnings (designer pay-per-approval) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.earnings (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id    uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  amount     numeric(12,2) NOT NULL DEFAULT 0,
  currency   text NOT NULL DEFAULT 'AED',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT earnings_task_id_unique UNIQUE(task_id)
);
ALTER TABLE public.earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.earnings;
CREATE POLICY "auth_all" ON public.earnings FOR ALL USING (auth.role() = 'authenticated');

-- ── Content Plans ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_plans (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month      date NOT NULL,
  title      text NOT NULL,
  status     text NOT NULL DEFAULT 'draft'
             CHECK (status IN ('draft','active','completed','archived')),
  notes      text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_plans_client_month_unique UNIQUE(client_id, month)
);
ALTER TABLE public.content_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.content_plans;
CREATE POLICY "auth_all" ON public.content_plans FOR ALL USING (auth.role() = 'authenticated');

-- ── Content Plan Items ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_plan_items (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id           uuid NOT NULL REFERENCES public.content_plans(id) ON DELETE CASCADE,
  task_id           uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  client_id         uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  content_type      text NOT NULL CHECK (content_type IN ('reel','design','ai_video')),
  title             text NOT NULL,
  assigned_to       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  publish_date      timestamptz,
  first_publish_at  timestamptz,
  internal_due_date timestamptz,
  sla_days          integer NOT NULL DEFAULT 3,
  sequence_number   integer NOT NULL DEFAULT 1,
  platforms         text[] NOT NULL DEFAULT '{}',
  notes             text,
  status            text NOT NULL DEFAULT 'pending_production'
                    CHECK (status IN ('pending_production','client_approved','revision_requested','done')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_plan_items_plan_type_seq_unique UNIQUE(plan_id, content_type, sequence_number)
);
ALTER TABLE public.content_plan_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.content_plan_items;
CREATE POLICY "auth_all" ON public.content_plan_items FOR ALL USING (auth.role() = 'authenticated');

-- Add FK from tasks.plan_item_id → content_plan_items (deferred until table exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_plan_item_id_fkey'
      AND table_name = 'tasks'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_plan_item_id_fkey
      FOREIGN KEY (plan_item_id) REFERENCES public.content_plan_items(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Publish Events ────────────────────────────────────────────────────────────
-- Source of truth for per-platform scheduling.
-- status flow: blocked → ready → published | failed | cancelled
CREATE TABLE IF NOT EXISTS public.publish_events (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id          uuid NOT NULL REFERENCES public.content_plan_items(id) ON DELETE CASCADE,
  platform         text NOT NULL CHECK (platform IN ('instagram','facebook','tiktok')),
  scheduled_at     timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'blocked'
                   CHECK (status IN ('blocked','ready','published','failed','cancelled')),
  published_at     timestamptz,
  platform_post_id text,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.publish_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.publish_events;
CREATE POLICY "auth_all" ON public.publish_events FOR ALL USING (auth.role() = 'authenticated');

-- ── Indexes for new tables ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_content_plans_client      ON public.content_plans(client_id);
CREATE INDEX IF NOT EXISTS idx_content_plans_month       ON public.content_plans(month);
CREATE INDEX IF NOT EXISTS idx_content_plan_items_plan   ON public.content_plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_content_plan_items_task   ON public.content_plan_items(task_id);
CREATE INDEX IF NOT EXISTS idx_publish_events_item       ON public.publish_events(item_id);
CREATE INDEX IF NOT EXISTS idx_publish_events_scheduled  ON public.publish_events(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_publish_events_status     ON public.publish_events(status);
CREATE INDEX IF NOT EXISTS idx_tasks_plan_item           ON public.tasks(plan_item_id);


-- ── Payment tracking on invoices ─────────────────────────────────────────────
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS received_amount   numeric(12,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS received_at       timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_notes     text;

-- ── Invoice payments (multi-payment / installments) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid        NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text        CHECK (payment_method IN ('bank_transfer','cash','vodafone_cash','instapay','credit_card','other')),
  reference      text,
  notes          text,
  received_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON public.invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_date    ON public.invoice_payments(received_at);

-- ── Payment schedule columns (installment tracking) ───────────────────────────
ALTER TABLE public.invoice_payments ALTER COLUMN received_at DROP NOT NULL;
ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS due_date        date,
  ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('pending','paid','overdue')),
  ADD COLUMN IF NOT EXISTS installment_no  int;

CREATE INDEX IF NOT EXISTS idx_ip_status   ON public.invoice_payments(status);
CREATE INDEX IF NOT EXISTS idx_ip_due_date ON public.invoice_payments(due_date);

-- ── Expenses ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text          NOT NULL,
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  category    text          CHECK (category IN ('salary','tools','ads','office','freelancer','other')),
  date        date          NOT NULL DEFAULT CURRENT_DATE,
  notes       text,
  recurring   boolean       NOT NULL DEFAULT false,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date     ON public.expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

-- Financial settings (singleton row)
CREATE TABLE IF NOT EXISTS public.financial_settings (
  id                         int PRIMARY KEY DEFAULT 1,
  cost_per_design            numeric NOT NULL DEFAULT 15,
  media_buyer_rate_per_client numeric NOT NULL DEFAULT 150,
  partner1_name              text NOT NULL DEFAULT 'Partner 1',
  partner1_share             numeric NOT NULL DEFAULT 50,
  partner2_name              text NOT NULL DEFAULT 'Partner 2',
  partner2_share             numeric NOT NULL DEFAULT 30,
  partner3_name              text NOT NULL DEFAULT 'Partner 3',
  partner3_share             numeric NOT NULL DEFAULT 20,
  updated_at                 timestamptz DEFAULT now()
);
INSERT INTO public.financial_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── Payment policy on billing plans ──────────────────────────────────────────
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS payment_policy_type  VARCHAR(20)  DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS payment_advance_pct  INTEGER      DEFAULT 50,
  ADD COLUMN IF NOT EXISTS payment_final_days   INTEGER      DEFAULT 30;

-- Invoice pre-due reminders tracking
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reminder_3d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at timestamptz;

-- Audit log — every significant action
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     uuid,
  user_email  text,
  action      text        NOT NULL,
  table_name  text        NOT NULL,
  record_id   text,
  old_value   jsonb,
  new_value   jsonb,
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON public.audit_logs(user_id);

-- ── Team Payouts (salary / commission payments to team members) ───────────────
CREATE TABLE IF NOT EXISTS public.team_payouts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  currency    text        NOT NULL DEFAULT 'AED',
  description text,
  proof_url   text,
  paid_at     timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.team_payouts;
CREATE POLICY "auth_all" ON public.team_payouts FOR ALL USING (auth.role() = 'authenticated');
CREATE INDEX IF NOT EXISTS idx_team_payouts_member   ON public.team_payouts(member_id);
CREATE INDEX IF NOT EXISTS idx_team_payouts_paid_at  ON public.team_payouts(paid_at DESC);

-- Manual income entries (non-invoice cash in)
CREATE TABLE IF NOT EXISTS public.income_entries (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text          NOT NULL,
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  category    text          CHECK (category IN ('services','refund','grant','investment','other')),
  date        date          NOT NULL DEFAULT CURRENT_DATE,
  notes       text,
  client_id   uuid          REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_income_entries_date ON public.income_entries(date DESC);
ALTER TABLE public.income_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.income_entries;
CREATE POLICY "auth_all" ON public.income_entries FOR ALL USING (auth.role() = 'authenticated');

-- ── Expand automation_logs.type CHECK to include all current types ────────────
-- (cron_health, invoice_reminder_3d/1d, monthly_report, payment_receipt)
DO $$
BEGIN
  ALTER TABLE public.automation_logs DROP CONSTRAINT IF EXISTS automation_logs_type_check;
  ALTER TABLE public.automation_logs ADD CONSTRAINT automation_logs_type_check
    CHECK (type IN (
      'payment_reminder','task_reminder','task_reminder_48h',
      'task_reminder_24h','task_confirmation','task_completed',
      'task_in_review','task_assigned','weekly_report','client_welcome',
      'auto_invoice','package_renewal_alert','cron_health',
      'invoice_reminder_3d','invoice_reminder_1d','monthly_report',
      'payment_receipt'
    ));
END $$;
