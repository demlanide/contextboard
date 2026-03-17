import { apiRequest } from './client'
import type { BoardAsset } from '@/store/types'

interface UploadAssetResponse {
  asset: BoardAsset
  boardRevision: number
}

export function getAssetMetadata(assetId: string) {
  return apiRequest<{ asset: BoardAsset }>(`/assets/${assetId}`)
}

// Note: uploadAsset uses FormData directly (not JSON), so it's handled
// in useImageUpload with raw fetch. This function is for typed metadata retrieval.
