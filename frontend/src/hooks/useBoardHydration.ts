import { useEffect, useCallback } from 'react'
import { useParams } from 'react-router'
import { useBoardStore } from '@/store/board.store'
import { hydrateBoardState } from '@/api/boards.api'

export function useBoardHydration() {
  const { boardId } = useParams<{ boardId: string }>()
  const hydrate = useBoardStore((s) => s.hydrate)
  const setHydrateStatus = useBoardStore((s) => s.setHydrateStatus)
  const setError = useBoardStore((s) => s.setError)
  const sync = useBoardStore((s) => s.sync)

  const fetchBoard = useCallback(async () => {
    if (!boardId) return

    setHydrateStatus('loading')

    const result = await hydrateBoardState(boardId)

    if (result.error) {
      setError(result.error)
      return
    }

    if (result.data) {
      hydrate({
        board: result.data.board,
        nodes: result.data.nodes,
        edges: result.data.edges,
        chatThread: result.data.chatThread,
      })
    }
  }, [boardId, hydrate, setHydrateStatus, setError])

  useEffect(() => {
    fetchBoard()
  }, [fetchBoard])

  return { boardId, sync, retry: fetchBoard }
}
