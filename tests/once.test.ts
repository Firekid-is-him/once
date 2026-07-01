import { describe, it, expect, vi } from 'vitest'
import { once, createOnce } from '../src/index'

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

describe('once — core deduplication', () => {
  it('calls the function only once for concurrent invocations', async () => {
    let callCount = 0
    const fn = once(async (id: string) => {
      callCount++
      await delay(50)
      return `result-${id}`
    })

    const [a, b, c] = await Promise.all([fn('x'), fn('x'), fn('x')])

    expect(callCount).toBe(1)
    expect(a).toBe('result-x')
    expect(b).toBe('result-x')
    expect(c).toBe('result-x')
  })

  it('treats different keys as separate calls', async () => {
    let callCount = 0
    const fn = once(async (id: string) => {
      callCount++
      await delay(20)
      return id
    })

    const [a, b] = await Promise.all([fn('x'), fn('y')])

    expect(callCount).toBe(2)
    expect(a).toBe('x')
    expect(b).toBe('y')
  })

  it('allows a second call after the first resolves', async () => {
    let callCount = 0
    const fn = once(async () => {
      callCount++
      return callCount
    })

    const first = await fn()
    const second = await fn()

    expect(callCount).toBe(2)
    expect(first).toBe(1)
    expect(second).toBe(2)
  })

  it('propagates errors to all concurrent callers', async () => {
    let callCount = 0
    const fn = once(async () => {
      callCount++
      await delay(20)
      throw new Error('boom')
    })

    const results = await Promise.allSettled([fn(), fn(), fn()])

    expect(callCount).toBe(1)
    for (const r of results) {
      expect(r.status).toBe('rejected')
      if (r.status === 'rejected') {
        expect(r.reason.message).toBe('boom')
      }
    }
  })

  it('cleans up after rejection — allows retry', async () => {
    let callCount = 0
    const fn = once(async () => {
      callCount++
      if (callCount === 1) throw new Error('first fails')
      return 'recovered'
    })

    await expect(fn()).rejects.toThrow('first fails')
    const result = await fn()
    expect(result).toBe('recovered')
    expect(callCount).toBe(2)
  })

  it('no memory leak — map is empty after all settle', async () => {
    const fn = once(async (id: string) => {
      await delay(10)
      return id
    })

    await Promise.all([fn('a'), fn('b'), fn('c')])
    expect(fn.size()).toBe(0)
  })
})

describe('once — key option', () => {
  it('accepts a static string key', async () => {
    let callCount = 0
    const fn = once(async (a: string, b: string) => {
      callCount++
      await delay(20)
      return `${a}-${b}`
    }, { key: 'fixed' })

    const [x, y] = await Promise.all([fn('a', 'b'), fn('c', 'd')])

    expect(callCount).toBe(1)
    expect(x).toBe('a-b')
    expect(y).toBe('a-b')
  })

  it('accepts a key function', async () => {
    let callCount = 0
    const fn = once(
      async (userId: string, _role: string) => {
        callCount++
        await delay(20)
        return userId
      },
      { key: (userId) => `user:${userId}` }
    )

    const [a, b, c] = await Promise.all([
      fn('123', 'admin'),
      fn('123', 'user'),
      fn('456', 'admin'),
    ])

    expect(callCount).toBe(2)
    expect(a).toBe('123')
    expect(b).toBe('123')
    expect(c).toBe('456')
  })
})

describe('once — ttl option', () => {
  it('deduplicates within TTL window', async () => {
    let callCount = 0
    const fn = once(async () => {
      callCount++
      return callCount
    }, { ttl: 200 })

    const first = await fn()
    await delay(50)
    const second = await fn()

    expect(callCount).toBe(1)
    expect(first).toBe(1)
    expect(second).toBe(1)
  })

  it('re-executes after TTL expires', async () => {
    let callCount = 0
    const fn = once(async () => {
      callCount++
      return callCount
    }, { ttl: 50 })

    const first = await fn()
    await delay(100)
    const second = await fn()

    expect(callCount).toBe(2)
    expect(first).toBe(1)
    expect(second).toBe(2)
  })
})

describe('once — maxKeys option', () => {
  it('bypasses dedup when maxKeys is reached', async () => {
    let callCount = 0
    const fn = once(
      async (id: string) => {
        callCount++
        await delay(50)
        return id
      },
      { maxKeys: 2 }
    )

    await Promise.all([fn('a'), fn('b'), fn('c')])
    expect(callCount).toBeGreaterThanOrEqual(2)
  })
})

describe('once — onDeduplicated callback', () => {
  it('fires when a call is deduplicated', async () => {
    const deduped: string[] = []
    const fn = once(
      async (id: string) => {
        await delay(50)
        return id
      },
      {
        key: (id) => id,
        onDeduplicated: (key) => deduped.push(key),
      }
    )

    await Promise.all([fn('x'), fn('x'), fn('x')])
    expect(deduped.length).toBe(2)
    expect(deduped.every((k) => k === 'x')).toBe(true)
  })
})

