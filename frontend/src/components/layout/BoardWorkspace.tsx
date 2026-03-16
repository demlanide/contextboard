import { ChatSidebar, ChatSidebarToggle } from './ChatSidebar'
import { CanvasContainer } from './CanvasContainer'

export function BoardWorkspace() {
  return (
    <div className="flex flex-1 min-h-0 relative">
      <ChatSidebar />
      <CanvasContainer />
      <ChatSidebarToggle />
    </div>
  )
}
