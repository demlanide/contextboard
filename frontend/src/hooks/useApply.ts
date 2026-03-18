import { useCallback } from 'react'
import { useBoardStore } from '@/store/board.store'
import * as agentApi from '@/api/agent.api'

export function useApply(boardId: string | null) {
  const applyStatus = useBoardStore((s) => s.agentState.applyStatus)
  const applyError = useBoardStore((s) => s.agentState.applyError)

  const submitApply = useCallback(async () => {
    if (!boardId) return

    const store = useBoardStore.getState()
    const suggestion = store.agentState.latestSuggestion
    if (!suggestion || suggestion.actionPlan.length === 0) return
    if (store.agentState.applyStatus === 'running') return

    store.setApplyStatus('running')
    store.setApplyError(null)

    const { data, error } = await agentApi.submitApply(boardId, suggestion.actionPlan)

    if (error) {
      useBoardStore.getState().setApplyError(error)
      return
    }

    if (data) {
      useBoardStore.getState().reconcileApply(data)

      // Auto-clear success status after a brief delay
      setTimeout(() => {
        useBoardStore.getState().clearApplyState()
      }, 2000)
    }
  }, [boardId])

  const dismissApplyError = useCallback(() => {
    useBoardStore.getState().clearApplyState()
  }, [])

  return {
    applyStatus,
    applyError,
    submitApply,
    dismissApplyError,
  }
}
