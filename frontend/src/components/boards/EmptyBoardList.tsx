interface EmptyBoardListProps {
  onCreateBoard: () => void
}

export function EmptyBoardList({ onCreateBoard }: EmptyBoardListProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-lg text-gray-500 mb-4">No boards yet</p>
      <button
        onClick={onCreateBoard}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Create Your First Board
      </button>
    </div>
  )
}
