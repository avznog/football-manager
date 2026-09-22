# Next.js 16.3.6 Framework Conventions

**This is NOT the Next.js you know.** Next.js 16 has breaking changes versus 13–15. This document is the single source of truth for framework conventions on this project.

All paths below are relative to `node_modules/next/dist/docs/`.

---

## 1. Breaking Changes That Will Bite Us

### 1.1 Async Request APIs (BREAKING)
**Source:** `01-app/02-guides/upgrading/version-16.md` lines 281–293

All request-time APIs are now **fully async**. Synchronous access is removed.

```ts
// ❌ WRONG (Next 15 compatibility mode, removed in 16)
const cookieStore = cookies()
const headersList = headers()
const { slug } = params

// ✅ CORRECT (Next 16)
const cookieStore = await cookies()
const headersList = await headers()
const { slug } = await params
```

**Affected APIs:**
- `cookies()` from `next/headers`
- `headers()` from `next/headers`
- `draftMode()` from `next/headers`
- `params` in `layout.js`, `page.js`, `route.js`, `default.js`, `opengraph-image`, `twitter-image`, `icon`, `apple-icon`
- `searchParams` in `page.js`

**Migration:** Run `npx @next/codemod@canary next-async-request-api .`

**Type helpers:** Use `npx next typegen` to generate `PageProps`, `LayoutProps`, `RouteContext` for type-safe async params/searchParams.

### 1.2 Async `id` in metadata image functions (BREAKING)
**Source:** `01-app/02-guides/upgrading/version-16.md` lines 318–352

```ts
// ❌ WRONG (Next 15)
export default function Image({ params, id }) {
  const slug = params.slug // sync
  const imageId = id // string
}

// ✅ CORRECT (Next 16)
export default async function Image({ params, id }) {
  const { slug } = await params // async
  const imageId = await id // Promise<string>
}
```

`generateImageMetadata` still receives sync `params`. Only the image function receives async `params` and `id`.

### 1.3 Async `id` in `sitemap` (BREAKING)
**Source:** `01-app/02-guides/upgrading/version-16.md` lines 354–382

```ts
// ❌ WRONG (Next 15)
export default async function sitemap({ id }) {
  const start = id * 50000 // id is number
}

// ✅ CORRECT (Next 16)
export default async function sitemap({ id }) {
  const resolvedId = await id // Promise<string>
  const start = Number(resolvedId) * 50000
}
```

### 1.4 `middleware.ts` → `proxy.ts` (BREAKING)
**Source:** `01-app/02-guides/upgrading/version-16.md` lines 612–658  
**Source:** `01-app/03-api-reference/03-file-conventions/proxy.md` lines 1–50

The `middleware` filename and export are **deprecated** → rename to `proxy`.

```bash
mv middleware.ts proxy.ts
```

```ts
// ❌ WRONG
export function middleware(request: Request) {}

// ✅ CORRECT
export function proxy(request: NextRequest) {}
```

**Runtime:** `proxy` runs on `nodejs` runtime only. The `edge` runtime is **NOT supported**. If you need edge, keep using `middleware.ts` (deprecated but still works).

**Config:** `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`

### 1.5 `revalidateTag` requires second argument (BREAKING)
**Source:** `01-app/02-guides/upgrading/version-16.md` lines 442–452

```ts
// ❌ WRONG
revalidateTag('posts')

// ✅ CORRECT
revalidateTag('posts', 'max') // 'max' = stale-while-revalidate
```

For **immediate** expiry (read-your-writes), use `updateTag` instead (Server Actions only).

### 1.6 `fetch` and database queries are NOT cached by default (BREAKING)
**Source:** `01-app/01-getting-started/06-fetching-data.md` lines 60–62

```ts
// This does NOT cache by default in 16
const data = await fetch('https://api.example.com/posts')
```

**To cache:** Use `'use cache'` directive + `cacheLife` (requires `cacheComponents: true` in config).

### 1.7 Turbopack is default for `next dev` and `next build` (BREAKING)
**Source:** `01-app/02-guides/upgrading/version-16.md` lines 126–178

Remove `--turbopack` flags from `package.json`. If you have custom `webpack` config, the build **will fail**. Options:
- Migrate to Turbopack config (top-level `turbopack` key, not `experimental.turbopack`)
- Use `--webpack` flag to opt out

Sass imports: Remove `~` prefix from `node_modules` imports.

