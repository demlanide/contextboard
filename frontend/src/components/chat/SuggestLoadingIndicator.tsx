// T034: SuggestLoadingIndicator — animated indicator while suggest is running
import { useEffect, useState } from 'react'

export function SuggestLoadingIndicator() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-purple-600">
      <div className="flex gap-1">
        <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
        <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
        <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
      </div>
      <span>{elapsed >= 5 ? 'Still working...' : 'Thinking...'}</span>
    </div>
  )
}
