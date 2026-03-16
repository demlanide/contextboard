import { env } from '@/config/env'
import type { SyncError } from '@/store/types'

interface ApiEnvelope<T> {
  data: T | null
  error: { code: string; message: string; details?: Record<string, unknown> } | null
}

interface ApiResult<T> {
  data: T | null
  error: SyncError | null
}

const ERROR_RETRYABLE: Record<string, boolean> = {
  BOARD_NOT_FOUND: false,
  VALIDATION_ERROR: false,
}

function mapError(code: string, message: string): SyncError {
  return {
    code,
    message,
    retryable: ERROR_RETRYABLE[code] ?? true,
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), env.apiTimeoutMs)

  try {
    const response = await fetch(`${env.apiBaseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    const envelope: ApiEnvelope<T> = await response.json()

    if (!response.ok || envelope.error) {
      const err = envelope.error ?? { code: 'UNKNOWN_ERROR', message: 'Something went wrong.' }
      return { data: null, error: mapError(err.code, err.message) }
    }

    return { data: envelope.data, error: null }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        data: null,
        error: {
          code: 'TIMEOUT',
          message: 'The request timed out. Please try again.',
          retryable: true,
        },
      }
    }
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Unable to reach the server. Check your connection.',
        retryable: true,
      },
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
