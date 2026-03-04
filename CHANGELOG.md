# Changelog

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
