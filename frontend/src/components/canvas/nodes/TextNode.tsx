import { useBoardStore } from '@/store/board.store'
import { useNodeMutations } from '@/hooks/useNodeMutations'
import { InlineEditor } from './InlineEditor'
import type { BoardNode } from '@/store/types'

interface TextNodeProps {
  node: BoardNode
}

export function TextNode({ node }: TextNodeProps) {
  const editingNodeId = useBoardStore((s) => s.ui.editingNodeId)
  const setEditingNodeId = useBoardStore((s) => s.setEditingNodeId)
  const { updateNodeContent } = useNodeMutations()

  const fontSize = (node.style.fontSize as number) ?? 14
  const textColor = (node.style.textColor as string) ?? '#000000'
  const fontWeight = (node.style.fontWeight as string) ?? 'normal'
  const title = node.content.title as string | undefined
  const text = node.content.text as string

  const isEditing = editingNodeId === node.id

  if (isEditing) {
    return (
      <div className="w-full h-full overflow-hidden" style={{ color: textColor, fontSize }}>
        <InlineEditor
          initialValue={text ?? ''}
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
      className="w-full h-full p-3 overflow-hidden select-none"
      style={{ color: textColor, fontSize }}
    >
      {title && (
        <h3 className="font-bold text-base mb-1">{title}</h3>
      )}
      <p className="whitespace-pre-wrap break-words" style={{ fontWeight }}>
        {text}
      </p>
    </div>
  )
}
