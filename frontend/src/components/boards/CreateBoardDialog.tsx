import { useState } from 'react'
import { useNavigate } from 'react-router'
import { createBoard } from '@/api/boards.api'
import type { SyncError } from '@/store/types'

interface CreateBoardDialogProps {
  onClose: () => void
}

export function CreateBoardDialog({ onClose }: CreateBoardDialogProps) {
  const [title, setTitle] = useState('Untitled Board')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<SyncError | null>(null)
  const navigate = useNavigate()

  const handleCreate = async () => {
    setCreating(true)
    setError(null)

    const result = await createBoard(title.trim() || 'Untitled Board')

    if (result.error) {
      setError(result.error)
      setCreating(false)
      return
    }

    if (result.data) {
      navigate(`/boards/${result.data.board.id}`)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Board</h2>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
          maxLength={200}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !creating) handleCreate()
          }}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error.message}</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
