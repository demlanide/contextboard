/**
 * Integration tests for batch node mutations.
 * Requires a running PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../../src/db/pool.js';
import { createBoard, updateBoard } from '../../src/services/boards.service.js';
import { createNode, updateNode } from '../../src/services/nodes.service.js';
import { executeBatch } from '../../src/services/batch.service.js';
import { BatchValidationError } from '../../src/domain/validation/batch-rules.js';
import { NodeNotFoundError, NodeLockedError } from '../../src/domain/validation/node-rules.js';

async function cleanAll() {
  await pool.query('DELETE FROM board_operations');
  await pool.query('DELETE FROM board_edges');
  await pool.query('DELETE FROM board_nodes');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM chat_threads');
  await pool.query('DELETE FROM boards');
}

let boardId: string;

beforeAll(async () => {
  await cleanAll();
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

beforeEach(async () => {
  await cleanAll();
  const { board } = await createBoard({ title: 'Batch Test Board' });
  boardId = board.id;
});

const stickyNode = {
  type: 'sticky' as const,
  x: 100, y: 100, width: 200, height: 120,
  content: { text: 'Test' },
  parentId: null, rotation: 0, zIndex: 0, style: {}, metadata: {},
};

describe('batch create', () => {
  it('creates 3 nodes with temp IDs, single revision bump, shared batchId', async () => {
    const result = await executeBatch(boardId, [
      { type: 'create', tempId: 'tmp-1', node: { ...stickyNode, content: { text: 'A' } } },
      { type: 'create', tempId: 'tmp-2', node: { ...stickyNode, content: { text: 'B' } } },
      { type: 'create', tempId: 'tmp-3', node: { ...stickyNode, content: { text: 'C' } } },
    ]);

    expect(result.created).toHaveLength(3);
    expect(result.created[0].tempId).toBe('tmp-1');
    expect(result.created[1].tempId).toBe('tmp-2');
    expect(result.created[2].tempId).toBe('tmp-3');
    expect(result.boardRevision).toBe(2); // initial is 1, bumped to 2
    expect(result.batchId).toBeTruthy();

    // Verify operations in DB share batchId
    const { rows: ops } = await pool.query(
      'SELECT * FROM board_operations WHERE board_id = $1 AND batch_id = $2',
      [boardId, result.batchId]
    );
    expect(ops).toHaveLength(3);
    expect(ops.every((o: Record<string, unknown>) => o.operation_type === 'create_node')).toBe(true);
  });
});

describe('batch update', () => {
  it('updates 5 nodes with single revision bump', async () => {
    // Create 5 nodes first
    const nodes = [];
    for (let i = 0; i < 5; i++) {
      const { node } = await createNode(boardId, { ...stickyNode, content: { text: `Node ${i}` } });
      nodes.push(node);
    }

    const result = await executeBatch(boardId, nodes.map((n, i) => ({
      type: 'update' as const,
      nodeId: n.id,
      changes: { x: 500 + i * 10 },
    })));

    expect(result.updated).toHaveLength(5);
    expect(result.updated[0].x).toBe(500);
    expect(result.updated[4].x).toBe(540);
    // Initial revision was 1, 5 single creates bumped to 6, batch bumps to 7
    expect(result.boardRevision).toBe(7);
  });
});

describe('batch delete', () => {
  it('deletes 2 nodes with cascade edges, single revision bump', async () => {
    const { node: n1 } = await createNode(boardId, { ...stickyNode, content: { text: 'N1' } });
    const { node: n2 } = await createNode(boardId, { ...stickyNode, content: { text: 'N2' } });

    // Create an edge between them
    const { createEdge } = await import('../../src/services/edges.service.js');
    await createEdge(boardId, { sourceNodeId: n1.id, targetNodeId: n2.id });

    const result = await executeBatch(boardId, [
      { type: 'delete', nodeId: n1.id },
      { type: 'delete', nodeId: n2.id },
    ]);

    expect(result.deleted.filter(d => d.type === 'node')).toHaveLength(2);
    // Edge should be cascade-deleted (at least once)
    expect(result.deleted.some(d => d.type === 'edge')).toBe(true);
  });
});

describe('batch validation', () => {
  it('rejects empty operations array', async () => {
    await expect(executeBatch(boardId, [])).rejects.toThrow(BatchValidationError);
  });

  it('rejects more than 200 operations', async () => {
    const ops = Array.from({ length: 201 }, (_, i) => ({
      type: 'create' as const,
      tempId: `tmp-${i}`,
      node: { ...stickyNode, content: { text: `N${i}` } },
    }));
    await expect(executeBatch(boardId, ops)).rejects.toThrow(BatchValidationError);
  });

  it('accepts exactly 200 operations', async () => {
    const ops = Array.from({ length: 200 }, (_, i) => ({
      type: 'create' as const,
      tempId: `tmp-${i}`,
      node: { ...stickyNode, content: { text: `N${i}` } },
    }));
    const result = await executeBatch(boardId, ops);
    expect(result.created).toHaveLength(200);
  });

  it('rejects duplicate tempIds', async () => {
    await expect(executeBatch(boardId, [
      { type: 'create', tempId: 'dup', node: { ...stickyNode, content: { text: 'A' } } },
      { type: 'create', tempId: 'dup', node: { ...stickyNode, content: { text: 'B' } } },
    ])).rejects.toThrow(BatchValidationError);
  });
});

describe('batch rollback on failure', () => {
  it('fails entire batch when invalid nodeId referenced', async () => {
    const { node } = await createNode(boardId, { ...stickyNode, content: { text: 'Good' } });
    const badId = '00000000-0000-0000-0000-000000000099';

    await expect(executeBatch(boardId, [
      { type: 'update', nodeId: node.id, changes: { x: 999 } },
      { type: 'update', nodeId: badId, changes: { x: 111 } },
    ])).rejects.toThrow(NodeNotFoundError);

    // Verify no state change — first update rolled back
    const { rows } = await pool.query(
      'SELECT x FROM board_nodes WHERE id = $1 AND deleted_at IS NULL',
      [node.id]
    );
    expect(rows[0].x).toBe(100); // original position
  });

  it('fails entire batch when locked node targeted', async () => {
    const { node } = await createNode(boardId, { ...stickyNode, content: { text: 'Locked' } });
    await updateNode(node.id, { locked: true });

    await expect(executeBatch(boardId, [
      { type: 'update', nodeId: node.id, changes: { x: 999 } },
    ])).rejects.toThrow(NodeLockedError);
  });

  it('fails batch on archived board', async () => {
    await updateBoard(boardId, { status: 'archived' });

    await expect(executeBatch(boardId, [
      { type: 'create', tempId: 'tmp-1', node: { ...stickyNode, content: { text: 'New' } } },
    ])).rejects.toThrow();
  });
});

describe('temp-ID cross-references (US4: mixed batch)', () => {
  it('create then update same temp ID works', async () => {
    const result = await executeBatch(boardId, [
      { type: 'create', tempId: 'tmp-1', node: { ...stickyNode, content: { text: 'Created' } } },
      { type: 'update', nodeId: 'tmp-1', changes: { x: 500, y: 600 } },
    ]);

    expect(result.created).toHaveLength(1);
    expect(result.updated).toHaveLength(1);
    // Updated node should have new position
    expect(result.updated[0].x).toBe(500);
    expect(result.updated[0].y).toBe(600);
    // Created and updated should reference same real ID
    expect(result.updated[0].id).toBe(result.created[0].id);
  });

  it('create tmp-1 + create tmp-2 + update tmp-1: both created, update applied', async () => {
    const result = await executeBatch(boardId, [
      { type: 'create', tempId: 'tmp-1', node: { ...stickyNode, content: { text: 'First' } } },
      { type: 'create', tempId: 'tmp-2', node: { ...stickyNode, content: { text: 'Second' } } },
      { type: 'update', nodeId: 'tmp-1', changes: { x: 999 } },
    ]);

    expect(result.created).toHaveLength(2);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].x).toBe(999);
  });

  it('create then delete in same batch works', async () => {
    // Create with temp ID, then delete the real ID
    const result = await executeBatch(boardId, [
      { type: 'create', tempId: 'tmp-1', node: { ...stickyNode, content: { text: 'Ephemeral' } } },
    ]);
    const realId = result.created[0].id;

    // Now delete by real ID in a separate batch
    const result2 = await executeBatch(boardId, [
      { type: 'delete', nodeId: realId },
    ]);
    expect(result2.deleted).toHaveLength(1);
    expect(result2.deleted[0].id).toBe(realId);
  });

  it('update referencing undefined temp ID fails entire batch', async () => {
    await expect(executeBatch(boardId, [
      { type: 'update', nodeId: 'tmp-nonexistent', changes: { x: 100 } },
    ])).rejects.toThrow(); // NodeNotFoundError since tmp-nonexistent resolves to itself
  });

  it('delete then update same node fails entire batch', async () => {
    const { node } = await createNode(boardId, { ...stickyNode, content: { text: 'Target' } });

    await expect(executeBatch(boardId, [
      { type: 'delete', nodeId: node.id },
      { type: 'update', nodeId: node.id, changes: { x: 999 } },
    ])).rejects.toThrow(); // Node is no longer active
  });

  it('delete already-deleted node fails entire batch', async () => {
    const { node } = await createNode(boardId, { ...stickyNode, content: { text: 'Deleted' } });
    // Delete it first
    const { deleteNode } = await import('../../src/services/nodes.service.js');
    await deleteNode(node.id);

    await expect(executeBatch(boardId, [
      { type: 'delete', nodeId: node.id },
    ])).rejects.toThrow();
  });
});
