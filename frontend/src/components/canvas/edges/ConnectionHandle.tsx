interface ConnectionHandleProps {
  nodeId: string
  onConnectionStart: (nodeId: string, e: React.PointerEvent) => void
}

export function ConnectionHandle({ nodeId, onConnectionStart }: ConnectionHandleProps) {
  return (
    <div
      className="absolute top-1/2 -right-2 w-3 h-3 rounded-full bg-gray-300 hover:bg-blue-500 hover:scale-125 transition-all cursor-crosshair"
      style={{ transform: 'translateY(-50%)', zIndex: 10 }}
      onPointerDown={(e) => {
        e.stopPropagation()
        onConnectionStart(nodeId, e)
      }}
    />
  )
}
