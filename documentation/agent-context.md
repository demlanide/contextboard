# agent-context.md

This document defines a precise **AgentContextSnapshot** contract and the server-side execution loop for agent-assisted edits in the MVP: context construction, truncation to token budgets, sanitization for safety, expected LLM output schema, validator rules, and the apply transaction that logs operations and increments board revision exactly once.

It anchors schema design in OpenAPI 3.1 / JSON Schema dialect concepts and standardizes partial updates through JSON Merge Patch, so “update” actions are deterministic to validate and apply.

## Assumptions (MVP limits)

- Max nodes per board: **5000**
- Max batch ops per request: **200**
- Max upload image size: **20MB**
- Max text length per node: **20,000 chars**
- LLM max tokens: **8k** (truncate to ~**6k** tokens for content)

## Context builder contract

### Why a strict snapshot shape

The LLM must see **just enough** board context to propose safe edits, without receiving unbounded board data. The backend therefore sends a normalized JSON snapshot with explicit limits and provenance.

### AgentContextSnapshot schema

```json
{
  "meta": {
    "boardId": "uuid",
    "boardRevision": 123,
    "mode": "suggest",
    "requestId": "req-20260315-xyz",
    "generatedAt": "2026-03-15T22:10:00Z",
    "limits": {
      "maxTokensTotal": 8000,
      "maxTokensContent": 6000,
      "maxSelectedNodes": 50,
      "maxNearbyNodes": 100,
      "maxVisibleNodes": 200,
      "maxEdges": 200,
      "maxActionItems": 200
    }
  },
  "board": {
    "title": "string",
    "summary": {
      "text": "string",
      "provenance": { "source": "system|user|agent", "updatedAt": "date-time" },
      "confidence": 0.0
    },
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  },
  "selection": {
    "selectedNodeIds": ["uuid"],
    "selectedEdgeIds": ["uuid"]
  },
  "nodes": {
    "selected": [],
    "nearby": [],
    "visible": []
  },
  "edges": {
    "selected": [],
    "visible": []
  },
  "assets": {
    "referenced": []
  },
  "artifacts": {
    "systemNotes": [
      { "id": "note-1", "text": "string", "confidence": 1.0 }
    ]
  },
  "sanitization": {
    "piiRemoved": true,
    "secretsRedacted": true,
    "redactionSummary": [
      { "kind": "email|token|url|other", "count": 0 }
    ]
  }
}
```

Engineer actions:
- Implement this as a typed DTO in backend
- Keep `meta.limits` explicit so validator and model can enforce quotas consistently

### NodeProjection

Backend should project full nodes into an LLM-friendly shape:

```json
{
  "id": "uuid",
  "type": "sticky|text|image|shape",
  "geometry": { "x": 0, "y": 0, "width": 0, "height": 0, "rotation": 0 },
  "zIndex": 0,
  "content": { "text": "…" },
  "metadata": { "locked": false, "hidden": false, "aiGenerated": false, "tags": [] },
  "provenance": { "source": "user|agent|system", "updatedAt": "date-time" }
}
```

## Context levels and selection logic

The context builder MUST prioritize:

1. **Selection** — always include selected nodes/edges up to caps
2. **Nearby** — nodes within a radius of selected nodes, e.g. 800px
3. **Visible** — nodes intersecting viewport bounding box
4. **Global** — board summary and minimal statistics when truncated

Engineer actions:
- Implement fast spatial queries
- Start with bbox comparisons, optimize later if needed

## Truncation rules

### Token budget strategy

- Budget ~6k tokens for content-rich fields to reserve room for instructions and output schema
- Truncate per-node content first, before dropping whole nodes
- If still oversized, replace long-tail nodes with a `clusterSummary` entry

### Object caps

- `selected`: max 50
- `nearby`: max 100
- `visible`: max 200
- `edges total`: max 200

### Summarization strategy

When exceeding caps or token budget:
- Pick representative samples
- Add one synthetic summary entry

```json
{
  "clusterSummary": {
    "scope": "nearby|visible",
    "count": 120,
    "themes": ["onboarding", "sharing"],
    "sampleNodeIds": ["uuid1", "uuid2", "uuid3"],
    "confidence": 0.55,
    "provenance": { "source": "system", "updatedAt": "date-time" }
  }
}
```

