import { useEffect, useRef } from 'react'

interface ErrorToastProps {
  message: string
  onDismiss: () => void
}

export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timerRef.current)
  }, [onDismiss])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg">
      <span className="text-sm">{message}</span>
      <button
        className="text-sm font-medium text-red-200 hover:text-white transition-colors"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  )
}
