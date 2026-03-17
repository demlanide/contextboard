import { useState, useCallback, useEffect } from 'react'

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

interface DropZoneProps {
  onFileDrop: (file: File, x: number, y: number) => void
  panOffset: { x: number; y: number }
}

export function DropZone({ onFileDrop, panOffset }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [dragCount, setDragCount] = useState(0)

  // Track drag enter/leave at the document level to show overlay
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        setDragCount((c) => c + 1)
      }
    }
    const handleDragLeave = () => {
      setDragCount((c) => Math.max(0, c - 1))
    }
    const handleDrop = () => {
      setDragCount(0)
    }
    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
    }
  }, [])

  const showOverlay = dragCount > 0

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    setDragCount(0)

    const file = e.dataTransfer.files[0]
    if (!file || !ACCEPTED_TYPES.has(file.type)) return

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left - panOffset.x
    const y = e.clientY - rect.top - panOffset.y

    onFileDrop(file, x, y)
  }, [onFileDrop, panOffset])

  if (!showOverlay) return null

  return (
    <div
      className="absolute inset-0 z-40"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center pointer-events-none">
          <span className="text-blue-600 text-lg font-medium bg-white/80 px-4 py-2 rounded-lg">
            Drop image here
          </span>
        </div>
      )}
    </div>
  )
}
