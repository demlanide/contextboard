# API Contracts: Chat Endpoints

## GET /api/boards/:boardId/chat

Load the board's chat thread and recent messages.

### Request

- Method: `GET`
- Path: `/api/boards/:boardId/chat`
- Path params: `boardId` (UUID)
- Body: none

### Response (200 OK)

```json
{
  "data": {
    "thread": {
      "id": "uuid-thread",
      "boardId": "uuid-board"
    },
    "messages": [
      {
        "id": "uuid-msg-1",
        "threadId": "uuid-thread",
        "senderType": "user",
        "messageText": "What are the main themes here?",
        "messageJson": {},
        "selectionContext": {
          "selectedNodeIds": ["uuid-node-1", "uuid-node-2"],
          "selectedEdgeIds": [],
          "viewport": { "x": 0, "y": 0, "zoom": 1 }
        },
        "createdAt": "2026-03-16T10:00:00.000Z"
      },
      {
        "id": "uuid-msg-2",
        "threadId": "uuid-thread",
        "senderType": "agent",
        "messageText": "I see two main themes: travel planning and budget tracking.",
        "messageJson": {},
        "selectionContext": {},
        "createdAt": "2026-03-16T10:00:02.000Z"
      }
    ]
  },
  "error": null
}
```

### Behavior

- Returns the most recent 200 messages ordered by `created_at ASC` (oldest first)
- Thread is auto-created with the board; should always exist for a valid active/archived board
- Empty `messages` array for boards with no chat history

### Error responses

| Status | Code | Condition |
|--------|------|-----------|
| 404 | BOARD_NOT_FOUND | Board does not exist or is deleted |
| 404 | CHAT_THREAD_NOT_FOUND | Thread missing (data integrity issue) |

---

## POST /api/boards/:boardId/chat/messages

Send a user message and receive an agent response.

### Request

- Method: `POST`
- Path: `/api/boards/:boardId/chat/messages`
- Content-Type: `application/json`
- Path params: `boardId` (UUID)

```json
{
  "message": "Summarize these notes",
  "selectionContext": {
    "selectedNodeIds": ["uuid-node-1", "uuid-node-2"],
    "selectedEdgeIds": [],
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  }
}
```

### Request fields

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| message | string | Yes | 1–20,000 characters |
| selectionContext | object | No | If present: `selectedNodeIds` (string[]), `selectedEdgeIds` (string[]), `viewport` ({x, y, zoom}) |

### Response — success (200 OK)

```json
{
  "data": {
    "userMessage": {
      "id": "uuid-msg-user",
      "threadId": "uuid-thread",
      "senderType": "user",
      "messageText": "Summarize these notes",
      "messageJson": {},
      "selectionContext": {
        "selectedNodeIds": ["uuid-node-1", "uuid-node-2"],
        "selectedEdgeIds": [],
        "viewport": { "x": 0, "y": 0, "zoom": 1 }
      },
      "createdAt": "2026-03-16T10:05:00.000Z"
    },
    "agentMessage": {
      "id": "uuid-msg-agent",
      "threadId": "uuid-thread",
      "senderType": "agent",
      "messageText": "Here is a summary of the selected notes...",
      "messageJson": {},
      "selectionContext": {},
      "createdAt": "2026-03-16T10:05:02.000Z"
    }
  },
  "error": null
}
```

### Response — agent failure (200 OK with partial data)

When the agent fails to generate a response, the user message is still persisted. The agent message is null and an error is provided.

```json
{
  "data": {
    "userMessage": {
      "id": "uuid-msg-user",
      "threadId": "uuid-thread",
      "senderType": "user",
      "messageText": "Summarize these notes",
      "messageJson": {},
      "selectionContext": {},
      "createdAt": "2026-03-16T10:05:00.000Z"
    },
    "agentMessage": null
  },
  "error": {
    "code": "AGENT_UNAVAILABLE",
    "message": "The assistant could not generate a response. Your message has been saved.",
    "details": {}
  }
}
```

### Behavior

1. Validate request body (message text, selection context shape)
2. Validate board exists, is not deleted, is not archived
3. Look up chat thread for board
4. Persist user message with selection context
5. Generate agent response (may fail)
6. If agent succeeds: persist agent message, return both
7. If agent fails: return user message + null agentMessage + error envelope
8. Board revision is NOT incremented
9. No operations log entries are written

### Error responses

| Status | Code | Condition |
|--------|------|-----------|
| 404 | BOARD_NOT_FOUND | Board does not exist or is deleted |
| 409 | BOARD_ARCHIVED | Board is archived (read-only) |
| 422 | VALIDATION_ERROR | Invalid message text or selection context |

### Notes

- This endpoint is synchronous: it waits for the agent response before returning
- No idempotency key required (append-only, non-board-mutating)
- The agent may include `messageJson.actionPlan` in its response; this is persisted as-is but not interpreted in S8
