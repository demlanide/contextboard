// T005: LLM client with stub/openai modes
import { env } from '../config/env.js';
import type { AgentContextSnapshot, LLMRawResponse } from './types.js';
import { logger } from '../obs/logger.js';
import { getThumbnailBase64 } from '../services/assets.service.js';

interface CallLLMOptions {
  timeoutMs?: number;
  totalBudgetMs?: number;
  maxRetries?: number;
  images?: string[];
}

const STUB_RESPONSE: LLMRawResponse = {
  explanation: 'I analyzed your board and have a suggestion for organizing your content.',
  confidence: 0.75,
  actionPlan: [],
  preview: {
    affectedNodeIds: [],
    affectedEdgeIds: [],
    newNodeTempIds: [],
    newEdgeTempIds: [],
  },
};

function buildStubResponse(prompt: string, snapshot: AgentContextSnapshot): LLMRawResponse {
  const nodeCount = snapshot.nodes.selected.length + snapshot.nodes.nearby.length + snapshot.nodes.visible.length;
  return {
    ...STUB_RESPONSE,
    explanation: `I received your request: "${prompt.slice(0, 100)}". I can see ${nodeCount} nodes on your board. This is a stub response — connect an LLM provider for real suggestions.`,
  };
}

async function buildUserContent(
  prompt: string,
  snapshot: AgentContextSnapshot,
  images?: string[]
): Promise<string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }>> {
  const textPart = `Board context:\n${JSON.stringify(snapshot, null, 2)}\n\nUser request: ${prompt}`;

  // Load board image thumbnails
  const thumbnailPromises = snapshot.assets.referenced
    .filter((a) => a.thumbnailUrl && a.processingStatus === 'ready')
    .slice(0, 8) // cap at 8 board images
    .map(async (a) => {
      const base64 = await getThumbnailBase64(a.id);
      return base64 ? { nodeId: a.nodeId, base64 } : null;
    });

  const thumbnails = (await Promise.all(thumbnailPromises)).filter(Boolean) as Array<{ nodeId: string; base64: string }>;
  const hasImages = thumbnails.length > 0 || (images && images.length > 0);

  if (!hasImages) return textPart;

  const parts: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [
    { type: 'text', text: textPart },
  ];

  // Add board image thumbnails
  for (const thumb of thumbnails) {
    parts.push({ type: 'text', text: `[Image from board node ${thumb.nodeId}]:` });
    parts.push({ type: 'image_url', image_url: { url: thumb.base64, detail: 'auto' } });
  }

  // Add user-pasted images
  if (images) {
    for (const img of images) {
      parts.push({ type: 'image_url', image_url: { url: img } });
    }
  }

  return parts;
}

async function callOpenAI(
  prompt: string,
  snapshot: AgentContextSnapshot,
  opts: { timeoutMs: number; totalBudgetMs: number; maxRetries: number; images?: string[] }
): Promise<LLMRawResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a helpful AI assistant for a visual board application. Users place sticky notes, text, images, and shapes on a canvas and connect them with edges.

You can see the board's content including node positions, text, and any images the user has added. When images are present, describe what you see in them in full detail — objects, scenes, landmarks, cities, architecture, artwork, text, people, animals, or any other content. Identifying and describing image content is a core feature of this application. Answer questions naturally — about the board content, the images, general knowledge, or anything else the user asks.

When appropriate, you can also suggest board modifications by including them in your actionPlan.

Always respond with a JSON object in this exact format:
{
  "explanation": "Your natural language response to the user",
  "confidence": 0.0 to 1.0,
  "actionPlan": [],
  "preview": { "affectedNodeIds": [], "affectedEdgeIds": [], "newNodeTempIds": [], "newEdgeTempIds": [] }
}

Action types available for actionPlan: create_node, update_node, delete_node, create_edge, update_edge, delete_edge, batch_layout.

For create_node, each item needs: { "type": "create_node", "tempId": "unique-string", "node": { "type": "sticky"|"text"|"shape", "x": number, "y": number, "width": number, "height": number, "content": { "text": "..." }, "style": {}, "metadata": { "aiGenerated": true } } }
For update_node: { "type": "update_node", "nodeId": "existing-uuid", "patch": { ... } }
For delete_node: { "type": "delete_node", "nodeId": "existing-uuid" }
For create_edge: { "type": "create_edge", "tempId": "unique-string", "edge": { "sourceNodeId": "...", "targetNodeId": "...", "label": "optional" } }
For batch_layout: { "type": "batch_layout", "items": [{ "nodeId": "...", "x": number, "y": number }] }

Rules:
- If the user asks a question or wants to chat, just respond in "explanation" with an empty actionPlan.
- Only include actionPlan items when the user explicitly wants board changes.
- Use existing node IDs from the board context when modifying or referencing nodes.
- For new nodes, generate unique tempId strings and position them near existing content.`,
          },
          {
            role: 'user',
            content: await buildUserContent(prompt, snapshot, opts.images),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    return JSON.parse(content) as LLMRawResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callLLM(
  prompt: string,
  snapshot: AgentContextSnapshot,
  opts: CallLLMOptions = {}
): Promise<LLMRawResponse> {
  const timeoutMs = opts.timeoutMs ?? env.LLM_CALL_TIMEOUT_MS;
  const totalBudgetMs = opts.totalBudgetMs ?? env.LLM_TOTAL_BUDGET_MS;
  const maxRetries = opts.maxRetries ?? env.LLM_MAX_RETRIES;
  const images = opts.images;
  const startTime = Date.now();

  if (env.LLM_PROVIDER === 'stub') {
    logger.debug('Using stub LLM provider');
    return buildStubResponse(prompt, snapshot);
  }

  // OpenAI path with retry
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= totalBudgetMs) {
      throw new Error(`LLM total budget exceeded (${elapsed}ms >= ${totalBudgetMs}ms)`);
    }

    try {
      logger.info('LLM call attempt', { attempt, elapsed });
      const result = await callOpenAI(prompt, snapshot, { timeoutMs, totalBudgetMs, maxRetries, images });
      logger.info('LLM call succeeded', { attempt, duration: Date.now() - startTime });
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn('LLM call failed', {
        attempt,
        error: lastError.message,
        duration: Date.now() - startTime,
      });

      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const baseDelay = 1000 * Math.pow(2, attempt);
        const jitter = Math.random() * 1000 - 500;
        const delay = Math.max(100, baseDelay + jitter);
        const remaining = totalBudgetMs - (Date.now() - startTime);
        if (delay >= remaining) break;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error('LLM call failed after retries');
}
