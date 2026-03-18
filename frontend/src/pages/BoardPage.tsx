import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useBoardHydration } from '@/hooks/useBoardHydration'
import { useBoardStore } from '@/store/board.store'
import { BoardHeader } from '@/components/layout/BoardHeader'
import { BoardWorkspace } from '@/components/layout/BoardWorkspace'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ErrorMessage } from '@/components/shared/ErrorMessage'

export function BoardPage() {
  const { sync, retry } = useBoardHydration()
  const reset = useBoardStore((s) => s.reset)
  const navigate = useNavigate()

  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  if (sync.hydrateStatus === 'loading' || sync.hydrateStatus === 'idle') {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (sync.hydrateStatus === 'error' && sync.lastError) {
    const isNotFound = sync.lastError.code === 'BOARD_NOT_FOUND'
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <ErrorMessage
          message={sync.lastError.message}
          retryable={sync.lastError.retryable}
          onRetry={retry}
          onBack={isNotFound ? () => navigate('/') : undefined}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <BoardHeader />
      <BoardWorkspace />
    </div>
  )
}
