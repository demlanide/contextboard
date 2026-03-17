interface UploadProgressProps {
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error'
  placementStatus: 'idle' | 'placing' | 'success' | 'error'
  uploadError: string | null
  placementError: string | null
  onRetryPlacement?: () => void
  onDismiss: () => void
}

export function UploadProgress({
  uploadStatus,
  placementStatus,
  uploadError,
  placementError,
  onRetryPlacement,
  onDismiss,
}: UploadProgressProps) {
  if (uploadStatus === 'idle') return null

  // Auto-dismiss on full success after a short delay
  const isFullSuccess = uploadStatus === 'success' && placementStatus === 'success'

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white rounded-lg shadow-lg border border-gray-200 px-4 py-3 min-w-[280px]">
      <div className="flex flex-col gap-1.5 text-sm">
        {/* Upload status */}
        <div className="flex items-center gap-2">
          {uploadStatus === 'uploading' && (
            <>
              <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-700">Uploading...</span>
            </>
          )}
          {uploadStatus === 'success' && (
            <>
              <span className="text-green-500">&#10003;</span>
              <span className="text-gray-700">Upload complete</span>
            </>
          )}
          {uploadStatus === 'error' && (
            <>
              <span className="text-red-500">&#10007;</span>
              <span className="text-red-600">{uploadError ?? 'Upload failed'}</span>
            </>
          )}
        </div>

        {/* Placement status (only show after upload succeeds) */}
        {uploadStatus === 'success' && placementStatus !== 'idle' && (
          <div className="flex items-center gap-2">
            {placementStatus === 'placing' && (
              <>
                <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-700">Placing on canvas...</span>
              </>
            )}
            {placementStatus === 'success' && (
              <>
                <span className="text-green-500">&#10003;</span>
                <span className="text-gray-700">Placed on canvas</span>
              </>
            )}
            {placementStatus === 'error' && (
              <div className="flex items-center gap-2">
                <span className="text-red-500">&#10007;</span>
                <span className="text-red-600">{placementError ?? 'Placement failed'}</span>
                {onRetryPlacement && (
                  <button
                    className="ml-2 text-blue-500 hover:text-blue-700 text-xs underline"
                    onClick={onRetryPlacement}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      {(isFullSuccess || uploadStatus === 'error' || placementStatus === 'error') && (
        <button
          className="absolute top-1 right-2 text-gray-400 hover:text-gray-600 text-lg leading-none"
          onClick={onDismiss}
        >
          &times;
        </button>
      )}
    </div>
  )
}
