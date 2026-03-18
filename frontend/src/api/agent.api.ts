// T007: Suggest API client
import { apiRequest } from './client'
import { env } from '@/config/env'
import type { ChatMessage, ActionPlanItem, PreviewPayload, ApplyResponse, SyncError } from '@/store/types'

export interface AgentActionsResponse {
  message: ChatMessage
  actionPlan: ActionPlanItem[]
  preview: PreviewPayload
}

export interface AgentErrorEnvelope {
  data: {
    message: ChatMessage | null
    actionPlan: []
    preview: PreviewPayload
  }
  error: {
    code: string
    message: string
    details: Record<string, unknown>
  } | null
}

export function submitSuggest(
  boardId: string,
  prompt: string,
  mode: 'suggest',
  selectionContext?: {
    selectedNodeIds?: string[]
    selectedEdgeIds?: string[]
    viewport?: { x: number; y: number; zoom: number }
  },
  images?: string[]
) {
  return apiRequest<AgentActionsResponse>(
    `/boards/${encodeURIComponent(boardId)}/agent/actions`,
    {
      method: 'POST',
      body: JSON.stringify({ prompt, mode, selectionContext, images }),
    }
  )
}

export async function submitApply(
  boardId: string,
  actionPlan: ActionPlanItem[]
): Promise<{ data: ApplyResponse | null; error: SyncError | null }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), env.apiTimeoutMs)

  try {
    const response = await fetch(
      `${env.apiBaseUrl}/boards/${encodeURIComponent(boardId)}/agent/actions/apply`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'apply', actionPlan }),
      }
    )

    const body = await response.json()

    if (!response.ok) {
      const err = body.error ?? { code: 'UNKNOWN_ERROR', message: 'Something went wrong.' }
      return {
        data: null,
        error: { code: err.code, message: err.message, retryable: false },
      }
    }

    return { data: body as ApplyResponse, error: null }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        data: null,
        error: { code: 'TIMEOUT', message: 'The request timed out. Please try again.', retryable: true },
      }
    }
    return {
      data: null,
      error: { code: 'NETWORK_ERROR', message: 'Unable to reach the server. Check your connection.', retryable: true },
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
