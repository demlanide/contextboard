import { useEffect, useRef } from 'react'

interface UndoToastProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

export function UndoToast({ message, onUndo, onDismiss }: UndoToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timerRef.current)
  }, [onDismiss])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg">
      <span className="text-sm">{message}</span>
      <button
        className="text-sm font-medium text-blue-300 hover:text-blue-200 transition-colors"
        onClick={onUndo}
      >
        Undo
      </button>
    </div>
  )
}
