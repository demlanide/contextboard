import { Link } from 'react-router'
import { useBoardStore } from '@/store/board.store'
import { SyncIndicator } from '@/components/SyncIndicator/SyncIndicator'

export function BoardHeader() {
  const board = useBoardStore((s) => s.board)

  if (!board) return null

  return (
    <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white">
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-700 shrink-0">
        &larr; Boards
      </Link>
      <h1 className="text-lg font-semibold text-gray-900 truncate">{board.title}</h1>
      {board.status === 'archived' && (
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          Archived
        </span>
      )}
      <div className="ml-auto">
        <SyncIndicator />
      </div>
    </header>
  )
}
