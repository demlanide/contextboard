# Quickstart: Chat Persistence

## Prerequisites

- Node.js LTS (same as existing backend/frontend)
- PostgreSQL 15+ running with `contextboard` database
- Backend and frontend from prior slices (S1–S8) functional
- `npm install` run in both `backend/` and `frontend/`

## Database setup

Run migrations (includes the new `009_create_chat_messages.sql`):

```bash
cd backend
npm run migrate
```

## Backend development

```bash
cd backend
npm run dev
```

### New endpoints available

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/boards/:boardId/chat` | Load chat thread + recent messages |
| POST | `/api/boards/:boardId/chat/messages` | Send user message, receive agent response |

### Quick smoke test

```bash
# Create a board (or use an existing one)
BOARD_ID=$(curl -s -X POST http://localhost:3000/api/boards \
  -H "Content-Type: application/json" \
  -d '{"title":"Chat test"}' | jq -r '.data.board.id')

# Load chat (should return empty messages)
curl -s http://localhost:3000/api/boards/$BOARD_ID/chat | jq .

# Send a message
curl -s -X POST http://localhost:3000/api/boards/$BOARD_ID/chat/messages \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello agent!"}' | jq .

# Load chat again (should show user + agent messages)
curl -s http://localhost:3000/api/boards/$BOARD_ID/chat | jq .

# Verify board revision unchanged
curl -s http://localhost:3000/api/boards/$BOARD_ID | jq '.data.revision'
```

## Frontend development

```bash
cd frontend
npm run dev
```

### What to verify in the browser

1. Open a board — chat panel should be open by default on the left
2. Empty board shows empty chat state with composer ready
3. Type a message and press send — user message appears, loading indicator shows, agent reply appears
4. Reload the page — both messages should still be visible
5. Select nodes on the canvas, then send a message — message should show a selection context badge
6. Close and reopen the chat panel — messages preserved without re-fetch
7. Try sending on an archived board — composer should be disabled

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
- `backend/src/db/migrations/009_create_chat_messages.sql` — new table
- `backend/src/http/controllers/chat.controller.ts` — endpoint handlers
- `backend/src/services/chat.service.ts` — business logic
- `backend/src/repos/chat-messages.repo.ts` — message persistence
- `backend/src/domain/validation/chat-rules.ts` — validation
- `backend/src/agent/agent-stub.ts` — stubbable agent response
- `backend/src/config/limits.ts` — chat-specific limits

### Frontend
- `frontend/src/components/layout/ChatSidebar.tsx` — main chat panel (replaces placeholder)
- `frontend/src/components/chat/MessageComposer.tsx` — input + send
- `frontend/src/components/chat/MessageList.tsx` — history rendering
- `frontend/src/hooks/useChat.ts` — chat load/send logic
- `frontend/src/api/chat.api.ts` — API client