```scss
/* ❌ WRONG */
@import '~bootstrap/dist/css/bootstrap.min.css';

/* ✅ CORRECT */
@import 'bootstrap/dist/css/bootstrap.min.css';
```

### 1.8 Parallel routes require `default.js` (BREAKING)
**Source:** `01-app/02-guides/upgrading/version-16.md` lines 932–951

All parallel route slots (`@modal`, `@sidebar`, etc.) **must** have a `default.js` file.

```tsx filename="app/@modal/default.tsx"
import { notFound } from 'next/navigation'
export default function Default() {
  notFound() // or return null
}
```

### 1.9 Node.js 20.9+ required (BREAKING)
**Source:** `01-app/02-guides/upgrading/version-16.md` lines 118–124

- Node.js 18 no longer supported
- Minimum: Node.js 20.9.0 (LTS)
- TypeScript minimum: 5.1.0

### 1.10 `next/image` breaking changes
**Source:** `01-app/02-guides/upgrading/version-16.md` lines 661–865

- Local images with query strings require `images.localPatterns.search` config
- `images.minimumCacheTTL` default: 60s → 4 hours (14400s)
- `images.imageSizes` default: `[32, 48, 64, 96, 128, 256, 384]` (removed `16`)
- `images.qualities` default: `[75]` (was all qualities)
- `images.maximumRedirects` default: 3 (was unlimited)
- `images.domains` deprecated → use `images.remotePatterns`
- `next/legacy/image` deprecated → use `next/image`

---

## 2. File Conventions (Correct Signatures)

### 2.1 `layout.js`
**Source:** `01-app/03-api-reference/03-file-conventions/layout.md` lines 1–200

```tsx
export default async function Layout({
  children,
  params, // Promise<{ [key: string]: string }>
}: {
  children: React.ReactNode
  params: Promise<{ [key: string]: string }>
}) {
  const { slug } = await params
  return <section>{children}</section>
}
```

**Root layout** (required at `app/layout.tsx`):
- **MUST** define `<html>` and `<body>` tags
- **DO NOT** manually add `<head>`, `<title>`, `<meta>` → use Metadata API
- Can be under a dynamic segment (`app/[lang]/layout.js`)

**Caveats:**
- Layouts do **not** rerender on navigation → cannot access `searchParams` or request object directly
- To read cookies/headers in layout: wrap the access in `<Suspense>` or move it down the tree
- Use `LayoutProps<'/path'>` helper for typed `params` + named slots

### 2.2 `page.js`
**Source:** `01-app/03-api-reference/03-file-conventions/page.md` lines 1–200

```tsx
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = await params
  const filters = (await searchParams).filters
  return <h1>Blog Post: {slug}</h1>
}
```

- `params` and `searchParams` are **Promises** → must `await`
- `searchParams` opts page into **dynamic rendering** (request-time)
- Use `PageProps<'/blog/[slug]'>` helper for typed props

### 2.3 `route.js` (Route Handlers)
**Source:** `01-app/01-getting-started/15-route-handlers.md` lines 1–200

```ts
import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  return Response.json({ id })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  // mutation logic
  return Response.json({ success: true })
}
```

**Supported methods:** `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`

**Caching (without Cache Components):**
- NOT cached by default
- Opt-in: `export const dynamic = 'force-static'` (GET only)

**Caching (with `cacheComponents: true`):**
- Static if no runtime/uncached data access
- Use `'use cache'` in a helper function to cache DB queries
- `use cache` **cannot** be directly inside route handler body → extract to helper

Use `RouteContext<'/api/users/[id]'>` for typed `params`.

### 2.4 `proxy.js`
**Source:** `01-app/03-api-reference/03-file-conventions/proxy.md` lines 1–200

```ts
import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  // Optimistic checks only (cookie, not DB)
  const session = request.cookies.get('session')?.value
  if (!session && protectedRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}
```

**Key rules:**
- Runs on **every** request (including prefetches) → keep fast, optimistic checks only
- Runtime: `nodejs` only (no `edge`)
- Can read `cookies()` async: `const cookieStore = await cookies()`
- **DO NOT** query the database in proxy → use layouts or DAL for secure checks

---

## 3. Server vs Client Components

**Source:** `01-app/01-getting-started/05-server-and-client-components.md` lines 1–605

### When to use Server Components
- Fetch data from databases/APIs close to the source
- Keep secrets (API keys, tokens) on server
- Reduce client JS bundle

### When to use Client Components
- State, event handlers (`onClick`, `onChange`)
- Lifecycle (`useEffect`)
- Browser APIs (`localStorage`, `window`)
- Custom hooks

