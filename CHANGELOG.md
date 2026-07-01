# Changelog

## 1.0.3

Bug fixes:

- Fixed CommonJS output not matching `package.json`, `require()` was broken since `dist/index.cjs` was never built
- Fixed TTL entries never being removed once expired if the key was never called again, a real memory leak in long-running processes
- Fixed default key generation colliding between different call shapes (e.g. `fn('[1,2]')` vs `fn(1, 2)`, or `fn('a', undefined)` vs `fn('a', null)`)
- Fixed synchronous throws inside the wrapped function escaping as uncaught exceptions instead of promise rejections
- Fixed rejected calls staying cached for the full TTL window instead of clearing immediately, blocking retries
- Fixed `maxKeys` counting expired TTL entries toward its limit instead of sweeping them first
- Fixed `refresh()` racing against an already in-flight call for the same key, where the slower call could resolve later and overwrite a newer result with stale data, `refresh()` now joins an in-flight call instead of starting a duplicate

New features:

- `staleWhileRevalidate`, serve the last cached value instantly while refreshing it in the background
- `shouldCache(value)`, skip caching specific resolved values
- `store`, provide your own `Map` instance for the cache
- `abort(key?)`, stop tracking an in-flight call so it's no longer deduplicated or cached
- `refresh(...args)`, bypass the cache for one call and update it with the fresh result
- `stats()`, hit, miss, and dedup counters per instance
- Trusted Publishing GitHub Actions workflow for npm releases with provenance

## 1.0.0

Initial release.

- Deduplicate concurrent async calls by key
- Auto cleanup after promise resolves or rejects — no memory leak
- Full Promise and async/await support — no callbacks
- Errors propagated to all concurrent callers
- TTL window — deduplicate calls within a time window
- Custom key — static string or function from arguments
- maxKeys — limit in-flight keys to prevent unbounded growth
- onDeduplicated callback — know when a call was deduplicated
- clear(key?) — remove specific or all in-flight entries
- size() — current in-flight count
- has(key) — check if a key is in-flight
- createOnce() factory for shared defaults
- Full TypeScript generics — return type inferred automatically
- Node.js 18+, Cloudflare Workers, Vercel Edge, Deno, Bun, Browser
- Dual ESM and CommonJS export
- Zero runtime dependencies
