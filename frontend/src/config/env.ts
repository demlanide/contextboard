export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 10_000),
} as const
