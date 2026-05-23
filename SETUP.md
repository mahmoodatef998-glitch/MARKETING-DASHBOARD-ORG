# Agency OS — Setup Guide

## 1. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in all values:

```bash
cp .env.local.example .env.local
```

### Getting each key:

**Supabase**
1. Create project at supabase.com
2. Go to Settings → API → copy URL and anon key
3. Copy service role key (for server-side ops)
4. Run `supabase/schema.sql` in the SQL editor

**Notion**
1. Go to notion.so/my-integrations → New Integration → copy API key
2. Create 4 databases (Clients, Team, Tasks, Invoices) in Notion
3. Share each database with your integration
4. Copy each database ID from the URL (32-char hex after the last `/`)
5. Set up database properties exactly as described below

**Notion Database Properties:**
- **Clients DB**: Name (title), Email (email), Phone (phone), Status (select: active/pending/inactive), Country (text), Notes (text)
- **Team DB**: Name (title), Email (email), Role (select: developer/designer/manager/accountant/support), Status (select: active/inactive)
- **Tasks DB**: Title (title), Status (select: todo/in_progress/done/overdue), Priority (select: low/medium/high/urgent), Due Date (date), Description (text)
- **Invoices DB**: Invoice # (title), Amount (number), Status (select: draft/sent/paid/overdue), Due Date (date), Items (text/JSON)

**Gemini API**
1. Go to aistudio.google.com → Get API Key

**Gmail OAuth2**
1. Google Cloud Console → New Project → Enable Gmail API
2. OAuth 2.0 Client ID (Web application)
3. Add `https://developers.google.com/oauthplayground` as redirect URI
4. Use OAuth Playground to exchange for refresh token (scope: gmail.send)

**Cron Secret**
Generate a random string: `openssl rand -hex 32`

---

## 2. Install & Run

```bash
npm install
npm run dev        # http://localhost:3000
```

## 3. Supabase Auth Setup

In Supabase dashboard:
1. Authentication → Users → Create user (admin@youragency.com)
2. That's your login for the dashboard

## 4. Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Add all environment variables in Vercel dashboard → Settings → Environment Variables.

The `vercel.json` file configures the daily cron job at 9:00 AM UTC.

---

## Architecture

```
Agency OS
├── Next.js 16 (App Router)
├── Supabase (Auth + Database)
├── Notion (Mirror/backup of all data)
├── Gemini 1.5 Flash (Email generation + AI chat)
├── Gmail API (Email delivery)
└── Vercel Cron (Daily automation at 9AM UTC)
```

## Module Overview

| Module | Path | Description |
|--------|------|-------------|
| Dashboard | `/dashboard` | Stats overview, recent activity |
| Clients | `/dashboard/clients` | CRUD, Notion sync |
| Team | `/dashboard/team` | CRUD, role management, Notion sync |
| Tasks | `/dashboard/tasks` | CRUD, filters, assignee, Notion sync |
| Invoices | `/dashboard/invoices` | CRUD, PDF export, totals, Notion sync |
| Automation | `/dashboard/automation` | Cron logs, rule overview, manual trigger |
| AI Assistant | `/dashboard/ai-assistant` | Gemini chat with live agency context |
