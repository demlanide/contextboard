# API Contract: Agent Suggest Endpoint

## POST /api/boards/:boardId/agent/actions

Generate an agent suggestion with action plan and preview, without mutating board state.

### Request

- Method: `POST`
- Path: `/api/boards/:boardId/agent/actions`
- Content-Type: `application/json`
- Path params: `boardId` (UUID)

```json
{
  "prompt": "Group these notes by theme and create a summary node",
  "mode": "suggest",
  "selectionContext": {
    "selectedNodeIds": ["uuid-node-1", "uuid-node-2", "uuid-node-3"],
    "selectedEdgeIds": [],
    "viewport": { "x": 100, "y": 200, "zoom": 1.2 }
  }
}
```

### Request fields

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| prompt | string | Yes | 1–20,000 characters |
| mode | string | Yes | Must be `"suggest"` (this endpoint also handles `"apply"` in S10, but this contract covers suggest only) |
| selectionContext | object | No | If present: `selectedNodeIds` (string[], max 100 UUIDs), `selectedEdgeIds` (string[], max 100 UUIDs), `viewport` ({x: number, y: number, zoom: positive number}) |

### Response — success with action plan (200 OK)

When the agent returns a valid action plan:

```json
{
  "data": {
    "message": {
      "id": "uuid-msg-agent",
      "threadId": "uuid-thread",
      "senderType": "agent",
      "messageText": "I suggest grouping these notes into Theme A and Theme B. I'll create two label nodes and rearrange the selected notes vertically.",
      "messageJson": {
        "actionPlan": [
          {
            "type": "create_node",
            "tempId": "tmp-label-a",
            "node": {
              "type": "sticky",
              "x": 80,
              "y": 60,
              "width": 240,
              "height": 100,
              "content": { "text": "Theme A" },
              "style": {},
              "metadata": { "aiGenerated": true }
            }
          },
          {
            "type": "batch_layout",
            "items": [
              { "nodeId": "uuid-node-1", "x": 80, "y": 200 },
              { "nodeId": "uuid-node-2", "x": 80, "y": 340 }
            ]
          }
        ],
        "confidence": 0.81
      },
      "selectionContext": {},
      "createdAt": "2026-03-17T14:30:02.000Z"
    },
    "actionPlan": [
      {
        "type": "create_node",
        "tempId": "tmp-label-a",
        "node": {
          "type": "sticky",
          "x": 80,
          "y": 60,
          "width": 240,
          "height": 100,
          "content": { "text": "Theme A" },
          "style": {},
          "metadata": { "aiGenerated": true }
        }
      },
      {
        "type": "batch_layout",
        "items": [
          { "nodeId": "uuid-node-1", "x": 80, "y": 200 },
          { "nodeId": "uuid-node-2", "x": 80, "y": 340 }
        ]
      }
    ],
    "preview": {
      "affectedNodeIds": ["uuid-node-1", "uuid-node-2"],
      "affectedEdgeIds": [],
      "newNodeTempIds": ["tmp-label-a"],
      "newEdgeTempIds": []
    }
  },
  "error": null
}
```

### Response — success without action plan (200 OK)

When the agent returns only textual analysis with no proposed changes:

```json
{
  "data": {
    "message": {
      "id": "uuid-msg-agent",
      "threadId": "uuid-thread",
      "senderType": "agent",
      "messageText": "I analyzed the selected notes. They cover two main themes: travel planning and budget tracking. No specific changes seem necessary at this time.",
      "messageJson": {
        "confidence": 0.72
      },
      "selectionContext": {},
      "createdAt": "2026-03-17T14:30:02.000Z"
    },
    "actionPlan": [],
    "preview": {
      "affectedNodeIds": [],
      "affectedEdgeIds": [],
      "newNodeTempIds": [],
      "newEdgeTempIds": []
    }
  },
  "error": null
}
```

### Response — agent failure (200 OK with error)

When the agent fails (timeout, invalid output, unavailable), the user message is still persisted (via the existing chat message flow). The agent message contains only an explanation (no plan), or may be null.

