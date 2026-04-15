import { useBoardStore } from '@/store/board.store'
import { hydrateBoardState } from '@/api/boards.api'

export function SyncIndicator() {
  const boardId = useBoardStore((s) => s.boardId)
  const pollingStatus = useBoardStore((s) => s.sync.pollingStatus)
  const stale = useBoardStore((s) => s.sync.stale)
  const hydrate = useBoardStore((s) => s.hydrate)
  const setHydrateStatus = useBoardStore((s) => s.setHydrateStatus)

  const handleRefresh = async () => {
    if (!boardId) return
    setHydrateStatus('loading')
    const result = await hydrateBoardState(boardId)
    if (result.data) {
      hydrate({
        board: result.data.board,
        nodes: result.data.nodes,
        edges: result.data.edges,
        chatThread: result.data.chatThread,
      })
    }
  }

  if (stale) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          Out of sync
        </span>
        <button
          onClick={handleRefresh}
          className="text-xs text-amber-700 hover:text-amber-900 underline"
        >
          Refresh
        </button>
      </div>
    )
  }

  if (pollingStatus === 'polling') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" aria-hidden="true" />
        <span className="text-xs text-gray-500">Syncing…</span>
      </div>
    )
  }

  if (pollingStatus === 'error') {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          Sync error
        </span>
        <button
          onClick={handleRefresh}
          className="text-xs text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    )
  }

  return null
}
