import type { ChatMessage } from '@/store/types'
import { SelectionBadge } from './SelectionBadge'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.senderType === 'user'
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  const hasSelection =
    isUser &&
    message.selectionContext &&
    Object.keys(message.selectionContext).length > 0

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.messageText}</p>
        {hasSelection && <SelectionBadge selectionContext={message.selectionContext} />}
        <span
          className={`mt-1 block text-[10px] ${
            isUser ? 'text-blue-200' : 'text-gray-400'
          }`}
        >
          {time}
        </span>
      </div>
    </div>
  )
}
