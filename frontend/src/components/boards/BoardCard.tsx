import { useNavigate } from 'react-router'
import type { BoardListItem } from '@/store/types'

interface BoardCardProps {
  board: BoardListItem
}

export function BoardCard({ board }: BoardCardProps) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(`/boards/${board.id}`)}
      className="w-full text-left rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-gray-300 transition-all"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-base font-medium text-gray-900 truncate">{board.title}</h3>
        {board.status === 'archived' && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Archived
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Updated {new Date(board.updatedAt).toLocaleDateString()}
      </p>
    </button>
  )
}
