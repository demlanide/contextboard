import type { BoardListItem } from '@/store/types'
import { BoardCard } from './BoardCard'
import { EmptyBoardList } from './EmptyBoardList'

interface BoardListProps {
  boards: BoardListItem[]
  onCreateBoard: () => void
}

export function BoardList({ boards, onCreateBoard }: BoardListProps) {
  if (boards.length === 0) {
    return <EmptyBoardList onCreateBoard={onCreateBoard} />
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((board) => (
        <BoardCard key={board.id} board={board} />
      ))}
    </div>
  )
}