### Passing data Server → Client
```tsx
// Server Component
import LikeButton from './like-button'

export default async function Page({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  const post = await getPost(slug)
  return <LikeButton likes={post.likes} /> // props must be serializable
}
```

```tsx
// Client Component
'use client'
import { useState } from 'react'

export default function LikeButton({ likes }: { likes: number }) {
  const [count, setCount] = useState(likes)
  return <button onClick={() => setCount(count + 1)}>{count} likes</button>
}
```

**Interleaving:** You can pass Server Components as `children` to Client Components. They render on the server first, then slot into the client tree.

**Context providers:** Create in Client Component, import into Server Component (layout). Render providers as deep as possible.

---

## 4. Data Fetching

**Source:** `01-app/01-getting-started/06-fetching-data.md` lines 1–689

### In Server Components

#### With `fetch` API
```tsx
export default async function Page() {
  const data = await fetch('https://api.vercel.app/blog')
  const posts = await data.json()
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}
```

- Identical `fetch` requests are memoized (per-request)
- **NOT cached by default** in 16 → use `'use cache'` + `cacheLife` to cache

#### With ORM/database
```tsx
import { db, posts } from '@/lib/db'

export default async function Page() {
  const allPosts = await db.select().from(posts)
  return <ul>{allPosts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}
```

### Reusing data with `React.cache`
```ts
import { cache } from 'react'
import { db, eq, users } from '@/lib/db'

export const getUser = cache(async (id: string) => {
  return db.query.users.findFirst({ where: eq(users.id, id) })
})
```

Calls with same `id` in one request return memoized result. Scoped to **current request only**.

### Streaming with `<Suspense>`
```tsx
import { Suspense } from 'react'

async function LatestPosts() {
  const data = await fetch('https://api.example.com/posts')
  const posts = await data.json()
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}

export default function Page() {
  return (
    <>
      <h1>My Blog</h1>
      <Suspense fallback={<p>Loading posts...</p>}>
        <LatestPosts />
      </Suspense>
    </>
  )
}
```

**Without `<Suspense>`** around uncached data → dev overlay surfaces `blocking-route` insight.

### Preloading
```tsx
async function getItem(id: string) {
  const res = await fetch(`https://api.example.com/items/${id}`)
  return res.json()
}

export const preload = (id: string) => {
  void getItem(id) // start fetch without await
}

export default async function Item({ id }: { id: string }) {
  const item = await getItem(id) // reuse in-flight fetch
  return <div>{item.name}</div>
}
```

Call `preload(id)` before blocking work to start fetch earlier.

---

## 5. Mutations (Server Actions)

**Source:** `01-app/01-getting-started/07-mutating-data.md` lines 1–600

### Creating Server Actions

```ts filename="app/actions.ts"
'use server'
import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  const title = formData.get('title')
  const content = formData.get('content')

  // Mutate data
  await db.insert(posts).values({ title, content, userId: session.user.id })

  // Revalidate cache
  revalidatePath('/posts')

  // Redirect (throws, so no code after runs)
  redirect('/posts')
}
```

### Form with Server Action

```tsx filename="app/ui/form.tsx"
import { createPost } from '@/app/actions'

export function Form() {
  return (
    <form action={createPost}>
      <input type="text" name="title" />
      <input type="text" name="content" />
      <button type="submit">Create</button>
    </form>
  )
}
```

### Validation + Error Handling

```ts filename="app/actions.ts"
'use server'
import { auth } from '@/lib/auth'

export async function createPost(state: FormState, formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  const validatedFields = SignupFormSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  })

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors }
  }

  // Mutate data
  // ...
}
```

```tsx filename="app/ui/form.tsx"
'use client'
import { useActionState } from 'react'
import { createPost } from '@/app/actions'

export function Form() {
  const [state, action, pending] = useActionState(createPost, undefined)

  return (
    <form action={action}>
      <input type="text" name="title" />
      {state?.errors?.title && <p>{state.errors.title}</p>}
      <button disabled={pending} type="submit">Create</button>
    </form>
  )
}
```

### `redirect()` gotcha
**Source:** `01-app/03-api-reference/04-functions/redirect.md` lines 50–53

`redirect()` **throws** an error, so it should be called **outside** `try/catch` blocks.

```ts
// ✅ CORRECT
export async function createPost(formData: FormData) {
  try {
    await db.insert(posts).values(...)
  } catch (error) {
    return { error: 'Failed to create post' }
  }
  revalidatePath('/posts')
  redirect('/posts') // outside try/catch
}

