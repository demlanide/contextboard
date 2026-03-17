import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/tx.js';
import { limits } from '../config/limits.js';
import { assertBoardExists } from '../domain/validation/board-rules.js';
import {
  assertBoardChatWritable,
  assertThreadExists,
  validateMessageText,
  validateSelectionContext,
} from '../domain/validation/chat-rules.js';
import { findBoardById } from '../repos/boards.repo.js';
import { findByBoardId as findThreadByBoardId } from '../repos/chat-threads.repo.js';
import * as chatMessagesRepo from '../repos/chat-messages.repo.js';
import { generateAgentResponse } from '../agent/agent-stub.js';
import { logger } from '../obs/logger.js';
import type { ChatMessageResponse, GetChatResponse, SendMessageResponse, SendMessageRequest } from '../schemas/chat.schemas.js';

export async function getChatHistory(boardId: string): Promise<GetChatResponse> {
  return withTransaction(async (client) => {
    const board = await findBoardById(client, boardId);
    assertBoardExists(board);

    const thread = await findThreadByBoardId(client, boardId);
    assertThreadExists(thread);

    const messages = await chatMessagesRepo.findByThreadId(
      client,
      thread.id,
      limits.chat.messagesPerLoad
    );

    return {
      thread: { id: thread.id, boardId: thread.boardId },
      messages,
    };
  });
}

export async function sendMessage(
  boardId: string,
  request: SendMessageRequest
): Promise<SendMessageResponse> {
  // Validate and persist user message within a transaction
  const { userMessage, threadId } = await withTransaction(async (client) => {
    const board = await findBoardById(client, boardId);
    assertBoardChatWritable(board);

    const thread = await findThreadByBoardId(client, boardId);
    assertThreadExists(thread);

    validateMessageText(request.message);
    validateSelectionContext(request.selectionContext as Record<string, unknown> | undefined);

    const userMsg = await chatMessagesRepo.insertMessage(client, {
      id: randomUUID(),
      thread_id: thread.id,
      sender_type: 'user',
      message_text: request.message,
      message_json: {},
      selection_context: (request.selectionContext as Record<string, unknown>) ?? {},
    });

    logger.info('Chat message persisted', {
      boardId,
      threadId: thread.id,
      messageId: userMsg.id,
      senderType: 'user',
    });

    return { userMessage: userMsg, threadId: thread.id };
  });

  // Attempt agent response outside the user message transaction
  let agentMessage: ChatMessageResponse | null = null;
  try {
    const startTime = Date.now();
    const agentResponse = await generateAgentResponse({
      boardId,
      messageText: request.message,
      selectionContext: (request.selectionContext as Record<string, unknown>) ?? {},
    });
    const duration = Date.now() - startTime;

    // Persist agent message in separate transaction
    agentMessage = await withTransaction(async (client) => {
      const msg = await chatMessagesRepo.insertMessage(client, {
        id: randomUUID(),
        thread_id: threadId,
        sender_type: 'agent',
        message_text: agentResponse.text,
        message_json: agentResponse.messageJson,
        selection_context: {},
      });

      logger.info('Agent response persisted', {
        boardId,
        threadId,
        messageId: msg.id,
        senderType: 'agent',
        durationMs: duration,
      });

      return msg;
    });
  } catch (err) {
    logger.warn('Agent response failed', {
      boardId,
      threadId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { userMessage, agentMessage };
}
