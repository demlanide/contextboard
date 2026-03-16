import { RetryButton } from './RetryButton'

interface ErrorMessageProps {
  message: string
  retryable?: boolean
  onRetry?: () => void
  onBack?: () => void
}

export function ErrorMessage({ message, retryable = false, onRetry, onBack }: ErrorMessageProps) {
  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center" role="alert">
      <p className="text-lg text-red-600">{message}</p>
      <div className="flex gap-3">
        {retryable && onRetry && <RetryButton onClick={onRetry} />}
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Go Back
          </button>
        )}
      </div>
    </div>
  )
}
