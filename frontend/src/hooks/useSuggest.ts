// T016 + T029: useSuggest hook with selection context capture
import { useCallback } from 'react'
import { useBoardStore } from '@/store/board.store'
import * as agentApi from '@/api/agent.api'

export function useSuggest(boardId: string | null) {
  const suggestStatus = useBoardStore((s) => s.agentState.suggestStatus)
  const latestSuggestion = useBoardStore((s) => s.agentState.latestSuggestion)
  const previewVisible = useBoardStore((s) => s.agentState.previewVisible)
  const previewStale = useBoardStore((s) => s.agentState.previewStale)
  const suggestError = useBoardStore((s) => s.agentState.suggestError)

  const submitSuggest = useCallback(
    async (prompt: string, explicitSelectionContext?: {
      selectedNodeIds?: string[]
      selectedEdgeIds?: string[]
      viewport?: { x: number; y: number; zoom: number }
    }, images?: string[]) => {
      if (!boardId || !prompt.trim()) return

      const store = useBoardStore.getState()

      // T029: Capture selection from store if not explicitly provided
      let selectionContext = explicitSelectionContext
      if (!selectionContext) {
        const selectedNodeIds = store.ui.selectedNodeIds
        const selectedEdgeId = store.ui.selectedEdgeId
        const viewport = store.board?.viewportState

        const ctx: Record<string, unknown> = {}
        if (selectedNodeIds.length > 0) ctx.selectedNodeIds = selectedNodeIds
        if (selectedEdgeId) ctx.selectedEdgeIds = [selectedEdgeId]
        if (viewport && 'x' in viewport && 'y' in viewport && 'zoom' in viewport) ctx.viewport = viewport

        if (Object.keys(ctx).length > 0) {
          selectionContext = ctx as typeof selectionContext
        }
      }

      // Auto-dismiss old suggestion
      if (store.agentState.latestSuggestion) {
        store.clearSuggestion()
      }

      store.setSuggestStatus('running')
      store.setSuggestError(null)

      // Show user message in chat immediately
      store.appendChatMessage({
        id: crypto.randomUUID(),
        threadId: '',
        senderType: 'user',
        messageText: prompt,
        messageJson: {},
        selectionContext: selectionContext ?? {},
        createdAt: new Date().toISOString(),
      })
      store.setChatDraftText('')

      const { data, error } = await agentApi.submitSuggest(
        boardId,
        prompt,
        'suggest',
        selectionContext,
        images
      )

      if (error) {
        useBoardStore.getState().setSuggestError(error)
        return
      }

      if (data) {
        const currentRevision = useBoardStore.getState().board?.revision ?? 0

        useBoardStore.getState().setLatestSuggestion({
          message: data.message,
          actionPlan: data.actionPlan,
          preview: data.preview,
          boardRevision: currentRevision,
        })

        // Append agent message to chat
        useBoardStore.getState().appendChatMessage(data.message)
      }
    },
    [boardId]
  )

  const dismissPreview = useCallback(() => {
    useBoardStore.getState().clearSuggestion()
  }, [])

  const dismissSuggestion = useCallback(() => {
    useBoardStore.getState().clearSuggestion()
  }, [])

  return {
    suggestStatus,
    latestSuggestion,
    previewVisible,
    previewStale,
    suggestError,
    submitSuggest,
    dismissPreview,
    dismissSuggestion,
  }
}
