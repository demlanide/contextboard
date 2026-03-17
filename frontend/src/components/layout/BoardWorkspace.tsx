import { ChatSidebar, ChatSidebarToggle } from './ChatSidebar'
import { Canvas } from '../canvas/Canvas'

export function BoardWorkspace() {
  return (
    <div className="flex flex-1 min-h-0 relative">
      <ChatSidebar />
      <Canvas />
      <ChatSidebarToggle />
    </div>
  )
}