// ❌ WRONG
export async function createPost(formData: FormData) {
  try {
    await db.insert(posts).values(...)
    redirect('/posts') // throws, caught by catch block
  } catch (error) {
    return { error: 'Failed to create post' }
  }
}
```

In Server Actions: `redirect` uses `push` (adds to history). Elsewhere: uses `replace`.

---

## 6. Authentication (Session Cookie Pattern)

**Source:** `01-app/02-guides/authentication.md` lines 1–1658

### Reading cookies (Server Components)
```tsx
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value || 'light'
  return <p>Theme: {theme}</p>
}
```

### Setting cookies (Server Actions only)
```ts filename="app/lib/session.ts"
'use server'
import { cookies } from 'next/headers'

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const session = await encrypt({ userId, expiresAt }) // your JWT/encryption

  const cookieStore = await cookies()
  cookieStore.set('session', session, {
    httpOnly: true,
    secure: true,
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}
```

**Cookies MUST be set server-side** (Server Action or Route Handler).

### Route protection strategy

#### Option 1: Proxy (optimistic checks only)
**Source:** `01-app/02-guides/authentication.md` lines 1026–1121

```tsx filename="proxy.ts"
import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/app/lib/session'
import { cookies } from 'next/headers'

const protectedRoutes = ['/dashboard']
const publicRoutes = ['/login', '/signup', '/']

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isProtectedRoute = protectedRoutes.includes(path)
  const isPublicRoute = publicRoutes.includes(path)

  const cookie = (await cookies()).get('session')?.value
  const session = await decrypt(cookie)

  if (isProtectedRoute && !session?.userId) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }

  if (isPublicRoute && session?.userId && !req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}
```

**Proxy runs on prefetches** → only read cookie (optimistic), **never** query DB.

#### Option 2: Data Access Layer (secure checks)
**Source:** `01-app/02-guides/authentication.md` lines 1131–1233

```tsx filename="app/lib/dal.ts"
import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { decrypt } from '@/app/lib/session'
import { redirect } from 'next/navigation'

export const verifySession = cache(async () => {
  const cookie = (await cookies()).get('session')?.value
  const session = await decrypt(cookie)

  if (!session?.userId) {
    redirect('/login')
  }

  return { isAuth: true, userId: session.userId }
})

export const getUser = cache(async () => {
  const session = await verifySession()
  if (!session) return null

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: { id: true, name: true, email: true },
  })

  return user
})
```

Call `verifySession()` in **Server Components, Server Actions, Route Handlers** (not in layouts unless wrapped in `<Suspense>`).

**Recommended:** Use **both** — proxy for fast redirects, DAL for secure data access.

---

## 7. Caching (Cache Components Model)

**Source:** `01-app/01-getting-started/08-caching.md` lines 1–610  
**Source:** `01-app/03-api-reference/01-directives/use-cache.md` lines 1–782

> **CORRECTION (verified against `next.config.ts`).** This project does **NOT** enable
> `cacheComponents`, and deliberately will not. Consequences for anything you write here:
>
> - **Do not use `'use cache'`, `cacheLife()` or `cacheTag()`** anywhere in this codebase.
> - Every page is dynamic and every database read is fresh on every request. That is exactly
>   what we want: availability, live scores and ratings must never be served stale.
> - `cookies()` and `headers()` in a layout or page are fine and simply opt that route into
>   dynamic rendering. You do **not** need to wrap them in `<Suspense>` for correctness.
> - `<Suspense>` is therefore a UX choice (streaming a slow section), not a build requirement.
>
> The rest of this section is background on a model we are not using. Read it only if someone
> later proposes enabling `cacheComponents`.

### Default behavior (no caching)
```tsx
export default async function Page() {
  const data = await fetch('https://api.example.com/data') // NOT cached
  return <div>{data}</div>
}
```

### Caching with `'use cache'`

```tsx filename="app/lib/data.ts"
import { cacheLife } from 'next/cache'

export async function getProducts() {
  'use cache'
  cacheLife('hours') // ALWAYS pair with cacheLife
  return db.query('SELECT * FROM products')
}
```

**Profiles:** `seconds`, `minutes`, `hours`, `days`, `weeks`, `max`, `default` (5m stale, 15m revalidate, never expire).

**Short-lived caches** (`seconds`, `revalidate: 0`, `expire` < 5min) are excluded from prerender → become dynamic holes.

### Streaming uncached data
```tsx
import { Suspense } from 'react'

