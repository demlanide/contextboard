// T033: SuggestModeToggle — segmented button for Chat / Suggest modes

interface Props {
  mode: 'suggest' | 'apply'
  onChange: (mode: 'suggest' | 'apply') => void
}

export function SuggestModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex rounded-md border border-gray-200 text-xs overflow-hidden">
      <button
        onClick={() => onChange('apply')}
        className={`px-3 py-1 transition-colors ${
          mode !== 'suggest'
            ? 'bg-white text-gray-700 font-medium'
            : 'bg-gray-50 text-gray-400 hover:text-gray-600'
        }`}
      >
        Chat
      </button>
      <button
        onClick={() => onChange('suggest')}
        className={`px-3 py-1 transition-colors ${
          mode === 'suggest'
            ? 'bg-purple-50 text-purple-700 font-medium border-l border-purple-200'
            : 'bg-gray-50 text-gray-400 hover:text-gray-600 border-l border-gray-200'
        }`}
      >
        Suggest
      </button>
    </div>
  )
}
