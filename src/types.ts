export type AnyAsyncFn<T> = (...args: any[]) => Promise<T>

export interface OnceCacheEntry<T> {
  promise: Promise<T> | null
  expiresAt: number | null
  value?: T
  hasValue: boolean
  revalidating: boolean
}

export interface OnceStats {
  hits: number
  misses: number
  dedup: number
}

export interface OnceOptions<TArgs extends any[], TResult = any> {
  key?: string | ((...args: TArgs) => string)
  ttl?: number
  maxKeys?: number
  onDeduplicated?: (key: string) => void
  staleWhileRevalidate?: boolean
  shouldCache?: (value: TResult) => boolean
  store?: Map<string, OnceCacheEntry<TResult>>
}

export interface OnceInstance<TArgs extends any[], TResult> {
  (...args: TArgs): Promise<TResult>
  clear: (key?: string) => void
  size: () => number
  has: (key: string) => boolean
  abort: (key?: string) => void
  refresh: (...args: TArgs) => Promise<TResult>
  stats: () => OnceStats
}

export interface CreateOnceOptions {
  maxKeys?: number
  ttl?: number
  staleWhileRevalidate?: boolean
}
