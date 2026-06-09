/**
 * Static analysis tests — scan every API route for the known anti-patterns
 * documented in CLAUDE.md.  Run with `npm test` — no DB or network required.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const API_DIR = path.join(ROOT, 'src/app/api')

interface RouteFile { rel: string; content: string }

function collectRoutes(): RouteFile[] {
  const results: RouteFile[] = []
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'route.ts')
        results.push({ rel: path.relative(ROOT, full), content: fs.readFileSync(full, 'utf-8') })
    }
  }
  walk(API_DIR)
  return results
}

// ── 1. Every route that exports an HTTP handler must call getUser() ──────────

// Routes that legitimately skip getUser() (e.g. OAuth callbacks, cron, public webhooks)
const AUTH_EXEMPT_ROUTES = [
  `social${path.sep}oauth${path.sep}callback`,
]

describe('Anti-pattern #6: missing getUser() in route handlers', () => {
  it('all API routes with handlers call auth.getUser()', () => {
    const routes = collectRoutes()
    const missing: string[] = []
    for (const { rel, content } of routes) {
      if (rel.includes(`${path.sep}cron${path.sep}`)) continue
      if (AUTH_EXEMPT_ROUTES.some(exempt => rel.includes(exempt))) continue
      const hasHandler = /export async function (GET|POST|PUT|PATCH|DELETE)\b/.test(content)
      if (!hasHandler) continue
      if (!content.includes('.auth.getUser(')) missing.push(rel)
    }
    expect(missing, `Routes missing getUser(): ${missing.join(', ')}`).toHaveLength(0)
  })
})

// ── 2. Soft-delete tables must always filter deleted_at ───────────────────────

describe('Anti-pattern #4: missing is(\'deleted_at\', null) on soft-delete tables', () => {
  const softDeleteTables = ['tasks', 'clients', 'invoices'] as const

  for (const table of softDeleteTables) {
    it(`every SELECT on '${table}' includes is('deleted_at', null)`, () => {
      const routes = collectRoutes()
      const violations: string[] = []

      for (const { rel, content } of routes) {
        const pattern = new RegExp(`\\.from\\(['"\`]${table}['"\`]\\)`, 'g')
        let m: RegExpExecArray | null

        while ((m = pattern.exec(content)) !== null) {
          // Look at 700 chars of context after the .from() call
          const ctx = content.slice(m.index, m.index + 700)

          // Identify the first verb after .from(...)
          const firstVerb = ctx.match(/\.(insert|upsert|update|delete|select)\s*\(/)
          if (!firstVerb) continue

          // Skip all write operations — including update-then-select (returning rows after write)
          // Only SELECT-first queries need the deleted_at filter
          if (firstVerb[1] !== 'select') continue

          if (!ctx.includes('deleted_at')) {
            violations.push(
              `${rel} — .from('${table}') at offset ${m.index} missing deleted_at filter`
            )
          }
        }
      }

      expect(violations, violations.join('\n')).toHaveLength(0)
    })
  }
})

// ── 3. Profile creation must never auto-assign role = 'admin' ────────────────

describe('Anti-pattern #5: role auto-assigned as admin on signup', () => {
  it('no route inserts/upserts a profile with hardcoded role: admin', () => {
    const routes = collectRoutes()
    const violations: string[] = []

    for (const { rel, content } of routes) {
      // Multi-line aware: look for from('profiles')...(insert|upsert) that contains role:'admin'
      const insertBlocks = content.matchAll(
        /\.from\(['"]profiles['"]\)[\s\S]{0,300}?\.(insert|upsert)\s*\(/g
      )
      for (const block of insertBlocks) {
        const body = content.slice(block.index!, block.index! + 500)
        if (/role\s*:\s*['"]admin['"]/.test(body)) violations.push(rel)
      }
    }

    expect(violations, `Auto-admin role in: ${violations.join(', ')}`).toHaveLength(0)
  })
})

// ── 4. No fire-and-forget .catch() on Supabase calls ─────────────────────────

describe('Anti-pattern #2: .catch() on PostgrestFilterBuilder', () => {
  it('no bare .catch() appended to supabase query chains', () => {
    const routes = collectRoutes()
    const violations: string[] = []

    for (const { rel, content } of routes) {
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (/^\s*\/\//.test(line)) continue                    // skip comments
        if (/Promise\.(all|allSettled|race)/.test(line)) continue // legit usage
        // Flag lines that chain .catch( onto what looks like a query result
        if (/\)\s*\.catch\s*\(/.test(line) && !/await\s/.test(line)) {
          // Skip if this closes a multi-line expression that was already awaited on a previous line
          if (/^\s*\}?\)\s*\.catch/.test(line)) {
            const prevLines = lines.slice(Math.max(0, i - 10), i)
            if (prevLines.some(l => /\bawait\b/.test(l))) continue
          }
          violations.push(`${rel}:${i + 1}: ${line.trim()}`)
        }
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0)
  })
})

// ── 5. No void async IIFE fire-and-forget ────────────────────────────────────

describe('Anti-pattern #1: void async fire-and-forget', () => {
  it('no void (async () => { ... })() pattern in API routes', () => {
    const routes = collectRoutes()
    const violations: string[] = []

    for (const { rel, content } of routes) {
      if (/void\s*\(\s*async\s*\(/.test(content)) violations.push(rel)
    }

    expect(violations, `void async IIFE in: ${violations.join(', ')}`).toHaveLength(0)
  })
})

// ── 6. Block-scoped variable referenced across try/catch ─────────────────────

describe('Anti-pattern #3: const declared inside try, used in catch', () => {
  it('no const/let declared inside try block and referenced in catch', () => {
    const routes = collectRoutes()
    const violations: string[] = []

    for (const { rel, content } of routes) {
      // Heuristic: look for catch blocks that reference variables not declared before the try
      const tryCatchBlocks = content.matchAll(
        /\btry\s*\{([\s\S]*?)\}\s*catch\s*[({]([\s\S]*?)\}/g
      )
      for (const [, tryBody, catchBody] of tryCatchBlocks) {
        // Strip string literals to avoid false positives from variable names appearing in strings
        const catchBodyStripped = catchBody.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '')
        const constDecls = [...tryBody.matchAll(/\b(?:const|let)\s+(\w+)/g)].map(m => m[1])
        for (const name of constDecls) {
          // Skip if the same name is also declared in catch (re-declaration, not a scope violation)
          const isDeclaredInCatch = new RegExp(`\\b(?:const|let)\\s+${name}\\b`).test(catchBodyStripped)
          if (!isDeclaredInCatch && new RegExp(`\\b${name}\\b`).test(catchBodyStripped)) {
            violations.push(`${rel}: '${name}' declared in try, used in catch`)
          }
        }
      }
    }

    expect(violations, violations.join('\n')).toHaveLength(0)
  })
})
