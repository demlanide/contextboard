import { useBoardStore } from '@/store/board.store'
import { useNodeMutations } from '@/hooks/useNodeMutations'
import { InlineEditor } from './InlineEditor'
import type { BoardNode } from '@/store/types'

interface StickyNodeProps {
  node: BoardNode
}

export function StickyNode({ node }: StickyNodeProps) {
  const editingNodeId = useBoardStore((s) => s.ui.editingNodeId)
  const setEditingNodeId = useBoardStore((s) => s.setEditingNodeId)
  const { updateNodeContent } = useNodeMutations()

  const backgroundColor = (node.style.backgroundColor as string) ?? '#FFEB3B'
  const fontSize = (node.style.fontSize as number) ?? 14
  const textColor = (node.style.textColor as string) ?? '#000000'

  const isEditing = editingNodeId === node.id

  if (isEditing) {
    return (
      <div
        className="w-full h-full rounded-md shadow-md overflow-hidden"
        style={{ backgroundColor, color: textColor, fontSize }}
      >
        <InlineEditor
          initialValue={(node.content.text as string) ?? ''}
          onCommit={(value) => {
            updateNodeContent(node.id, { text: value })
            setEditingNodeId(null)
          }}
          onCancel={() => setEditingNodeId(null)}
        />
      </div>
    )
  }

  return (
    <div
      className="w-full h-full rounded-md shadow-md p-3 overflow-hidden select-none"
      style={{ backgroundColor, color: textColor, fontSize }}
    >
      <p className="whitespace-pre-wrap break-words">{node.content.text as string}</p>
    </div>
  )
}
