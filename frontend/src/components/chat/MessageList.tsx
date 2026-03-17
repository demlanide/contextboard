import { useEffect, useRef } from 'react'
import type { ChatMessage } from '@/store/types'
import { MessageBubble } from './MessageBubble'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

interface MessageListProps {
  messages: ChatMessage[]
  loadStatus: 'idle' | 'loading' | 'ready' | 'error'
}

export function MessageList({ messages, loadStatus }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (loadStatus === 'loading') {
    return <LoadingSpinner />
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-sm text-gray-400">No messages yet. Start a conversation!</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
