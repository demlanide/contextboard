import { apiRequest } from './client'
import type { OperationRecord } from '@/store/types'

export interface OperationsPollingResponse {
  operations: OperationRecord[]
  nextCursor: string | null
  headRevision: number
}

export async function fetchBoardOperations(
  boardId: string,
  afterRevision: number,
  limit = 100,
): Promise<{ data: OperationsPollingResponse | null; status: number | null; error: string | null }> {
  const params = new URLSearchParams({
    afterRevision: String(afterRevision),
    limit: String(limit),
  })

  // Use raw fetch so we can inspect HTTP status (apiRequest swallows status)
  const { apiBaseUrl, apiTimeoutMs } = await import('@/config/env').then((m) => m.env)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), apiTimeoutMs)

  try {
    const response = await fetch(
      `${apiBaseUrl}/boards/${boardId}/operations?${params}`,
      { signal: controller.signal },
    )

    const envelope = await response.json()

    if (response.status === 410) {
      return { data: null, status: 410, error: envelope?.error?.message ?? 'Cursor invalid' }
    }
    if (!response.ok || envelope.error) {
      const msg = envelope?.error?.message ?? 'Operations fetch failed'
      return { data: null, status: response.status, error: msg }
    }

    return { data: envelope.data as OperationsPollingResponse, status: 200, error: null }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { data: null, status: null, error: 'timeout' }
    }
    return { data: null, status: null, error: 'network' }
  } finally {
    clearTimeout(timeoutId)
  }
}