async function LatestPosts() {
  const data = await fetch('https://api.example.com/posts')
  const posts = await data.json()
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}

export default function Page() {
  return (
    <>
      <h1>My Blog</h1>
      <Suspense fallback={<p>Loading posts...</p>}>
        <LatestPosts />
      </Suspense>
    </>
  )
}
```

**Without `<Suspense>`** → build-time error with fix suggestions in dev overlay.

### Runtime APIs (`cookies`, `headers`, `searchParams`)
Wrap in `<Suspense>` or pass values as arguments to cached functions.

```tsx filename="app/profile/page.tsx"
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProfileContent />
    </Suspense>
  )
}

async function ProfileContent() {
  const session = (await cookies()).get('session')?.value
  return <CachedContent sessionId={session} />
}

async function CachedContent({ sessionId }: { sessionId: string }) {
  'use cache'
  cacheLife('hours')
  const data = await fetchUserData(sessionId)
  return <div>{data}</div>
}
```

### Random values and timestamps
**Source:** `01-app/01-getting-started/08-caching.md` lines 323–383

```tsx
import { connection } from 'next/server'
import { Suspense } from 'react'

async function UniqueContent() {
  await connection() // opt into request-time
  const uuid = crypto.randomUUID()
  return <p>Request ID: {uuid}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <UniqueContent />
    </Suspense>
  )
}
```

Or cache the value so all users see the same:
```tsx
export default async function Page() {
  'use cache'
  cacheLife('hours')
  const buildId = crypto.randomUUID()
  return <p>Build ID: {buildId}</p>
}
```

### Revalidation

#### Time-based
```tsx
import { cacheLife } from 'next/cache'

async function getData() {
  'use cache'
  cacheLife('hours') // revalidate every hour
  return fetch('https://api.example.com/data')
}
```

#### On-demand (tag-based)
```tsx filename="app/lib/data.ts"
import { cacheTag } from 'next/cache'

export async function getProducts() {
  'use cache'
  cacheTag('products')
  return db.query('SELECT * FROM products')
}
```

```tsx filename="app/actions.ts"
'use server'
import { updateTag } from 'next/cache'

export async function updateProduct() {
  await db.products.update(...)
  updateTag('products') // immediate expiry + refresh
}
```

**`updateTag` vs `revalidateTag`:**
- `updateTag`: immediate expiry (read-your-writes), Server Actions only
- `revalidateTag`: stale-while-revalidate, Server Actions + Route Handlers

---

## 8. Route Handlers (POST endpoint for match events)

**Source:** `01-app/01-getting-started/15-route-handlers.md` lines 1–200

```ts filename="app/api/match-events/route.ts"
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db, matchEvents } from '@/lib/db'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await request.json()
  // Idempotent insert logic
  await db.insert(matchEvents).values(body).onConflictDoNothing()

  return Response.json({ success: true })
}
```

**With `cacheComponents: true`:**
- Route handlers follow same prerender model as pages
- Static if no runtime/uncached data access
- Use `'use cache'` in helper functions (not directly in handler body)

---

## 9. Tailwind CSS v4

**Source:** `01-app/01-getting-started/11-css.md` lines 22–113  
**Source:** `app/globals.css` lines 1–27

### Configuration (NO `tailwind.config.js`)

```mjs filename="postcss.config.mjs"
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

```css filename="app/globals.css"
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}
```

**Design tokens:** Define in `@theme inline` block in `globals.css`.  
**Dark mode:** Use `@media (prefers-color-scheme: dark)` or `data-theme` attribute strategy.

---

## 10. PWA Manifest

**Source:** `01-app/02-guides/progressive-web-apps.md` (referenced in upgrade guide)

Use `app/manifest.ts` (or `.json`):

```ts filename="app/manifest.ts"
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Football Manager',
    short_name: 'FM',
    description: 'Football match management app',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
```

No push notifications → omit `gcm_sender_id`.

---

## 11. DO NOT Do This (LLM Trained on 13-15)

1. **DO NOT** access `params` or `searchParams` synchronously → always `await`
2. **DO NOT** call `cookies()` or `headers()` synchronously → always `await`
3. **DO NOT** use `middleware.ts` → use `proxy.ts`
4. **DO NOT** call `revalidateTag('tag')` without second arg → `revalidateTag('tag', 'max')`
5. **DO NOT** assume `fetch` or a DB query is cached — nothing is. (And in *this* project, do
   not reach for `'use cache'` to fix that: we want everything fresh. See the correction in §7.)
