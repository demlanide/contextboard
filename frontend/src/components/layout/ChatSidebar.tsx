import { useEffect } from 'react'
import { useBoardStore } from '@/store/board.store'
import { useChat } from '@/hooks/useChat'
import { MessageList } from '@/components/chat/MessageList'
import { MessageComposer } from '@/components/chat/MessageComposer'
import { ErrorMessage } from '@/components/shared/ErrorMessage'

export function ChatSidebar() {
  const open = useBoardStore((s) => s.ui.chatSidebarOpen)
  const toggle = useBoardStore((s) => s.toggleChatSidebar)
  const boardId = useBoardStore((s) => s.boardId)
  const boardStatus = useBoardStore((s) => s.board?.status)

  const { messages, sendStatus, loadStatus, lastError, loadHistory, sendMessage } = useChat()

  useEffect(() => {
    if (boardId) {
      loadHistory(boardId)
    }
  }, [boardId, loadHistory])

  const handleSend = (text: string) => {
    if (boardId) {
      sendMessage(boardId, text)
    }
  }

  const isArchived = boardStatus === 'archived'

  return (
    <aside
      className={`flex flex-col border-r border-gray-200 bg-white transition-all duration-200 ${open ? 'w-80' : 'w-0'} overflow-hidden`}
    >
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">Chat</span>
        <button
          onClick={toggle}
          className="text-xs text-gray-500 hover:text-gray-700"
          aria-label="Collapse chat sidebar"
        >
          Collapse
        </button>
      </div>

      {loadStatus === 'error' ? (
        <ErrorMessage
          message={lastError ?? 'Failed to load chat'}
          retryable
          onRetry={() => boardId && loadHistory(boardId)}
        />
      ) : (
        <MessageList messages={messages} loadStatus={loadStatus} />
      )}

      {lastError && sendStatus !== 'sending' && loadStatus !== 'error' && (
        <div className="px-3 py-2 text-xs text-red-500 bg-red-50 border-t border-red-100">
          {lastError}
        </div>
      )}

      <MessageComposer
        onSend={handleSend}
        sending={sendStatus === 'sending'}
        disabled={isArchived}
        disabledText="This board is archived. Chat is read-only."
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
      Chat
    </button>
  )
}
