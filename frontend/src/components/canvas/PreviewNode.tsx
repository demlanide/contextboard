// T018: PreviewNode — renders a single preview node with distinct styling

interface Props {
  actionType: 'create' | 'update' | 'delete'
  x: number
  y: number
  width: number
  height: number
  text?: string | null
  patchText?: string | null
}

const STYLES = {
  create: {
    opacity: 0.6,
    border: '2px dashed #3b82f6', // blue
    bg: 'bg-blue-50',
  },
  update: {
    opacity: 0.8,
    border: '2px dashed #f59e0b', // amber
    bg: 'bg-amber-50',
  },
  delete: {
    opacity: 0.4,
    border: '2px dashed #ef4444', // red
    bg: 'bg-red-50',
  },
}

export function PreviewNode({ actionType, x, y, width, height, text, patchText }: Props) {
  const style = STYLES[actionType]

  return (
    <div
      className={`absolute rounded-md ${style.bg} pointer-events-none`}
      style={{
        left: x,
        top: y,
        width,
        height,
        opacity: style.opacity,
        border: style.border,
      }}
    >
      <div className="p-2 text-xs overflow-hidden h-full">
        {actionType === 'delete' && (
          <div className="line-through text-red-600">{text ?? 'Delete'}</div>
        )}
        {actionType === 'create' && (
          <div className="text-blue-700">{text ?? 'New node'}</div>
        )}
        {actionType === 'update' && (
          <div className="text-amber-700">{patchText ?? text ?? 'Update'}</div>
        )}
      </div>
      <div
        className={`absolute top-1 right-1 text-[9px] font-medium px-1 rounded ${
          actionType === 'create'
            ? 'bg-blue-200 text-blue-800'
            : actionType === 'update'
              ? 'bg-amber-200 text-amber-800'
              : 'bg-red-200 text-red-800'
        }`}
      >
        {actionType}
      </div>
    </div>
  )
}
