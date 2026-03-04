export type AnyAsyncFn<T> = (...args: any[]) => Promise<T>

export interface OnceOptions<TArgs extends any[]> {
  key?: string | ((...args: TArgs) => string)
  ttl?: number
  maxKeys?: number
  onDeduplicated?: (key: string) => void
}

export interface OnceInstance<TArgs extends any[], TResult> {
  (...args: TArgs): Promise<TResult>
  clear: (key?: string) => void
  size: () => number
  has: (key: string) => boolean
}

export interface CreateOnceOptions {
  maxKeys?: number
  ttl?: number
}
