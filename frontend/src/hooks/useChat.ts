import { useCallback } from 'react'
import { useBoardStore } from '@/store/board.store'
import { getChatHistory, sendMessage as sendMessageApi } from '@/api/chat.api'
import type { ChatMessage } from '@/store/types'
import type { SelectionContext } from '@/api/chat.api'

export function useChat(boardId: string | null | undefined) {
  const messages = useBoardStore((s) => s.chatState.messages)
  const sendStatus = useBoardStore((s) => s.chatState.sendStatus)
  const loadStatus = useBoardStore((s) => s.chatState.loadStatus)
  const lastError = useBoardStore((s) => s.chatState.lastError)

  const loadChatHistory = useBoardStore((s) => s.loadChatHistory)
  const setChatLoadStatus = useBoardStore((s) => s.setChatLoadStatus)
  const setChatSendStatus = useBoardStore((s) => s.setChatSendStatus)
  const appendChatMessages = useBoardStore((s) => s.appendChatMessages)
  const setChatLastError = useBoardStore((s) => s.setChatLastError)

  const loadHistory = useCallback(
    async () => {
      if (!boardId) return

      // Skip if already loaded
      const current = useBoardStore.getState().chatState
      if (current.loadStatus === 'ready' && current.messages.length > 0) return

      setChatLoadStatus('loading')
      const result = await getChatHistory(boardId)

      if (result.error) {
        setChatLoadStatus('error')
        setChatLastError(result.error.message)
        return
      }

      if (result.data) {
        loadChatHistory(result.data.messages as ChatMessage[])
      }
    },
    [boardId, setChatLoadStatus, setChatLastError, loadChatHistory],
  )

  const sendMessageAction = useCallback(
    async (text: string) => {
      if (!boardId) return
      setChatSendStatus('sending')
      setChatLastError(null)

      // Capture selection context from board store (only when nodes/edges are selected)
      const state = useBoardStore.getState()
      let selectionContext: SelectionContext | undefined
      const selectedNodeIds = state.ui.selectedNodeIds
      const selectedEdgeId = state.ui.selectedEdgeId

      if (selectedNodeIds.length > 0 || selectedEdgeId) {
        const vp = state.board?.viewportState
        const hasViewport = vp && typeof vp.x === 'number' && typeof vp.y === 'number' && typeof vp.zoom === 'number'
        selectionContext = {
          selectedNodeIds: selectedNodeIds.length > 0 ? selectedNodeIds : undefined,
          selectedEdgeIds: selectedEdgeId ? [selectedEdgeId] : undefined,
          viewport: hasViewport ? (vp as SelectionContext['viewport']) : undefined,
        }
      }

      const result = await sendMessageApi(boardId!, text, selectionContext)

      if (result.error && !result.data) {
        setChatSendStatus('error')
        setChatLastError(result.error.message)
        return
      }

      if (result.data) {
        const newMessages: ChatMessage[] = [result.data.userMessage as ChatMessage]
        if (result.data.agentMessage) {
          newMessages.push(result.data.agentMessage as ChatMessage)
        }
        appendChatMessages(...newMessages)
        setChatSendStatus('idle')

        // Show ephemeral error if agent failed but user message saved
        if (!result.data.agentMessage && result.error) {
          setChatLastError(result.error.message)
          // Clear after 5 seconds
          setTimeout(() => {
            setChatLastError(null)
          }, 5000)
        }
      }
    },
    [boardId, setChatSendStatus, setChatLastError, appendChatMessages],
  )

  return {
    messages,
    sendStatus,
    loadStatus,
    lastError,
    loadHistory,
    sendMessage: sendMessageAction,
  }
}
