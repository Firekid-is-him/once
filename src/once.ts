import { OnceOptions, OnceInstance, CreateOnceOptions } from './types.js'

interface InFlightEntry<T> {
  promise: Promise<T>
  expiresAt: number | null
}

function resolveKey<TArgs extends any[]>(
  args: TArgs,
  keyOption?: string | ((...args: TArgs) => string)
): string {
  if (typeof keyOption === 'function') return keyOption(...args)
  if (typeof keyOption === 'string') return keyOption
  if (args.length === 0) return '__default__'
  try {
    return JSON.stringify(args)
  } catch {
    return String(args[0])
  }
}

export function once<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: OnceOptions<TArgs> = {}
): OnceInstance<TArgs, TResult> {
  const { key: keyOption, ttl, maxKeys, onDeduplicated } = options
  const inFlight = new Map<string, InFlightEntry<TResult>>()

  const instance = function (...args: TArgs): Promise<TResult> {
    const key = resolveKey(args, keyOption)
    const now = Date.now()

    const existing = inFlight.get(key)
    if (existing) {
      if (existing.expiresAt === null || existing.expiresAt > now) {
        if (onDeduplicated) onDeduplicated(key)
        return existing.promise
      }
      inFlight.delete(key)
    }

    if (maxKeys !== undefined && inFlight.size >= maxKeys) {
      return fn(...args)
    }

    const promise = fn(...args).finally(() => {
      const entry = inFlight.get(key)
      if (entry && entry.promise === promise) {
        inFlight.delete(key)
      }
    })

    inFlight.set(key, {
      promise,
      expiresAt: ttl != null ? now + ttl : null,
    })

    return promise
  } as OnceInstance<TArgs, TResult>

  instance.clear = (key?: string) => {
    if (key !== undefined) {
      inFlight.delete(key)
    } else {
      inFlight.clear()
    }
  }

  instance.size = () => inFlight.size

  instance.has = (key: string) => inFlight.has(key)

  return instance
}

export function createOnce(defaults: CreateOnceOptions = {}) {
  return function wrap<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: OnceOptions<TArgs> = {}
  ): OnceInstance<TArgs, TResult> {
    return once(fn, {
      maxKeys: defaults.maxKeys,
      ttl: defaults.ttl,
      ...options,
    })
  }
}
