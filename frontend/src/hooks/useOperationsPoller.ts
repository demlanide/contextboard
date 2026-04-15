import { useEffect, useRef } from 'react'
import { useBoardStore } from '@/store/board.store'
import { fetchBoardOperations } from '@/api/operations.api'
import { hydrateBoardState } from '@/api/boards.api'

const POLL_INTERVAL_ACTIVE_MS = 10_000
const POLL_INTERVAL_BACKGROUND_MS = 30_000
const MAX_RETRIES = 3
const MAX_DRAIN_PAGES = 10

function hasInFlightMutations(): boolean {
  const state = useBoardStore.getState()
  if (state.batchMutation.status === 'pending') return true
  if (state.agentState.applyStatus === 'running') return true
  if (Object.values(state.nodeMutationStatus).some((s) => s === 'pending')) return true
  if (Object.keys(state.pendingNodes).length > 0) return true
  return false
}

export function useOperationsPoller(boardId: string): void {
  const boardIdRef = useRef(boardId)
  boardIdRef.current = boardId

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const isPollingRef = useRef(false)

  // Use a ref to hold the poll function so it can be self-referential without stale closures
  const pollRef = useRef<(drainPage?: number) => Promise<void>>(async () => {})

  useEffect(() => {
    retryCountRef.current = 0
    isPollingRef.current = false

    const scheduleNext = () => {
      if (intervalRef.current !== null) clearTimeout(intervalRef.current)
      const delay =
        document.visibilityState === 'visible'
          ? POLL_INTERVAL_ACTIVE_MS
          : POLL_INTERVAL_BACKGROUND_MS
      intervalRef.current = setTimeout(() => pollRef.current(), delay)
    }

    const rehydrate = async (): Promise<boolean> => {
      const store = useBoardStore.getState()
      store.markStale()
      const result = await hydrateBoardState(boardIdRef.current)
      if (result.error || !result.data) {
        useBoardStore.getState().setPollingStatus('error')
        return false
      }
      useBoardStore.getState().hydrate({
        board: result.data.board,
        nodes: result.data.nodes,
        edges: result.data.edges,
        chatThread: result.data.chatThread,
      })
      // hydrate() resets pollingCursor = board.revision, stale = false, pollingStatus = 'idle'
      retryCountRef.current = 0
      return true
    }

    const poll = async (drainPage = 0): Promise<void> => {
      const state = useBoardStore.getState()
      const cursor = state.sync.pollingCursor

      // Skip: cursor not ready yet
      if (cursor === null) {
        scheduleNext()
        return
      }

      // Skip: concurrent poll in progress
      if (isPollingRef.current) {
        scheduleNext()
        return
      }

      // Pause: durable mutation in flight (FR-016)
      if (hasInFlightMutations()) {
        scheduleNext()
        return
      }

      isPollingRef.current = true
      useBoardStore.getState().setPollingStatus('polling')

      try {
        const result = await fetchBoardOperations(boardIdRef.current, cursor)

        // 410 Stale cursor → rehydrate
        if (result.status === 410) {
          isPollingRef.current = false
          await rehydrate()
          scheduleNext()
          return
        }

        // 404 Board gone → stop polling permanently
        if (result.status === 404) {
          console.error(`[useOperationsPoller] Board ${boardIdRef.current} not found — stopping`)
          useBoardStore.getState().setPollingStatus('error')
          return
        }

        // Network / 5xx errors
        if (!result.data || result.error) {
          retryCountRef.current++
          if (retryCountRef.current >= MAX_RETRIES) {
            useBoardStore.getState().setPollingStatus('error')
          } else {
            useBoardStore.getState().setPollingStatus('idle')
            scheduleNext()
          }
          return
        }

        // Success (200)
        const { operations, nextCursor, headRevision } = result.data

        // Apply operations in revision order
        for (const op of operations) {
          useBoardStore.getState().applyPolledOperation(op)
        }

        // Advance cursor to last applied revision
        if (operations.length > 0) {
          const lastOp = operations[operations.length - 1]
          useBoardStore.getState().setPollingCursor(lastOp.boardRevision)
        }

        retryCountRef.current = 0

        // Gap detection: server is ahead but returned no ops (US3)
        const freshCursor = useBoardStore.getState().sync.pollingCursor ?? cursor
        if (operations.length === 0 && headRevision > freshCursor) {
          isPollingRef.current = false
          await rehydrate()
          scheduleNext()
          return
        }

        useBoardStore.getState().setPollingStatus('idle')

        // Drain mode: immediately re-poll if more pages available (US2)
        if (nextCursor !== null && drainPage < MAX_DRAIN_PAGES) {
          isPollingRef.current = false
          await poll(drainPage + 1)
          return
        }

        scheduleNext()
      } catch {
        retryCountRef.current++
        if (retryCountRef.current >= MAX_RETRIES) {
          useBoardStore.getState().setPollingStatus('error')
        } else {
          useBoardStore.getState().setPollingStatus('idle')
          scheduleNext()
        }
      } finally {
        isPollingRef.current = false
      }
    }

    pollRef.current = poll

    // Start initial poll
    poll()

    // Re-poll immediately when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (intervalRef.current !== null) {
          clearTimeout(intervalRef.current)
          intervalRef.current = null
        }
        poll()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (intervalRef.current !== null) {
        clearTimeout(intervalRef.current)
        intervalRef.current = null
      }
      isPollingRef.current = false
    }
  }, [boardId])
}
