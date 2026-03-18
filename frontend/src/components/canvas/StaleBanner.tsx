// T038: StaleBanner — shown when suggestion is outdated
import { useBoardStore } from '@/store/board.store'
import { useSuggest } from '@/hooks/useSuggest'

export function StaleBanner() {
  const previewStale = useBoardStore((s) => s.agentState.previewStale)
  const previewVisible = useBoardStore((s) => s.agentState.previewVisible)
  const boardId = useBoardStore((s) => s.boardId)
  const { dismissSuggestion, submitSuggest } = useSuggest(boardId)
  const draftText = useBoardStore((s) => s.chatState.draftText)

  if (!previewStale || !previewVisible) return null

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1001] bg-amber-50 border border-amber-300 rounded-md px-4 py-2 shadow-sm flex items-center gap-3 text-xs">
      <span className="text-amber-700">
        This suggestion may be outdated — the board has changed since it was generated.
      </span>
      <button
        onClick={dismissSuggestion}
        className="text-amber-600 hover:text-amber-800 underline"
      >
        Dismiss
      </button>
      <button
        onClick={() => {
          if (draftText) submitSuggest(draftText)
        }}
        className="text-amber-600 hover:text-amber-800 underline"
      >
        Re-request
      </button>
    </div>
  )
}
