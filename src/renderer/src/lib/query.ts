import { QueryClient, useMutation, useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ApiInput, ApiMethod, ApiOutput } from '@shared/ipc/contract'
import i18n from '../i18n'
import { ApiError, call, callWithOverride } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 },
    mutations: { retry: false }
  }
})

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`
    const params = { ...(err.details ?? {}) } as Record<string, unknown>
    if (typeof params.permission === 'string') params.permission = i18n.t(`permissions.${params.permission}`)
    return i18n.exists(key) ? i18n.t(key, params) : i18n.t('errors.INTERNAL')
  }
  return i18n.t('errors.INTERNAL')
}

export function toastError(err: unknown): void {
  if (err instanceof ApiError && err.code === 'OVERRIDE_REQUIRED') return
  toast.error(errorMessage(err))
}

export function useApi<K extends ApiMethod>(
  method: K,
  input?: ApiInput<K>,
  opts: Omit<UseQueryOptions<ApiOutput<K>, ApiError>, 'queryKey' | 'queryFn'> = {}
) {
  return useQuery<ApiOutput<K>, ApiError>({
    queryKey: [method, input ?? null],
    queryFn: () => call(method, input),
    ...opts
  })
}

interface MutationOpts<K extends ApiMethod> {
  /** method prefixes whose queries are refreshed on success (e.g. 'catalog.') */
  invalidate?: string[]
  success?: string
  overridable?: boolean
  onSuccess?: (data: ApiOutput<K>, input: ApiInput<K>) => void
  silentError?: boolean
}

export function useApiMutation<K extends ApiMethod>(method: K, opts: MutationOpts<K> = {}) {
  return useMutation<ApiOutput<K>, ApiError, ApiInput<K>>({
    mutationFn: (input) => (opts.overridable ? callWithOverride(method, input) : call(method, input)),
    onSuccess: (data, input) => {
      for (const prefix of opts.invalidate ?? []) {
        void queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(prefix) })
      }
      if (opts.success) toast.success(i18n.t(opts.success))
      opts.onSuccess?.(data, input)
    },
    onError: (err) => {
      if (!opts.silentError) toastError(err)
    }
  })
}

export function invalidate(...prefixes: string[]): void {
  for (const prefix of prefixes) void queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(prefix) })
}
