// Unified AI sidebar — always uses suggest flow (responds conversationally or with action plans)
import { useEffect, useCallback } from 'react'
import { useBoardStore } from '@/store/board.store'
import { useChat } from '@/hooks/useChat'
import { useSuggest } from '@/hooks/useSuggest'
import { MessageList } from '../chat/MessageList'
import { MessageComposer } from '../chat/MessageComposer'
import { ActionSummaryList } from '../chat/ActionSummaryList'
import { SuggestLoadingIndicator } from '../chat/SuggestLoadingIndicator'

export function ChatSidebar() {
  const open = useBoardStore((s) => s.ui.chatSidebarOpen)
  const toggle = useBoardStore((s) => s.toggleChatSidebar)
  const boardId = useBoardStore((s) => s.boardId)
  const boardStatus = useBoardStore((s) => s.board?.status)
  const draftText = useBoardStore((s) => s.chatState.draftText)

  const { messages, loadStatus, loadHistory } = useChat(boardId)
  const { latestSuggestion, suggestStatus, suggestError, submitSuggest, dismissSuggestion } = useSuggest(boardId)

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const isArchived = boardStatus === 'archived'
  const isLoading = suggestStatus === 'running'

  const handleSend = useCallback((text: string) => {
    submitSuggest(text)
  }, [submitSuggest])

  return (
    <aside
      className={`flex flex-col border-r border-gray-200 bg-white transition-all duration-200 h-full min-h-0 ${open ? 'w-80' : 'w-0'} overflow-hidden`}
    >
      <div className="shrink-0 flex items-center justify-between p-3 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">AI Assistant</span>
        <button
          onClick={toggle}
          className="text-xs text-gray-500 hover:text-gray-700"
          aria-label="Collapse chat sidebar"
        >
          Collapse
        </button>
      </div>

      <MessageList messages={messages} loadStatus={loadStatus} />

      <div className="shrink-0">
        {/* Suggest loading indicator */}
        {suggestStatus === 'running' && <SuggestLoadingIndicator />}

        {/* Action summary for latest suggestion */}
        {latestSuggestion && latestSuggestion.actionPlan.length > 0 && (
          <ActionSummaryList
            actionPlan={latestSuggestion.actionPlan}
            onDismiss={dismissSuggestion}
          />
        )}

        {/* Error display */}
        {suggestError && (
          <div className="px-3 py-2 text-xs bg-red-50 border-t border-red-100">
            <p className="text-red-600">
              {suggestError.code === 'TIMEOUT'
                ? 'The assistant timed out. Please try again.'
                : suggestError.code === 'ACTION_PLAN_INVALID'
                  ? "The suggestion couldn't be validated. Try rephrasing."
                  : 'The assistant is temporarily unavailable.'}
            </p>
            <button
              onClick={() => useBoardStore.getState().setSuggestError(null)}
              className="mt-1 text-[10px] text-red-500 hover:text-red-700 underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Composer */}
      <MessageComposer
        onSend={handleSend}
        disabled={isArchived}
        sending={isLoading}
        draftText={draftText}
        onDraftChange={(text) => useBoardStore.getState().setChatDraftText(text)}
        placeholder={
          isArchived
            ? 'This board is archived.'
            : 'Ask the AI anything about your board...'
        }
      />
    </aside>
  )
}

export function ChatSidebarToggle() {
  const open = useBoardStore((s) => s.ui.chatSidebarOpen)
  const toggle = useBoardStore((s) => s.toggleChatSidebar)

  if (open) return null

  return (
    <button
      onClick={toggle}
      className="fixed left-2 top-1/2 -translate-y-1/2 rounded-md bg-white border border-gray-200 px-2 py-1 text-xs text-gray-600 shadow-sm hover:bg-gray-50"
      aria-label="Expand chat sidebar"
    >
      AI
    </button>
  )
}
