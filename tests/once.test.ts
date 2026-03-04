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
    fn.clear('a')
    expect(fn.size()).toBe(1)
    expect(fn.has('a')).toBe(false)
    expect(fn.has('b')).toBe(true)
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

    expect(fn.has('__default__')).toBe(false)
    fn()
    await delay(10)
    expect(fn.has('__default__')).toBe(true)
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
