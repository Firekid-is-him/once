<div align="center">

# @firekid/once

[![npm version](https://img.shields.io/npm/v/@firekid/once?style=flat-square&logo=npm&logoColor=white&color=CB3837)](https://npmjs.com/package/@firekid/once)
[![npm downloads](https://img.shields.io/npm/dm/@firekid/once?style=flat-square&logo=npm&logoColor=white&color=CB3837)](https://npmjs.com/package/@firekid/once)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/@firekid/once?style=flat-square&logo=webpack&logoColor=white&color=2563EB)](https://bundlephobia.com/package/@firekid/once)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Firekid-is-him/once?style=flat-square&logo=github&logoColor=white&color=FACC15)](https://github.com/Firekid-is-him/once/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Firekid-is-him/once?style=flat-square&logo=github&logoColor=white&color=8B5CF6)](https://github.com/Firekid-is-him/once/network/members)
[![CI](https://img.shields.io/github/actions/workflow/status/Firekid-is-him/once/ci.yml?style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/Firekid-is-him/once/actions)

The modern, memory-safe replacement for `inflight`.  
Deduplicate async function calls. Zero dependencies. Full TypeScript support.

</div>

---

## The Problem

`inflight` has a memory leak. It never cleans up its internal map after callbacks run, which causes Node.js heap crashes in long-running processes. It also uses callbacks instead of Promises, has no TypeScript support, and only runs in Node.

`@firekid/once` fixes all of it.

## Installation

```bash
npm install @firekid/once
yarn add @firekid/once
pnpm add @firekid/once
```

## Quick Start

```ts
import { once } from '@firekid/once'

const getUser = once(async (id: string) => {
  return await db.query('SELECT * FROM users WHERE id = ?', [id])
})

const [a, b, c] = await Promise.all([
  getUser('123'),
  getUser('123'),
  getUser('123'),
])

// Only 1 DB query fired. All 3 get the same result.
```

## Core Behavior

When the same async function is called multiple times with the same arguments before the first call resolves, `once` deduplicates — only one invocation runs and all callers receive the same result.

After the promise settles (resolve or reject), the entry is automatically removed from the internal map. No memory leak. Ever.

Errors are propagated to all waiting callers. After a rejection, the key is cleared so the next call retries cleanly.

## API

### once(fn, options?)

Wraps an async function with deduplication.

```ts
once(fn, options?)
```

```ts
type OnceOptions<TArgs> = {
  key?: string | ((...args: TArgs) => string)
  ttl?: number
  maxKeys?: number
  onDeduplicated?: (key: string) => void
}
```

Returns an `OnceInstance` which is callable and also has `.clear()`, `.size()`, and `.has()` methods.

### createOnce(defaults?)

Creates a factory with default options applied to every wrapped function.

```ts
const wrap = createOnce({ ttl: 5000 })

const getUser = wrap(async (id: string) => fetchUser(id))
const getPosts = wrap(async (userId: string) => fetchPosts(userId))
```

## Options

### key

By default the key is generated from the function arguments via `JSON.stringify`. You can override this with a static string or a function.

```ts
const fn = once(fetchConfig, { key: 'config' })

const fn = once(fetchUser, {
  key: (id, _role) => `user:${id}`
})
```

### ttl

Keep the result in the dedup window for a number of milliseconds after the promise resolves. All calls within that window return the cached result without re-executing.

```ts
const fn = once(fetchConfig, { ttl: 5000 })

const first = await fn()
await sleep(3000)
const second = await fn() // returned from dedup window
await sleep(3000)
const third = await fn()  // ttl expired, executes again
```

### maxKeys

Limit the number of in-flight keys tracked simultaneously. When the limit is reached, additional calls bypass deduplication and execute directly.

```ts
const fn = once(fetchUser, { maxKeys: 100 })
```

### onDeduplicated

Called every time a call is deduplicated instead of executed. Useful for logging and metrics.

```ts
const fn = once(fetchUser, {
  onDeduplicated: (key) => {
    metrics.increment('dedup.hit', { key })
  }
})
```

## Instance Methods

```ts
const fn = once(fetchUser)

fn.clear()         // clear all in-flight entries
fn.clear('123')    // clear a specific key
fn.size()          // number of currently in-flight keys
fn.has('123')      // whether a key is currently in-flight
```

## Error Handling

Errors are shared across all concurrent callers and the key is immediately cleared after rejection, allowing clean retries.

```ts
const fn = once(async (id: string) => {
  return await riskyOperation(id)
})

const results = await Promise.allSettled([fn('x'), fn('x'), fn('x')])

const result = await fn('x') // retries cleanly after rejection
```

## Real World Examples

### API route — deduplicate DB calls

```ts
import { once } from '@firekid/once'

const getUser = once(async (id: string) => {
  return await db.users.findUnique({ where: { id } })
}, { ttl: 2000 })

app.get('/users/:id', async (req, res) => {
  const user = await getUser(req.params.id)
  res.json(user)
})
```

### NestJS provider

```ts
import { Injectable } from '@nestjs/common'
import { once } from '@firekid/once'

@Injectable()
export class UserService {
  private getUser = once(async (id: string) => {
    return this.userRepo.findOne(id)
  }, { ttl: 3000 })

  find(id: string) {
    return this.getUser(id)
  }
}
```

### Config loading — load once, reuse everywhere

```ts
import { once } from '@firekid/once'

const loadConfig = once(async () => {
  return await fetch('/api/config').then(r => r.json())
})

const config = await loadConfig()
```

### Replace inflight directly

```ts
import { once } from '@firekid/once'

const fn = once(async () => {
  return await myAsyncOperation()
}, { key: 'my-key' })

await fn()
```

## TypeScript

```ts
import { once, OnceOptions, OnceInstance } from '@firekid/once'

type User = { id: string; name: string }

const getUser: OnceInstance<[string], User> = once(
  async (id: string): Promise<User> => fetchUser(id),
  { ttl: 5000 }
)

const user = await getUser('123')
user.name
```

## Response Shape

```ts
type OnceInstance<TArgs, TResult> = {
  (...args: TArgs): Promise<TResult>
  clear: (key?: string) => void
  size: () => number
  has: (key: string) => boolean
}
```

## Environment Support

Works anywhere a JavaScript Promise is available.

- Node.js 18 and above
- Cloudflare Workers
- Vercel Edge Functions
- Deno
- Bun
- Browser

Exports both ESM (`import`) and CommonJS (`require`).

## License

MIT

---

<div align="center">

Built by Firekid♥️ — All rights reserved

</div>