describe('once — instance methods', () => {
  it('clear(key) removes a specific key', async () => {
    let callCount = 0
    const fn = once(async (id: string) => {
      callCount++
      await delay(100)
      return id
    })

    fn('a')
    fn('b')
    await delay(10)
    expect(fn.size()).toBe(2)
    fn.clear(JSON.stringify(['a']))
    expect(fn.size()).toBe(1)
    expect(fn.has(JSON.stringify(['a']))).toBe(false)
    expect(fn.has(JSON.stringify(['b']))).toBe(true)
  })

  it('clear() removes all keys', async () => {
    const fn = once(async (id: string) => {
      await delay(100)
      return id
    })

    fn('a')
    fn('b')
    fn('c')
    await delay(10)
    expect(fn.size()).toBe(3)
    fn.clear()
    expect(fn.size()).toBe(0)
  })

  it('has() returns correct status', async () => {
    const fn = once(async () => {
      await delay(100)
      return true
    })

    expect(fn.has(JSON.stringify([]))).toBe(false)
    fn()
    await delay(10)
    expect(fn.has(JSON.stringify([]))).toBe(true)
  })

  it('size() reflects current in-flight count', async () => {
    const fn = once(async (id: string) => {
      await delay(100)
      return id
    })

    expect(fn.size()).toBe(0)
    fn('a')
    fn('b')
    await delay(10)
    expect(fn.size()).toBe(2)
    await delay(150)
    expect(fn.size()).toBe(0)
  })
})

describe('createOnce — factory', () => {
  it('applies default options to all wrapped functions', async () => {
    const wrap = createOnce({ ttl: 200 })
    let callCount = 0

    const fn = wrap(async () => {
      callCount++
      return callCount
    })

    const first = await fn()
    await delay(50)
    const second = await fn()
    expect(callCount).toBe(1)
    expect(first).toBe(1)
    expect(second).toBe(1)
  })

  it('per-call options override factory defaults', async () => {
    const wrap = createOnce({ ttl: 500 })
    let callCount = 0

    const fn = wrap(
      async () => {
        callCount++
        return callCount
      },
      { ttl: 50 }
    )

    const first = await fn()
    await delay(100)
    const second = await fn()
    expect(callCount).toBe(2)
    expect(first).toBe(1)
    expect(second).toBe(2)
  })
})

describe('once - bugfix: ttl entries are cleaned up, not leaked', () => {
  it('removes an expired ttl entry even if the key is never called again', async () => {
    const fn = once(async (id: string) => id, { ttl: 30 })
    await fn('a')
    expect(fn.size()).toBe(1)
    await delay(80)
    expect(fn.size()).toBe(0)
  })

  it('does not leak across many distinct one-off keys with ttl set', async () => {
    const fn = once(async (id: string) => id, { ttl: 30 })
    for (let i = 0; i < 50; i++) await fn(`key-${i}`)
    expect(fn.size()).toBe(50)
    await delay(80)
    expect(fn.size()).toBe(0)
  })
})

describe('once - bugfix: default key derivation no longer collides', () => {
  it('does not collide a single string arg with a differently-shaped call', async () => {
    const calls: unknown[] = []
    const fn = once(async (...args: unknown[]) => {
      calls.push(args)
      await delay(20)
      return args
    })

    const [a, b] = await Promise.all([fn('[1,2]'), fn(1, 2)])

    expect(calls.length).toBe(2)
    expect(a).toEqual(['[1,2]'])
    expect(b).toEqual([1, 2])
  })

  it('does not collide undefined with null in the same argument position', async () => {
    const calls: unknown[] = []
    const fn = once(async (...args: unknown[]) => {
      calls.push(args)
      await delay(20)
      return args
    })

    const [a, b] = await Promise.all([fn('a', undefined), fn('a', null)])

    expect(calls.length).toBe(2)
    expect(a).toEqual(['a', undefined])
    expect(b).toEqual(['a', null])
  })
})

describe('once - bugfix: synchronous throws become rejections', () => {
  it('rejects instead of throwing when the wrapped fn throws synchronously', async () => {
    const fn = once((id: string) => {
      if (!id) throw new Error('id required')
      return Promise.resolve(id)
    })

    await expect(fn('')).rejects.toThrow('id required')
  })

  it('propagates a synchronous throw to concurrent callers as a rejection', async () => {
    let calls = 0
    const fn = once(() => {
      calls++
      throw new Error('bad input')
    })

    const results = await Promise.allSettled([fn(), fn(), fn()])
    expect(calls).toBe(1)
    for (const r of results) expect(r.status).toBe('rejected')
  })
})

