import { useState, useCallback } from 'react'
import { useBoardStore } from '@/store/board.store'
import { env } from '@/config/env'
import * as nodesApi from '@/api/nodes.api'
import type { BoardAsset } from '@/store/types'

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'
type PlacementStatus = 'idle' | 'placing' | 'success' | 'error'

interface UploadState {
  uploadStatus: UploadStatus
  placementStatus: PlacementStatus
  asset: BoardAsset | null
  uploadError: string | null
  placementError: string | null
}

const INITIAL_STATE: UploadState = {
  uploadStatus: 'idle',
  placementStatus: 'idle',
  asset: null,
  uploadError: null,
  placementError: null,
}

const MAX_BOUNDING_BOX = 400

function computeNodeDimensions(width: number | null, height: number | null): { w: number; h: number } {
  if (!width || !height) return { w: MAX_BOUNDING_BOX, h: MAX_BOUNDING_BOX }
  const aspect = width / height
  if (width >= height) {
    const w = Math.min(width, MAX_BOUNDING_BOX)
    return { w, h: Math.round(w / aspect) }
  }
  const h = Math.min(height, MAX_BOUNDING_BOX)
  return { w: Math.round(h * aspect), h }
}

export function useImageUpload() {
  const [state, setState] = useState<UploadState>(INITIAL_STATE)
  const store = useBoardStore

  const startUpload = useCallback(async (file: File, targetX?: number, targetY?: number) => {
    const boardId = store.getState().boardId
    if (!boardId) return

    setState({ ...INITIAL_STATE, uploadStatus: 'uploading' })

    // Step 1: Upload asset
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('boardId', boardId)

      const response = await fetch(`${env.apiBaseUrl}/assets/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
        },
      })

      if (!response.ok) {
        const envelope = await response.json().catch(() => null)
        const message = envelope?.error?.message ?? `Upload failed (${response.status})`
        setState((s) => ({ ...s, uploadStatus: 'error', uploadError: message }))
        return
      }

      const envelope = await response.json()
      const asset: BoardAsset = envelope.data.asset
      const boardRevision: number = envelope.data.boardRevision

      // Store asset in board store
      store.getState().addAsset(asset)
      if (store.getState().board) {
        // Update revision from upload
      }

      setState((s) => ({ ...s, uploadStatus: 'success', asset }))

      // Step 2: Place image node
      setState((s) => ({ ...s, placementStatus: 'placing' }))

      const { w, h } = computeNodeDimensions(asset.width, asset.height)
      const x = targetX ?? 100
      const y = targetY ?? 100

      const tempId = crypto.randomUUID()
      store.getState().addPendingNode(tempId, {
        type: 'image',
        x,
        y,
        width: w,
        height: h,
        content: { assetId: asset.id },
        style: {},
        metadata: {},
        locked: false,
        hidden: false,
        rotation: 0,
        zIndex: 0,
      })

      const nodeResult = await nodesApi.createNode(boardId, {
        type: 'image',
        x,
        y,
        width: w,
        height: h,
        content: { assetId: asset.id },
        style: {},
      })

      if (nodeResult.data) {
        store.getState().confirmNode(tempId, nodeResult.data.node, nodeResult.data.boardRevision)
        setState((s) => ({ ...s, placementStatus: 'success' }))
      } else {
        store.getState().rollbackPendingNode(tempId)
        setState((s) => ({
          ...s,
          placementStatus: 'error',
          placementError: nodeResult.error?.message ?? 'Failed to place image node',
        }))
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        uploadStatus: s.uploadStatus === 'uploading' ? 'error' : s.uploadStatus,
        uploadError: s.uploadStatus === 'uploading' ? 'Network error during upload' : s.uploadError,
      }))
    }
  }, [store])

  const retryPlacement = useCallback(async (targetX?: number, targetY?: number) => {
    const boardId = store.getState().boardId
    const asset = state.asset
    if (!boardId || !asset) return

    setState((s) => ({ ...s, placementStatus: 'placing', placementError: null }))

    const { w, h } = computeNodeDimensions(asset.width, asset.height)
    const x = targetX ?? 100
    const y = targetY ?? 100

    const tempId = crypto.randomUUID()
    store.getState().addPendingNode(tempId, {
      type: 'image',
      x,
      y,
      width: w,
      height: h,
      content: { assetId: asset.id },
      style: {},
      metadata: {},
      locked: false,
      hidden: false,
      rotation: 0,
      zIndex: 0,
    })

    const nodeResult = await nodesApi.createNode(boardId, {
      type: 'image',
      x,
      y,
      width: w,
      height: h,
      content: { assetId: asset.id },
      style: {},
    })

    if (nodeResult.data) {
      store.getState().confirmNode(tempId, nodeResult.data.node, nodeResult.data.boardRevision)
      setState((s) => ({ ...s, placementStatus: 'success' }))
    } else {
      store.getState().rollbackPendingNode(tempId)
      setState((s) => ({
        ...s,
        placementStatus: 'error',
        placementError: nodeResult.error?.message ?? 'Failed to place image node',
      }))
    }
  }, [store, state.asset])

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return {
    ...state,
    startUpload,
    retryPlacement,
    reset,
    isActive: state.uploadStatus !== 'idle',
  }
}
