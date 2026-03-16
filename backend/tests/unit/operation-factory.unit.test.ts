import { describe, it, expect } from 'vitest';
import {
  buildOperation,
  updateBoardOperation,
  BuildOperationParams,
  OperationType,
} from '../../src/domain/operations/operation-factory.js';

const baseParams: BuildOperationParams = {
  boardId: 'board-uuid-1',
  boardRevision: 1,
  actorType: 'user',
  operationType: 'update_board',
  targetType: 'board',
  payload: { changes: { title: 'New' }, previous: { title: 'Old' } },
};

describe('buildOperation', () => {
  it('generates a UUID id', () => {
    const op = buildOperation(baseParams);
    expect(op.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('sets correct fields from params', () => {
    const op = buildOperation(baseParams);
    expect(op.board_id).toBe('board-uuid-1');
    expect(op.board_revision).toBe(1);
    expect(op.actor_type).toBe('user');
    expect(op.operation_type).toBe('update_board');
    expect(op.target_type).toBe('board');
    expect(op.payload).toEqual({ changes: { title: 'New' }, previous: { title: 'Old' } });
  });

  it('defaults targetId to null when omitted', () => {
    const op = buildOperation(baseParams);
    expect(op.target_id).toBeNull();
  });

  it('defaults batchId to null when omitted', () => {
    const op = buildOperation(baseParams);
    expect(op.batch_id).toBeNull();
  });

  it('defaults inversePayload to null when omitted', () => {
    const op = buildOperation(baseParams);
    expect(op.inverse_payload).toBeNull();
  });

  it('accepts explicit targetId', () => {
    const op = buildOperation({ ...baseParams, targetId: 'node-uuid-1' });
    expect(op.target_id).toBe('node-uuid-1');
  });

  it('accepts explicit batchId', () => {
    const op = buildOperation({ ...baseParams, batchId: 'batch-uuid-1' });
    expect(op.batch_id).toBe('batch-uuid-1');
  });

  it('accepts explicit inversePayload', () => {
    const inversePayload = { changes: { title: 'Old' }, previous: { title: 'New' } };
    const op = buildOperation({ ...baseParams, inversePayload });
    expect(op.inverse_payload).toEqual(inversePayload);
  });

  it('generates unique ids for each call', () => {
    const op1 = buildOperation(baseParams);
    const op2 = buildOperation(baseParams);
    expect(op1.id).not.toBe(op2.id);
  });

  it('accepts all valid OperationType values', () => {
    const types: OperationType[] = [
      'update_board',
      'create_node', 'update_node', 'delete_node', 'restore_node',
      'create_edge', 'update_edge', 'delete_edge',
      'create_asset', 'apply_agent_action_batch', 'create_snapshot',
    ];
    for (const operationType of types) {
      const op = buildOperation({ ...baseParams, operationType });
      expect(op.operation_type).toBe(operationType);
    }
  });
});

describe('updateBoardOperation (convenience wrapper)', () => {
  it('delegates to buildOperation with update_board type', () => {
    const op = updateBoardOperation('board-1', 3, { title: 'New' }, { title: 'Old' });
    expect(op.operation_type).toBe('update_board');
    expect(op.board_id).toBe('board-1');
    expect(op.board_revision).toBe(3);
    expect(op.actor_type).toBe('user');
    expect(op.target_type).toBe('board');
    expect(op.target_id).toBe('board-1');
    expect(op.payload).toEqual({ changes: { title: 'New' }, previous: { title: 'Old' } });
    expect(op.inverse_payload).toBeNull();
    expect(op.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
