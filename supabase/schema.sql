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
  team_member_id   uuid,
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

-- ── Team Members ──────────────────────────────────────────────────────────────
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
  assignee_id           uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
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
  currency          text NOT NULL DEFAULT 'USD',
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
