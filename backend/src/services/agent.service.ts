// T012: Agent service — orchestrates suggest flow
import { v4 as uuidv4 } from 'uuid';
import { withTransaction } from '../db/tx.js';
import { findBoardById } from '../repos/boards.repo.js';
import * as chatThreadsRepo from '../repos/chat-threads.repo.js';
import * as chatMessagesRepo from '../repos/chat-messages.repo.js';
import { assertBoardChatWritable, assertThreadExists } from '../domain/validation/chat-rules.js';
import { buildContextSnapshot } from '../agent/context-builder.js';
import { callLLM } from '../agent/llm-client.js';
import { validateLLMOutput, validateActionPlanReferences } from '../agent/output-validator.js';
import { buildPreview } from '../agent/preview-builder.js';
import { logger } from '../obs/logger.js';
import type { ChatMessage } from '../schemas/chat.schemas.js';
import type { ActionPlanItem, PreviewPayload } from '../agent/types.js';

export interface SuggestResult {
  message: ChatMessage;
  actionPlan: ActionPlanItem[];
  preview: PreviewPayload;
  error?: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

const EMPTY_PREVIEW: PreviewPayload = {
  affectedNodeIds: [],
  affectedEdgeIds: [],
  newNodeTempIds: [],
  newEdgeTempIds: [],
};

interface SelectionContext {
  selectedNodeIds?: string[];
  selectedEdgeIds?: string[];
  viewport?: { x: number; y: number; zoom: number };
}

export async function suggest(
  boardId: string,
  prompt: string,
  selectionContext: SelectionContext | undefined,
  requestId: string,
  images?: string[]
): Promise<SuggestResult> {
  const startTime = Date.now();

  // Step 1: Validate board and persist user message in transaction
  const { threadId, boardRevision } = await withTransaction(async (client) => {
    const board = await findBoardById(client, boardId);
    assertBoardChatWritable(board);

    const thread = await chatThreadsRepo.findByBoardId(client, boardId);
    assertThreadExists(thread);

    // Persist user message
    await chatMessagesRepo.insertMessage(client, {
      id: uuidv4(),
      thread_id: thread.id,
      sender_type: 'user',
      message_text: prompt,
      selection_context: selectionContext as Record<string, unknown> | undefined,
    });

    return { threadId: thread.id, boardRevision: board!.revision };
  });

  // Step 2: Build context, call LLM, validate, persist agent response
  try {
    // Build context snapshot (outside mutation transaction — read-only)
    const snapshot = await withTransaction(async (client) => {
      return buildContextSnapshot(boardId, boardRevision, selectionContext, { client });
    });

    logger.info('Context snapshot built', {
      requestId,
      boardId,
      duration: Date.now() - startTime,
      nodeCount: snapshot.nodes.selected.length + snapshot.nodes.nearby.length + snapshot.nodes.visible.length,
    });

    // Call LLM
    const llmStart = Date.now();
    const rawResponse = await callLLM(prompt, snapshot, { images });
    logger.info('LLM call completed', { requestId, duration: Date.now() - llmStart });

    // Validate schema
    const schemaResult = validateLLMOutput(rawResponse);
    if (!schemaResult.valid) {
      logger.warn('LLM output schema validation failed', { requestId, reasons: schemaResult.reasons });
      return persistAgentError(
        threadId,
        'I generated a suggestion, but it contained invalid actions that couldn\'t be applied to this board. Please try rephrasing your request.',
        'ACTION_PLAN_INVALID',
        'The suggestion contained actions that could not be validated.',
        { reasons: schemaResult.reasons }
      );
    }

    // Validate references (if plan is non-empty)
    if (schemaResult.parsed.actionPlan.length > 0) {
      const refResult = await withTransaction(async (client) => {
        return validateActionPlanReferences(schemaResult.parsed.actionPlan, boardId, { client });
      });

      if (!refResult.valid) {
        logger.warn('Action plan reference validation failed', { requestId, reasons: refResult.reasons });
        return persistAgentError(
          threadId,
          'I generated a suggestion, but some referenced items no longer exist or are locked. Please try again.',
          'ACTION_PLAN_INVALID',
          'The suggestion contained actions that could not be validated against the current board state.',
          { reasons: refResult.reasons }
        );
      }
    }

    // Build preview
    const preview = buildPreview(schemaResult.parsed.actionPlan);

    // Persist agent message with valid plan
    const agentMessage = await withTransaction(async (client) => {
      return chatMessagesRepo.insertMessage(client, {
        id: uuidv4(),
        thread_id: threadId,
        sender_type: 'agent',
        message_text: schemaResult.parsed.explanation,
        message_json: {
          actionPlan: schemaResult.parsed.actionPlan,
          confidence: schemaResult.parsed.confidence,
        },
      });
    });

    logger.info('Suggest completed successfully', {
      requestId,
      boardId,
      duration: Date.now() - startTime,
      actionPlanSize: schemaResult.parsed.actionPlan.length,
    });

    return {
      message: agentMessage,
      actionPlan: schemaResult.parsed.actionPlan,
      preview,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('Suggest failed', { requestId, boardId, error: errorMessage });

    // Determine error code
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('budget');
    const code = isTimeout ? 'AGENT_TIMEOUT' : 'AGENT_UNAVAILABLE';
    const userText = isTimeout
      ? "I wasn't able to generate suggestions in time. Please try again."
      : "I wasn't able to generate suggestions for this request. Please try again.";

    return persistAgentError(threadId, userText, code, errorMessage, {});
  }
}

async function persistAgentError(
  threadId: string,
  messageText: string,
  code: string,
  errorMessage: string,
  details: Record<string, unknown>
): Promise<SuggestResult> {
  const agentMessage = await withTransaction(async (client) => {
    return chatMessagesRepo.insertMessage(client, {
      id: uuidv4(),
      thread_id: threadId,
      sender_type: 'agent',
      message_text: messageText,
      message_json: {},
    });
  });

  return {
    message: agentMessage,
    actionPlan: [],
    preview: EMPTY_PREVIEW,
    error: { code, message: errorMessage, details },
  };
}
