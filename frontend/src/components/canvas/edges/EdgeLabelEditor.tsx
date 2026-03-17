import { useState, useRef, useEffect } from 'react'

interface EdgeLabelEditorProps {
  x: number
  y: number
  currentLabel: string | null
  onSubmit: (label: string | null) => void
  onCancel: () => void
}

export function EdgeLabelEditor({ x, y, currentLabel, onSubmit, onCancel }: EdgeLabelEditorProps) {
  const [value, setValue] = useState(currentLabel ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = () => {
    const trimmed = value.trim()
    onSubmit(trimmed === '' ? null : trimmed)
  }

  return (
    <div
      className="absolute"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
          if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
        onBlur={handleSubmit}
        className="px-2 py-1 text-sm border border-blue-400 rounded shadow-sm bg-white outline-none min-w-[120px] text-center"
        maxLength={1000}
        placeholder="Edge label"
      />
    </div>
  )
}
