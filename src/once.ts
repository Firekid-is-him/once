import {
  OnceOptions,
  OnceInstance,
  CreateOnceOptions,
  OnceCacheEntry,
  OnceStats,
} from './types.js'

function resolveKey<TArgs extends any[]>(
  args: TArgs,
  keyOption?: string | ((...args: TArgs) => string)
): string {
  if (typeof keyOption === 'function') return keyOption(...args)
  if (typeof keyOption === 'string') return keyOption
  return JSON.stringify(args, (_k, v) => (v === undefined ? '__undefined__' : v))
}

function unref(handle: unknown): void {
  const h = handle as { unref?: () => void }
  if (typeof h?.unref === 'function') h.unref()
}

export function once<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: OnceOptions<TArgs, TResult> = {}
): OnceInstance<TArgs, TResult> {
  const { key: keyOption, ttl, maxKeys, onDeduplicated, staleWhileRevalidate, shouldCache } = options
  const store = options.store ?? new Map<string, OnceCacheEntry<TResult>>()
  const stats: OnceStats = { hits: 0, misses: 0, dedup: 0 }

  function isFresh(entry: OnceCacheEntry<TResult>, now: number): boolean {
    return entry.expiresAt === null || entry.expiresAt > now
  }

  function sweepExpired(): void {
    const now = Date.now()
    for (const [k, e] of store) {
      if (e.hasValue && e.expiresAt !== null && e.expiresAt <= now) {
        store.delete(k)
      }
    }
  }

  function execute(key: string, args: TArgs, entry: OnceCacheEntry<TResult>): Promise<TResult> {
    stats.misses++

    let promise: Promise<TResult>
    try {
      promise = fn(...args)
    } catch (err) {
      promise = Promise.reject(err)
    }

    entry.promise = promise
    entry.revalidating = false
    store.set(key, entry)

    promise.then(
      (value) => {
        if (store.get(key) !== entry) return

        const keep = shouldCache ? shouldCache(value) : true
        if (!keep) {
          store.delete(key)
          return
        }

        entry.value = value
        entry.hasValue = true
        entry.promise = null

        if (ttl == null) {
          store.delete(key)
          return
        }

        entry.expiresAt = Date.now() + ttl

        if (!staleWhileRevalidate) {
          const handle = setTimeout(() => {
            if (store.get(key) === entry) store.delete(key)
          }, ttl)
          unref(handle)
        }
      },
      () => {
        if (store.get(key) === entry) store.delete(key)
      }
    ).catch(() => {})

    return promise
  }

  const instance = function (...args: TArgs): Promise<TResult> {
    const key = resolveKey(args, keyOption)
    const now = Date.now()

    const existing = store.get(key)

    if (existing) {
      if (existing.promise) {
        stats.dedup++
        if (onDeduplicated) onDeduplicated(key)
        return existing.promise.then((v) => v)
      }

      if (existing.hasValue && isFresh(existing, now)) {
        stats.hits++
        if (onDeduplicated) onDeduplicated(key)
        return Promise.resolve(existing.value as TResult)
      }

      if (existing.hasValue && staleWhileRevalidate) {
        stats.hits++
        if (!existing.revalidating) {
          existing.revalidating = true
          execute(key, args, existing).catch(() => {})
        }
        return Promise.resolve(existing.value as TResult)
      }

      store.delete(key)
    }

    if (maxKeys !== undefined) {
      sweepExpired()
      if (store.size >= maxKeys) {
        stats.misses++
        try {
          return fn(...args)
        } catch (err) {
          return Promise.reject(err)
        }
      }
    }

    const entry: OnceCacheEntry<TResult> = {
      promise: null,
      expiresAt: null,
      hasValue: false,
      revalidating: false,
    }

    return execute(key, args, entry).then((v) => v)
  } as OnceInstance<TArgs, TResult>

  instance.clear = (key?: string) => {
    if (key !== undefined) {
      store.delete(key)
    } else {
      store.clear()
    }
  }

  instance.size = () => store.size

  instance.has = (key: string) => store.has(key)

  instance.abort = (key?: string) => {
    const keys = key !== undefined ? [key] : Array.from(store.keys())
    for (const k of keys) {
      const entry = store.get(k)
      if (entry?.promise) entry.promise.catch(() => {})
      store.delete(k)
    }
  }

  instance.refresh = (...args: TArgs): Promise<TResult> => {
    const key = resolveKey(args, keyOption)
    const existing = store.get(key)

    if (existing?.promise) {
      return existing.promise.then((v) => v)
    }

    const entry: OnceCacheEntry<TResult> = {
      promise: null,
      expiresAt: null,
      hasValue: false,
      revalidating: false,
    }
    return execute(key, args, entry).then((v) => v)
  }

  instance.stats = () => ({ ...stats })

  return instance
}

export function createOnce(defaults: CreateOnceOptions = {}) {
  return function wrap<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: OnceOptions<TArgs, TResult> = {}
  ): OnceInstance<TArgs, TResult> {
    return once(fn, {
      maxKeys: defaults.maxKeys,
      ttl: defaults.ttl,
      staleWhileRevalidate: defaults.staleWhileRevalidate,
      ...options,
    })
  }
}
