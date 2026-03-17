import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardStore } from '@/store/board.store'
import type { HydrateBoardData, BoardNode, BoardEdge } from '@/store/types'

function makeNode(id: string, overrides: Partial<BoardNode> = {}): BoardNode {
  return {
    id,
    boardId: 'board-1',
    type: 'sticky',
    parentId: null,
    x: 10,
    y: 20,
    width: 100,
    height: 100,
    rotation: 0,
    zIndex: 0,
    content: { text: 'test' },
    style: {},
    metadata: {},
    locked: false,
    hidden: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeEdge(id: string, source: string, target: string): BoardEdge {
  return {
    id,
    boardId: 'board-1',
    sourceNodeId: source,
    targetNodeId: target,
    label: null,
    style: {},
    metadata: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const mockHydrateData: HydrateBoardData = {
  board: {
    id: 'board-1',
    title: 'Test Board',
    description: null,
    status: 'active',
    viewportState: { x: 0, y: 0, zoom: 1 },
    settings: { gridEnabled: true, snapToGrid: false, agentEditMode: 'suggest' },
    summary: {},
    revision: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  nodes: [makeNode('node-1'), makeNode('node-2', { x: 50, y: 60 }), makeNode('node-3', { x: 80, y: 90 })],
  edges: [makeEdge('edge-1', 'node-1', 'node-2')],
  chatThread: null,
}

beforeEach(() => {
  useBoardStore.getState().reset()
  useBoardStore.getState().hydrate(mockHydrateData)
})

describe('batchMoveOptimistic', () => {
  it('snapshots nodes and applies new positions', () => {
    useBoardStore.getState().batchMoveOptimistic([
      { nodeId: 'node-1', x: 200, y: 300 },
      { nodeId: 'node-2', x: 400, y: 500 },
    ])

    const state = useBoardStore.getState()
    expect(state.nodesById['node-1'].x).toBe(200)
    expect(state.nodesById['node-1'].y).toBe(300)
    expect(state.nodesById['node-2'].x).toBe(400)
    expect(state.nodesById['node-2'].y).toBe(500)
    expect(state.batchMutation.status).toBe('pending')
    expect(state.batchMutation.affectedNodeIds).toContain('node-1')
    expect(state.batchMutation.affectedNodeIds).toContain('node-2')
    // Snapshots should have original positions
    expect(state.batchMutation.snapshots['node-1'].x).toBe(10)
    expect(state.batchMutation.snapshots['node-2'].x).toBe(50)
  })
})

describe('reconcileBatch', () => {
  it('replaces nodes with server objects and updates revision', () => {
    useBoardStore.getState().batchMoveOptimistic([
      { nodeId: 'node-1', x: 200, y: 300 },
    ])

    const serverNode = makeNode('node-1', { x: 200, y: 300, updatedAt: '2026-01-03T00:00:00.000Z' })

    useBoardStore.getState().reconcileBatch({
      boardRevision: 6,
      created: [],
      updated: [serverNode],
      deleted: [],
    })

    const state = useBoardStore.getState()
    expect(state.nodesById['node-1'].updatedAt).toBe('2026-01-03T00:00:00.000Z')
    expect(state.board?.revision).toBe(6)
    expect(state.batchMutation.status).toBe('idle')
  })
})

describe('rollbackBatch', () => {
  it('restores snapshots on failure', () => {
    useBoardStore.getState().batchMoveOptimistic([
      { nodeId: 'node-1', x: 999, y: 999 },
    ])

    useBoardStore.getState().rollbackBatch()

    const state = useBoardStore.getState()
    expect(state.nodesById['node-1'].x).toBe(10) // original
    expect(state.nodesById['node-1'].y).toBe(20) // original
    expect(state.batchMutation.status).toBe('error')
  })
})

describe('batchDeleteOptimistic', () => {
  it('removes nodes and connected edges', () => {
    const { nodeSnapshots, edgeSnapshots } = useBoardStore.getState().batchDeleteOptimistic(['node-1', 'node-2'])

    const state = useBoardStore.getState()
    expect(state.nodesById['node-1']).toBeUndefined()
    expect(state.nodesById['node-2']).toBeUndefined()
    expect(state.nodesById['node-3']).toBeDefined() // not deleted
    expect(state.edgesById['edge-1']).toBeUndefined() // cascade
    expect(nodeSnapshots['node-1']).toBeDefined()
    expect(nodeSnapshots['node-2']).toBeDefined()
    expect(edgeSnapshots['edge-1']).toBeDefined()
    expect(state.batchMutation.status).toBe('pending')
  })
})

describe('rollbackBatchDelete', () => {
  it('restores nodes and edges from snapshots', () => {
    const { nodeSnapshots, edgeSnapshots } = useBoardStore.getState().batchDeleteOptimistic(['node-1'])

    useBoardStore.getState().rollbackBatchDelete(nodeSnapshots, edgeSnapshots)

    const state = useBoardStore.getState()
    expect(state.nodesById['node-1']).toBeDefined()
    expect(state.edgesById['edge-1']).toBeDefined()
    expect(state.batchMutation.status).toBe('error')
  })
})

describe('batchCreateOptimistic', () => {
  it('adds items to pendingNodes', () => {
    useBoardStore.getState().batchCreateOptimistic([
      { tempId: 'tmp-1', node: { type: 'sticky', x: 0, y: 0, width: 200, height: 120 } },
      { tempId: 'tmp-2', node: { type: 'text', x: 50, y: 50, width: 240, height: 160 } },
    ])

    const state = useBoardStore.getState()
    expect(state.pendingNodes['tmp-1']).toBeDefined()
    expect(state.pendingNodes['tmp-2']).toBeDefined()
    expect(state.batchMutation.status).toBe('pending')
    expect(state.batchMutation.affectedNodeIds).toContain('tmp-1')
    expect(state.batchMutation.affectedNodeIds).toContain('tmp-2')
  })
})

describe('confirmBatchCreate', () => {
  it('moves pending nodes to confirmed', () => {
    useBoardStore.getState().batchCreateOptimistic([
      { tempId: 'tmp-1', node: { type: 'sticky', x: 0, y: 0, width: 200, height: 120 } },
    ])

    const serverNode = makeNode('real-uuid-1', { x: 0, y: 0 })

    useBoardStore.getState().confirmBatchCreate({
      boardRevision: 6,
      created: [{ ...serverNode, tempId: 'tmp-1' }],
    })

    const state = useBoardStore.getState()
    expect(state.pendingNodes['tmp-1']).toBeUndefined()
    expect(state.nodesById['real-uuid-1']).toBeDefined()
    expect(state.board?.revision).toBe(6)
    expect(state.batchMutation.status).toBe('idle')
  })
})

describe('rollbackBatchCreate', () => {
  it('removes pending nodes on failure', () => {
    useBoardStore.getState().batchCreateOptimistic([
      { tempId: 'tmp-1', node: { type: 'sticky', x: 0, y: 0, width: 200, height: 120 } },
    ])

    useBoardStore.getState().rollbackBatchCreate()

    const state = useBoardStore.getState()
    expect(state.pendingNodes['tmp-1']).toBeUndefined()
    expect(state.batchMutation.status).toBe('error')
  })
})
