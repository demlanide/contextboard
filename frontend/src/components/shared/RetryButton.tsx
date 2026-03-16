interface RetryButtonProps {
  onClick: () => void
  label?: string
}

export function RetryButton({ onClick, label = 'Try Again' }: RetryButtonProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
    >
      {label}
    </button>
  )
}
