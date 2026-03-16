import { useState, useEffect, useCallback } from 'react'
import { listBoards, toBoardListItem } from '@/api/boards.api'
import type { BoardListItem, SyncError } from '@/store/types'

async function fetchBoardList() {
  return listBoards()
}

export function useBoards() {
  const [boards, setBoards] = useState<BoardListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<SyncError | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const result = await fetchBoardList()

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    if (result.data) {
      setBoards(result.data.boards.map(toBoardListItem))
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    fetchBoardList().then((result) => {
      if (cancelled) return

      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      if (result.data) {
        setBoards(result.data.boards.map(toBoardListItem))
      }

      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { boards, loading, error, refetch: load }
}