6. **DO NOT** use `experimental.turbopack` config → use top-level `turbopack`
7. **DO NOT** use `experimental.ppr` → use `cacheComponents: true`
8. **DO NOT** use `experimental.dynamicIO` or `experimental.useCache` → removed, use `cacheComponents`
9. **DO NOT** query DB in `proxy.ts` → only optimistic checks (cookie read)
10. **DO NOT** use `next/legacy/image` or `images.domains` → use `next/image` + `images.remotePatterns`
11. **DO NOT** call `redirect()` inside `try/catch` → throws, call outside
12. **DO NOT** use `serverRuntimeConfig` or `publicRuntimeConfig` → use env vars
13. **DO NOT** use `~` prefix in Sass imports → direct `node_modules` import
14. **DO NOT** forget `default.js` for parallel routes → build fails
15. **DO NOT** use `unstable_cacheLife` or `unstable_cacheTag` → stable, no prefix
16. **DO NOT** use `--turbopack` flag in scripts → default now
17. **DO NOT** use `export const config = { amp: true }` → AMP removed
18. **DO NOT** use `next lint` → use ESLint CLI directly
19. **DO NOT** use sync `React.cache` across `use cache` boundaries → isolated scopes
20. **DO NOT** use `Math.random()` or `Date.now()` without `connection()` or `'use cache'`

---

## 12. Critical Patterns for This Project

### Auth guard (layout + DAL)
```tsx filename="app/dashboard/layout.tsx"
import { Suspense } from 'react'
import { verifySession } from '@/lib/dal'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Suspense fallback={<nav>Loading...</nav>}>
        <AuthNav />
      </Suspense>
      {children}
    </div>
  )
}

async function AuthNav() {
  const session = await verifySession() // redirects if not authed
  const user = await getUser(session.userId)
  return <nav>Welcome, {user.name}</nav>
}
```

### Drizzle query in Server Component
```tsx filename="app/matches/page.tsx"
import { db, matches } from '@/lib/db'

export default async function MatchesPage() {
  const allMatches = await db.select().from(matches).orderBy(matches.date)
  return (
    <ul>
      {allMatches.map(m => <li key={m.id}>{m.homeTeam} vs {m.awayTeam}</li>)}
    </ul>
  )
}
```

### Server Action with Drizzle + revalidation
```ts filename="app/actions.ts"
'use server'
import { auth } from '@/lib/auth'
import { db, matchEvents } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createMatchEvent(formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  const matchId = formData.get('matchId')
  const eventType = formData.get('eventType')
  const timestamp = formData.get('timestamp')

  await db.insert(matchEvents).values({
    matchId,
    eventType,
    timestamp,
    createdBy: session.user.id,
  })

  revalidatePath(`/matches/${matchId}`)
  redirect(`/matches/${matchId}`)
}
```

### Interactive client component (drag-and-drop pitch)
```tsx filename="app/ui/pitch.tsx"
'use client'
import { useState, useEffect } from 'react'

export default function Pitch({ initialPlayers }: { initialPlayers: Player[] }) {
  const [players, setPlayers] = useState(initialPlayers)
  
  useEffect(() => {
    // Setup drag listeners
    return () => {} // cleanup
  }, [])

  return <div className="pitch">{/* interactive UI */}</div>
}
```

Fetch `initialPlayers` in Server Component, pass as props.

---

## Summary: Top 10 Critical Differences from Next 15

1. **Async Request APIs** — `params`, `searchParams`, `cookies()`, `headers()` are now **Promises**
2. **`middleware.ts` → `proxy.ts`** — rename + `edge` runtime removed
3. **`fetch` NOT cached by default** — need `'use cache'` + `cacheLife`
4. **`revalidateTag` requires 2nd arg** — `revalidateTag('tag', 'max')`
5. **Turbopack is default** — remove `--turbopack` flag, migrate or use `--webpack`
6. **Parallel routes need `default.js`** — build fails without
7. **Async `id` in `sitemap` and metadata images** — must `await id`
8. **`cacheComponents` replaces `experimental.ppr`** — different model, not a rename
9. **`next/image` config changes** — `minimumCacheTTL` 4h, `qualities` [75], `maximumRedirects` 3
10. **Node 20.9+ required** — Node 18 dropped

**Always check the bundled docs first.** If the above contradicts your prior knowledge, the above is correct for Next.js 16.
