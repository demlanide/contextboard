import { useBoardStore } from '@/store/board.store'
import type { BoardNode } from '@/store/types'

const NODE_TYPES: { type: BoardNode['type']; label: string }[] = [
  { type: 'sticky', label: 'Sticky' },
  { type: 'text', label: 'Text' },
  { type: 'shape', label: 'Shape' },
]

export function CanvasToolbar() {
  const board = useBoardStore((s) => s.board)
  const placementMode = useBoardStore((s) => s.ui.placementMode)
  const setPlacementMode = useBoardStore((s) => s.setPlacementMode)
  const isReadOnly = board?.status !== 'active'

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex gap-1 bg-white rounded-lg shadow-md border border-gray-200 px-2 py-1.5">
      {isReadOnly && (
        <span className="text-xs text-gray-400 px-2 py-1">Read-only</span>
      )}
      {!isReadOnly &&
        NODE_TYPES.map(({ type, label }) => (
          <button
            key={type}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              placementMode === type
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
            onClick={() => setPlacementMode(placementMode === type ? null : type)}
          >
            {label}
          </button>
        ))}
    </div>
  )
}
