# Context Board MVP — Task Template

## 1. Purpose

This template standardizes individual engineering tasks after a feature has already been defined in roadmap/spec/plan documents.

Use it for:
- GitHub issues
- task breakdown inside a feature spec
- handoff between product/spec work and implementation

Do not use this template as a replacement for:
- roadmap slices
- feature specifications
- implementation plans

This is a template for one concrete task.

---

## 2. Task Writing Rules

- One task should produce one clear, testable outcome.
- Every task must belong to exactly one roadmap slice and one feature spec.
- Every task should reference exact file paths, endpoints, tables, or schemas when known.
- Every task must state how it will be tested.
- If a task changes durable mutation behavior, it must mention revision and operation-log impact.
- If a task changes request validation, it must mention error code and status behavior.
- If a task is too large to review comfortably, split it.

Good task size:
- one engineer
- one primary outcome
- usually one PR

Avoid:
- "implement backend"
- "finish agent flow"
- "do validation"
- tasks with hidden subprojects inside them

---

## 3. Recommended Task Types

- `setup` — project/runtime/migrations/tooling baseline
- `contract` — OpenAPI, schemas, DTOs, request/response envelopes
- `persistence` — tables, migrations, repositories, transactions
- `api` — route/controller/service behavior
- `validation` — business-rule enforcement and error mapping
- `frontend` — UI/client integration for a defined backend capability
- `test` — contract, integration, unit, fixture, or regression coverage
- `docs` — roadmap/spec/api/example synchronization
- `polish` — performance, recovery, observability, cleanup

---

## 4. Template

```md
# [TASK-ID] [Short Task Title]

## Metadata

- Status: `todo`
- Type: `api|persistence|validation|test|frontend|docs|setup|polish`
- Priority: `P0|P1|P2`
- Roadmap slice: `S#`
- Feature spec: `[###-feature-name]`
- User story: `US#` or `shared`
- Owner: `[name or unassigned]`
- Dependencies: `[task ids or none]`

## Outcome

[Describe the one concrete result this task must produce.]

## Why

[Explain why this task exists and what it unlocks.]

## In Scope

- [Concrete implementation item]
- [Concrete implementation item]
- [Concrete implementation item]

## Out of Scope

- [Explicitly excluded item]
- [Explicitly excluded item]

## References

- Roadmap: `documentation/roadmap.md#S#`
- Spec: `specs/[###-feature-name]/spec.md`
- Plan: `specs/[###-feature-name]/plan.md`
- API: `documentation/api.md`
- OpenAPI: `documentation/openapi.yaml`
- Data model: `documentation/data-model.md`
- Examples: `documentation/examples.md`
- Tests: `documentation/test-matrix.md`

## Implementation Notes

- Files/modules expected to change:
  - `[path]`
  - `[path]`
- Endpoint(s):
  - `[METHOD /path]`
- Schema/table/model impact:
  - `[table/schema/model]`

## Contract and Validation

- Request/response behavior:
  - [Expected contract behavior]
- Validation rules:
  - [Business or schema validation]
- Error behavior:
  - [`status + code`]

## Revision and Operations Impact

- Revision behavior:
  - [e.g. "increments once on success", "no revision change", or "not applicable"]
- Operations log behavior:
  - [e.g. "write create_node operation", "no durable operation", or "not applicable"]

## Test Plan

- Contract tests:
  - [What to add or update]
- Integration tests:
  - [What journey to verify]
- Manual verification:
  - [Optional smoke-check]

## Acceptance Criteria

- [Observable result]
- [Observable result]
- [Observable result]

## Definition of Done

- Code implemented
- Tests added or updated
- Docs/contracts updated if needed
- Behavior matches acceptance criteria
- No open ambiguity remains inside the task scope

## Open Questions

- [Question or `None`]

## Notes

- [Anything reviewers or implementers should know]
```

---

## 5. Minimal Version

Use this shorter version when the task is small and unambiguous.

```md
# [TASK-ID] [Short Task Title]

- Type: `api|persistence|validation|test|frontend|docs|setup|polish`
- Priority: `P0|P1|P2`
- Roadmap slice: `S#`
- Feature spec: `[###-feature-name]`
- Dependencies: `[task ids or none]`

## Outcome

[One concrete result.]

## Scope

- [Item]
- [Item]

## Contract

- Endpoint/schema/path: `[value]`
- Error behavior: `[status + code]`

## Tests

- [Test work]

## Acceptance Criteria

- [Result]
- [Result]
```

---

## 6. Example Skeleton

```md
# T012 Implement board soft-delete service

- Type: `api`
- Priority: `P0`
- Roadmap slice: `S1`
- Feature spec: `001-board-foundation`
- Dependencies: `T004`, `T009`

## Outcome

`DELETE /boards/{boardId}` marks a board as `deleted` and normal board reads treat it as not found.

## Scope

- Add board soft-delete service logic
- Update delete endpoint behavior
- Ensure normal metadata/state reads return `404 BOARD_NOT_FOUND`

## Contract

- Endpoint/schema/path: `DELETE /boards/{boardId}`
- Error behavior: `404 BOARD_NOT_FOUND` for later normal reads

## Tests

- Add integration test for delete flow
- Add regression test for follow-up `GET /boards/{boardId}`

## Acceptance Criteria

- Board is removed from normal listing after delete
- Normal read endpoints return not found after delete
- No hard-delete behavior is introduced
```

---

## 7. Review Checklist

Before creating a task, check:

- Is the task tied to one roadmap slice?
- Is the outcome observable?
- Are the touched files/endpoints explicit enough?
- Are test expectations written down?
- Are error semantics explicit if validation changes?
- Are revision and operation-log implications explicit if state changes?
- Is anything in scope that should actually be split into a second task?

