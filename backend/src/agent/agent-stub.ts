import { env } from '../config/env.js';

export interface AgentContext {
  boardId: string;
  messageText: string;
  selectionContext?: Record<string, unknown>;
  boardContext?: Record<string, unknown>;
}

export interface AgentResponse {
  text: string;
  messageJson: Record<string, unknown>;
}

export async function generateAgentResponse(
  context: AgentContext
): Promise<AgentResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Agent response timed out'));
    }, env.AGENT_TIMEOUT_MS);

    // Stub: return canned acknowledgment immediately
    clearTimeout(timer);
    resolve({
      text: `I received your message. You said: "${context.messageText.slice(0, 100)}${context.messageText.length > 100 ? '...' : ''}"`,
      messageJson: {},
    });
  });
}
