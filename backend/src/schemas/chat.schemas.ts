import { z } from 'zod';
import { limits } from '../config/limits.js';

// ─── Request Schemas ──────────────────────────────────────────────────────────

const SelectionContextSchema = z.object({
  selectedNodeIds: z.array(z.string().uuid()).max(limits.chat.selectionMaxNodeIds).optional(),
  selectedEdgeIds: z.array(z.string().uuid()).max(limits.chat.selectionMaxEdgeIds).optional(),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number().positive(),
  }).optional(),
});

export const SendMessageRequestSchema = z.object({
  message: z.string().min(limits.chat.messageText.min).max(limits.chat.messageText.max),
  selectionContext: SelectionContextSchema.optional(),
});

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export type SelectionContext = z.infer<typeof SelectionContextSchema>;

// ─── Response Types ───────────────────────────────────────────────────────────

export interface ChatMessageResponse {
  id: string;
  threadId: string;
  senderType: 'user' | 'agent' | 'system';
  messageText: string | null;
  messageJson: Record<string, unknown>;
  selectionContext: Record<string, unknown>;
  createdAt: string;
}

export interface GetChatResponse {
  thread: { id: string; boardId: string };
  messages: ChatMessageResponse[];
}

export interface SendMessageResponse {
  userMessage: ChatMessageResponse;
  agentMessage: ChatMessageResponse | null;
}