describe('once - bugfix: rejections clear immediately even with ttl set', () => {
  it('allows a clean retry right after a rejection when ttl is configured', async () => {
    let attempts = 0
    const fn = once(async () => {
      attempts++
      if (attempts === 1) throw new Error('first fails')
      return 'recovered'
    }, { ttl: 5000 })

    await expect(fn()).rejects.toThrow('first fails')
    const result = await fn()
    expect(result).toBe('recovered')
    expect(attempts).toBe(2)
  })
})

describe('once - bugfix: maxKeys ignores expired ttl entries', () => {
  it('does not let stale entries occupy capacity forever', async () => {
    let calls = 0
    const fn = once(async (id: string) => { calls++; return id }, { ttl: 30, maxKeys: 2 })

    await fn('a')
    await fn('b')
    await delay(80)

    await fn('c')
    expect(fn.size()).toBe(1)
    expect(calls).toBe(3)
  })
})

describe('once - feature: staleWhileRevalidate', () => {
  it('returns the stale value immediately and refreshes in the background', async () => {
    let calls = 0
    const fn = once(async () => {
      calls++
      await delay(20)
      return calls
    }, { ttl: 30, staleWhileRevalidate: true })

    const first = await fn()
    expect(first).toBe(1)
    await delay(60)

    const stale = await fn()
    expect(stale).toBe(1)
    expect(calls).toBe(2)

    await delay(40)
    const fresh = await fn()
    expect(fresh).toBe(2)
  })

  it('does not fire duplicate background refreshes for concurrent stale reads', async () => {
    let calls = 0
    const fn = once(async () => {
      calls++
      await delay(30)
      return calls
    }, { ttl: 20, staleWhileRevalidate: true })

    await fn()
    await delay(40)

    await Promise.all([fn(), fn(), fn()])
    expect(calls).toBe(2)
  })
})

describe('once - feature: shouldCache', () => {
  it('skips caching values the predicate rejects', async () => {
    let calls = 0
    const fn = once(async (id: string) => {
      calls++
      return id === 'empty' ? null : id
    }, { shouldCache: (v) => v !== null })

    await fn('empty')
    expect(fn.size()).toBe(0)
    await fn('empty')
    expect(calls).toBe(2)
  })
})

describe('once - feature: abort', () => {
  it('removes a specific key so the next call executes fresh', async () => {
    let calls = 0
    const fn = once(async (id: string) => {
      calls++
      await delay(50)
      return id
    })

    const key = JSON.stringify(['a'])
    fn('a')
    await delay(10)
    expect(fn.has(key)).toBe(true)

    fn.abort(key)
    expect(fn.has(key)).toBe(false)

    await fn('a')
    expect(calls).toBe(2)
  })

  it('removes all keys when called without an argument', async () => {
    const fn = once(async (id: string) => {
      await delay(50)
      return id
    })

    fn('a')
    fn('b')
    await delay(10)
    expect(fn.size()).toBe(2)
    fn.abort()
    expect(fn.size()).toBe(0)
  })
})

describe('once - feature: refresh', () => {
  it('bypasses the cached value and executes fresh', async () => {
    let calls = 0
    const fn = once(async () => {
      calls++
      return calls
    }, { ttl: 5000 })

    const first = await fn()
    expect(first).toBe(1)

    const refreshed = await fn.refresh()
    expect(refreshed).toBe(2)

    const cached = await fn()
    expect(cached).toBe(2)
    expect(calls).toBe(2)
  })

  it('joins an already in-flight call instead of racing a duplicate execution', async () => {
    let calls = 0
    const fn = once(async () => {
      calls++
      const n = calls
      await delay(n === 1 ? 60 : 10)
      return n
    }, { ttl: 5000 })

    const original = fn()
    await delay(10)
    const refreshed = await fn.refresh()
    await original

    expect(calls).toBe(1)
    expect(refreshed).toBe(1)

    const cached = await fn()
    expect(cached).toBe(1)
  })
})

describe('once - feature: stats', () => {
  it('tracks misses, dedup hits, and cache hits separately', async () => {
    const fn = once(async (id: string) => {
      await delay(20)
      return id
    }, { ttl: 5000 })

    await Promise.all([fn('a'), fn('a')])
    await fn('a')

    const stats = fn.stats()
    expect(stats.misses).toBe(1)
    expect(stats.dedup).toBe(1)
    expect(stats.hits).toBe(1)
  })
})

describe('once - feature: custom store', () => {
  it('accepts an externally provided Map for the cache', async () => {
    const store = new Map()
    const fn = once(async (id: string) => {
      await delay(20)
      return id
    }, { store })

    fn('a')
    await delay(5)
    expect(store.size).toBe(1)
    await delay(30)
    expect(store.size).toBe(0)
  })
})
