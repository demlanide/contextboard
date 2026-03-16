import { useBoardStore } from '@/store/board.store'

export function ChatSidebar() {
  const open = useBoardStore((s) => s.ui.chatSidebarOpen)
  const toggle = useBoardStore((s) => s.toggleChatSidebar)

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
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-gray-400 text-sm">Chat coming in S8</p>
      </div>
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