```json
{
  "data": {
    "message": {
      "id": "uuid-msg-agent",
      "threadId": "uuid-thread",
      "senderType": "agent",
      "messageText": "I wasn't able to generate suggestions for this request. Please try again.",
      "messageJson": {},
      "selectionContext": {},
      "createdAt": "2026-03-17T14:30:08.000Z"
    },
    "actionPlan": [],
    "preview": {
      "affectedNodeIds": [],
      "affectedEdgeIds": [],
      "newNodeTempIds": [],
      "newEdgeTempIds": []
    }
  },
  "error": {
    "code": "AGENT_TIMEOUT",
    "message": "The assistant timed out while generating suggestions. Your message has been saved.",
    "details": {}
  }
}
```

### Response — action plan invalid (200 OK with error)

When the model returns a plan that fails validation (disallowed types, invalid references, locked nodes):

```json
{
  "data": {
    "message": {
      "id": "uuid-msg-agent",
      "threadId": "uuid-thread",
      "senderType": "agent",
      "messageText": "I generated a suggestion, but it contained invalid actions that couldn't be applied to this board. Please try rephrasing your request.",
      "messageJson": {},
      "selectionContext": {},
      "createdAt": "2026-03-17T14:30:05.000Z"
    },
    "actionPlan": [],
    "preview": {
      "affectedNodeIds": [],
      "affectedEdgeIds": [],
      "newNodeTempIds": [],
      "newEdgeTempIds": []
    }
  },
  "error": {
    "code": "ACTION_PLAN_INVALID",
    "message": "The suggestion contained actions that could not be validated against the current board state.",
    "details": {
      "reasons": ["Referenced node 'uuid-deleted' does not exist or is deleted"]
    }
  }
}
```

### Behavior

1. Validate request body (prompt text, mode, selection context shape)
2. Validate board exists, is not deleted, is not archived
3. Look up chat thread for board
4. Persist user message with selection context (as user chat message)
5. Build agent context snapshot from board state (nodes, edges, assets)
6. Sanitize context (redact secrets, PII)
7. Truncate context to fit token budgets
8. Call LLM with prompt + context + output schema instruction
9. On LLM timeout or error: retry once with backoff, then fail gracefully
10. On invalid JSON: attempt one repair request, then fail gracefully
11. Validate action plan schema (action types, payload shapes)
12. Validate action plan references (entity existence, locked status, same-board)
13. If plan valid: compute preview payload, persist agent message with plan
14. If plan invalid or absent: persist agent message with explanation only
15. Return response with message, action plan, and preview
16. Board revision is NOT incremented
17. No operations log entries are written
18. No board advisory lock is acquired

### Error responses (non-200)

| Status | Code | Condition |
|--------|------|-----------|
| 404 | BOARD_NOT_FOUND | Board does not exist or is deleted |
| 409 | BOARD_ARCHIVED | Board is archived |
| 422 | VALIDATION_ERROR | Invalid prompt, mode, or selection context |
| 429 | RATE_LIMIT_EXCEEDED | More than 12 suggest requests per minute |

### Chat message persistence

Both the user's prompt and the agent's response are persisted as `chat_messages` records in the board's chat thread:

- **User message**: `sender_type='user'`, `message_text=<prompt>`, `selection_context=<captured context>`
- **Agent message**: `sender_type='agent'`, `message_text=<explanation>`, `message_json={actionPlan?, confidence?}`

On agent failure:
- User message is always persisted
- Agent message with explanation-only text is persisted (no invalid plan data)
- If agent fails completely (no usable response), agent message may be null

### Notes

- This endpoint is synchronous: it waits for the full LLM response before returning
- The `mode` field distinguishes suggest from apply. This contract covers `mode: 'suggest'` only. `mode: 'apply'` is S10 scope
- Action plan items in `message.messageJson.actionPlan` and the top-level `actionPlan` field contain the same data; the message copy enables chat history to show what was suggested
- Preview metadata is computed server-side from the validated plan
- The suggest rate limit (12/min) is independent of other endpoint rate limits
