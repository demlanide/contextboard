import { useEffect, useRef } from 'react'

interface InlineEditorProps {
  initialValue: string
  onCommit: (value: string) => void
  onCancel: () => void
}

export function InlineEditor({ initialValue, onCommit, onCancel }: InlineEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.focus()
      ref.current.value = initialValue
      ref.current.select()
    }
  }, [initialValue])

  const handleBlur = () => {
    const value = ref.current?.value ?? ''
    if (value !== initialValue) {
      onCommit(value)
    } else {
      onCancel()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <textarea
      ref={ref}
      className="w-full h-full resize-none border-none outline-none bg-transparent p-3 text-inherit font-inherit"
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  )
}
