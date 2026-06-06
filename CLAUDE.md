@AGENTS.md

## Git Workflow
- Always develop directly on `main` branch — do NOT create feature branches
- Commit and push to `main` after every meaningful change
- Never merge or rebase from other branches

## Bug Discovery Rule — Fix Everywhere, Not Just Once
When any bug or anti-pattern is discovered and fixed, **immediately search the entire codebase** for the same pattern and fix all occurrences before closing the task. Never fix a bug in one place and leave identical bugs elsewhere.

### Known Anti-Patterns to Always Scan For

**1. Fire-and-forget async on Vercel serverless**
Pattern: `someAsyncFn().catch(...)` or `void (async () => { ... })()`
Risk: Vercel terminates the function after HTTP response — async work may never complete.
Fix: `try { await someAsyncFn() } catch (err) { console.error(err) }`
Scan: `grep -rn "void (async\|\.catch(" src/app/api/`

**2. `.catch()` on Supabase PostgrestFilterBuilder**
Pattern: `supabase.from('x').insert({}).catch(() => {})`
Risk: PostgrestFilterBuilder has no `.catch()` method → TypeScript error + runtime failure.
Fix: `try { await supabase.from('x').insert({}) } catch {}`
Scan: `grep -rn "\.from(.*\(insert\|update\|delete\|upsert\).*\.catch(" src/app/api/`

**3. Block-scoped variables referenced across try/catch**
Pattern: `try { const x = ... } catch { use(x) }` — `x` is not in scope in `catch`
Fix: Declare `let x` before the `try` block.
Scan: Look in any file with try/catch that uses a variable from the try block in catch.

**4. Missing `is('deleted_at', null)` filter on soft-deleted tables**
Tables with soft-delete (`deleted_at` column): `tasks`, `clients`, `invoices`
Risk: Deleted records appear in queries, reports, notifications.
Fix: Add `.is('deleted_at', null)` to every query on those tables.
Scan: `grep -rn "\.from('tasks\|clients\|invoices')" src/app/api/` and check each lacks the filter.

**5. Role auto-assigned as `admin` on signup**
Pattern: `role: 'admin'` in profile auto-create/upsert code.
Risk: Any new signup gets admin privileges.
Fix: Default role must be `'video_maker'` (or another non-admin role).
Scan: `grep -rn "role:.*admin" src/app/api/`

**6. Missing auth/role check on API routes**
Risk: Unauthenticated or unauthorized users can access sensitive data.
Fix: Every route must call `supabase.auth.getUser()` and check role before any DB operation.
Scan: Review all files in `src/app/api/` for routes missing `getUser()` or role checks.
