import { useState } from 'react'
import { useBoards } from '@/hooks/useBoards'
import { BoardList } from '@/components/boards/BoardList'
import { CreateBoardDialog } from '@/components/boards/CreateBoardDialog'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ErrorMessage } from '@/components/shared/ErrorMessage'

export function HomePage() {
  const [showCreate, setShowCreate] = useState(false)
  const { boards, loading, error, refetch } = useBoards()

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-900">Context Board</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create Board
        </button>
      </header>
      <main className="flex-1 p-6">
        {loading && <LoadingSpinner />}
        {error && (
          <ErrorMessage message={error.message} retryable={error.retryable} onRetry={refetch} />
        )}
        {!loading && !error && (
          <BoardList boards={boards} onCreateBoard={() => setShowCreate(true)} />
        )}
      </main>
      {showCreate && <CreateBoardDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}
