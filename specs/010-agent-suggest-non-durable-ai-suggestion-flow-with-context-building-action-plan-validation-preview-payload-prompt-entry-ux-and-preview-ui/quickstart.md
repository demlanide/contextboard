# Quickstart: Agent Suggest

## Prerequisites

- Node.js LTS (same as existing backend/frontend)
- PostgreSQL 15+ running with `contextboard` database
- Backend and frontend from prior slices (S1–S9) functional
- `npm install` run in both `backend/` and `frontend/`
- LLM provider configured (or stub mode for testing)

## Configuration

### Backend environment variables

Add to `.env` or environment:

```bash
# LLM provider: 'stub' for testing, 'openai' for production
LLM_PROVIDER=stub

# OpenAI config (only needed when LLM_PROVIDER=openai)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Timeouts (defaults shown)
AGENT_TIMEOUT_MS=20000
LLM_CALL_TIMEOUT_MS=12000
LLM_TOTAL_BUDGET_MS=18000
```

### No new migrations

Agent suggest does not add new database tables. It reads existing board/node/edge/asset tables and writes to the existing `chat_messages` table.

## Backend development

```bash
cd backend
npm run dev
```

### New endpoint available

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/boards/:boardId/agent/actions` | Submit suggest prompt, receive action plan + preview |

### Quick smoke test

```bash
# Create a board with some nodes (or use existing)
BOARD_ID=$(curl -s -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -d '{"title":"Suggest test"}' | jq -r '.data.board.id')

# Create a couple of nodes
NODE1=$(curl -s -X POST http://localhost:3000/api/boards/$BOARD_ID/nodes \
  -H "Content-Type: application/json" \
  -d '{"type":"sticky","x":100,"y":100,"width":200,"height":150,"content":{"text":"Travel planning ideas"}}' \
  | jq -r '.data.node.id')

NODE2=$(curl -s -X POST http://localhost:3000/api/boards/$BOARD_ID/nodes \
  -H "Content-Type: application/json" \
  -d '{"type":"sticky","x":400,"y":100,"width":200,"height":150,"content":{"text":"Budget tracking notes"}}' \
  | jq -r '.data.node.id')

# Check current board revision
BEFORE_REV=$(curl -s http://localhost:3000/api/boards/$BOARD_ID | jq '.data.board.revision')
echo "Board revision before suggest: $BEFORE_REV"

# Submit a suggest request
curl -s -X POST http://localhost:3000/api/boards/$BOARD_ID/agent/actions \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Group these notes by theme\",
    \"mode\": \"suggest\",
    \"selectionContext\": {
      \"selectedNodeIds\": [\"$NODE1\", \"$NODE2\"]
    }
  }" | jq .

# Verify board revision unchanged
AFTER_REV=$(curl -s http://localhost:3000/api/boards/$BOARD_ID | jq '.data.board.revision')
echo "Board revision after suggest: $AFTER_REV"

# Verify chat messages were persisted
curl -s http://localhost:3000/api/boards/$BOARD_ID/chat | jq '.data.messages | length'
```

### Stub mode responses

When `LLM_PROVIDER=stub`, the agent returns a canned response that acknowledges the prompt and proposes a simple action plan (create one summary node). This is sufficient for testing the full flow without an LLM provider.

## Frontend development

```bash
cd frontend
npm run dev
```

### What to verify in the browser

1. Open a board with nodes — chat panel is open on the left
2. Toggle to suggest mode in the message composer
3. Select nodes on the canvas, then submit a suggest prompt
4. Loading indicator appears, submit button is disabled
5. Agent response appears in chat with explanation text
6. Preview overlay renders on the canvas — proposed nodes have dashed borders and reduced opacity
7. Action summary list appears in the chat panel showing planned actions
8. Click dismiss — preview clears, board returns to confirmed state
9. Modify the board (e.g., move a node) — stale indicator appears on the suggestion
10. Submit another suggest prompt — previous preview is replaced
11. Trigger an error (submit on archived board, or with stub configured to fail) — error message appears, prompt text preserved for retry

## Running tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## Key files to review

### Backend
- `backend/src/http/controllers/agent.controller.ts` — suggest endpoint handler
- `backend/src/services/agent.service.ts` — suggest orchestration
- `backend/src/agent/context-builder.ts` — context snapshot construction
- `backend/src/agent/sanitizer.ts` — PII/secret redaction
- `backend/src/agent/llm-client.ts` — LLM call with timeout/retry
- `backend/src/agent/output-validator.ts` — action plan schema validation
- `backend/src/agent/preview-builder.ts` — preview metadata computation
- `backend/src/domain/validation/action-plan-rules.ts` — reference/lock validation
- `backend/src/schemas/agent.schemas.ts` — Zod request/response schemas
- `backend/src/config/limits.ts` — agent-specific limits
- `backend/src/config/env.ts` — LLM provider config

### Frontend
- `frontend/src/api/agent.api.ts` — suggest API client
- `frontend/src/store/board.store.ts` — agent state slice
- `frontend/src/hooks/useSuggest.ts` — suggest submit/dismiss/retry logic
- `frontend/src/components/chat/SuggestModeToggle.tsx` — mode toggle
- `frontend/src/components/chat/ActionSummaryList.tsx` — action list
- `frontend/src/components/canvas/PreviewOverlay.tsx` — canvas preview layer
- `frontend/src/components/canvas/StaleBanner.tsx` — stale indicator