Engineer actions:
- Make truncation deterministic for reproducible debugging

## Image handling

The snapshot MUST NOT include raw binary image data. Include:
- `thumbnailUrl` or stable storage key
- optional `aiCaption`
- optional `extractedText`
- `processingStatus`

Engineer actions:
- If OCR/captioning is async, set `processingStatus="processing"` and keep caption/text null
- Frontend can refetch asset metadata later

## Security and sanitization rules

Even with no auth, sanitize before sending to the model:
- Redact secrets-like patterns (API keys, bearer tokens, private URLs)
- Strip obvious PII (emails, phone numbers) unless explicitly required
- Ensure `sanitization.redactionSummary` reports what changed

Engineer actions:
- Log redaction summary, not the raw secret, for debugging

## Expected LLM output schema

LLM must return a JSON object:

```json
{
  "explanation": "Plain English explanation of the plan.",
  "confidence": 0.78,
  "actionPlan": [],
  "preview": {
    "affectedNodeIds": [],
    "affectedEdgeIds": [],
    "newNodeTempIds": [],
    "newEdgeTempIds": []
  }
}
```

Allowed `actionPlan` item types:
- `create_node`
- `update_node`
- `delete_node`
- `create_edge`
- `update_edge`
- `delete_edge`
- `batch_layout`

### Valid LLM response example

```json
{
  "explanation": "Create a Theme A label and align selected notes vertically.",
  "confidence": 0.81,
  "actionPlan": [
    {
      "type": "create_node",
      "tempId": "tmp-theme-a",
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
        { "nodeId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "x": 80, "y": 200 },
        { "nodeId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "x": 80, "y": 340 }
      ]
    }
  ],
  "preview": {
    "affectedNodeIds": ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
    "affectedEdgeIds": [],
    "newNodeTempIds": ["tmp-theme-a"],
    "newEdgeTempIds": []
  }
}
```

### Invalid LLM response example

```json
{
  "explanation": "Delete everything.",
  "confidence": 0.2,
  "actionPlan": [
    { "type": "drop_database", "targetId": "boards" }
  ],
  "preview": {}
}
```

## Validator rules

### Hard checks

- Action types are in allow-list
- All referenced IDs exist, belong to board, and are not soft-deleted
- Locked nodes (`locked=true`) cannot be updated/deleted
- No cross-board references
- Quotas:
  - `actionPlan.length ≤ 200`
  - `batch_layout.items ≤ 200`
  - optional: `create_node ≤ 100`

### Mode-specific

- Suggest: no DB writes; may still compute preview and return trimmed plan if needed
- Apply: re-validate, then apply in one SQL transaction; write operations; increment board revision once

### Idempotency note

- Apply should support `Idempotency-Key` to make retries safe

## Retry/backoff for LLM calls

Recommended MVP policy:
- Total request budget for suggest: 18 seconds
- Retries: at most 1 retry on transient failures with exponential backoff + jitter
- If the model returns invalid JSON:
  - one repair attempt asking for only valid JSON
- If still invalid:
  - return an agent message with no actionPlan and log diagnostic metadata

## Mermaid sequence: context → LLM → validate → apply

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant BE as Backend
  participant CB as ContextBuilder
  participant LLM as LLM
  participant V as Validator
  participant DB as Postgres

  FE->>BE: POST /boards/:id/agent/actions (suggest)
  BE->>CB: build snapshot (selection/nearby/visible)
  CB-->>BE: AgentContextSnapshot (sanitized, truncated)
  BE->>LLM: prompt + snapshot + output schema
  LLM-->>BE: response JSON (candidate)
  BE->>V: validate actionPlan (no writes)
  V-->>BE: ok + preview OR 422 ACTION_PLAN_INVALID
  BE-->>FE: actionPlan + preview (suggest)

  FE->>BE: POST /boards/:id/agent/actions/apply
  BE->>V: re-validate actionPlan
  BE->>DB: BEGIN; apply; log ops; bump revision; COMMIT
  DB-->>BE: diff + newRevision
  BE-->>FE: diff + newRevision
```
