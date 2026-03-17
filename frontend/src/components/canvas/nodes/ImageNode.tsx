import { useState } from 'react'
import { useBoardStore } from '@/store/board.store'
import { env } from '@/config/env'
import type { BoardNode } from '@/store/types'

interface ImageNodeProps {
  node: BoardNode
}

export function ImageNode({ node }: ImageNodeProps) {
  const [loadError, setLoadError] = useState(false)
  const assetsById = useBoardStore((s) => s.assetsById)

  const assetId = node.content.assetId as string | undefined
  const caption = node.content.caption as string | undefined

  const asset = assetId ? assetsById[assetId] : null
  const imageUrl = asset?.url
    ? `${env.apiBaseUrl}${asset.url}`
    : assetId
      ? `${env.apiBaseUrl}/assets/${assetId}/file`
      : null

  if (!imageUrl) {
    return (
      <div className="w-full h-full rounded-md border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 select-none">
        <span className="text-gray-400 text-sm">No image</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full rounded-md shadow-md overflow-hidden bg-white select-none flex flex-col">
      <div className="flex-1 min-h-0 relative">
        {loadError ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <span className="text-gray-400 text-sm">Failed to load image</span>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={caption ?? 'Image'}
            className="w-full h-full object-contain"
            onError={() => setLoadError(true)}
            draggable={false}
          />
        )}
      </div>
      {caption && (
        <div className="px-2 py-1 text-xs text-gray-600 truncate border-t border-gray-100">
          {caption}
        </div>
      )}
    </div>
  )
}
