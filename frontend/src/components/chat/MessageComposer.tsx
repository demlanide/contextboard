import { useState, useCallback, type KeyboardEvent } from 'react'

interface MessageComposerProps {
  onSend: (text: string) => void
  sending: boolean
  disabled?: boolean
  disabledText?: string
}

export function MessageComposer({ onSend, sending, disabled = false, disabledText }: MessageComposerProps) {
  const [text, setText] = useState('')

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || sending || disabled) return
    onSend(trimmed)
    setText('')
  }, [text, sending, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  if (disabled) {
    return (
      <div className="border-t border-gray-200 p-3">
        <p className="text-center text-xs text-gray-400">{disabledText ?? 'Chat is disabled'}</p>
      </div>
    )
  }

  return (
    <div className="border-t border-gray-200 p-3">
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={2}
          disabled={sending}
          className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending || disabled}
          className="self-end rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
