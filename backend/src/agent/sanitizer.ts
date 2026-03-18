// T027: Sanitizer — regex-based pattern redaction
import type { AgentContextSnapshot, RedactionEntry, NodeProjection } from './types.js';

const PATTERNS: Array<{ kind: RedactionEntry['kind']; regex: RegExp; replacement: string }> = [
  // API keys
  { kind: 'token', regex: /(?:sk|pk|api)[_-]?[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED:token]' },
  // Bearer tokens
  { kind: 'token', regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, replacement: '[REDACTED:token]' },
  // AWS keys
  { kind: 'token', regex: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED:token]' },
  // Email addresses
  { kind: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[REDACTED:email]' },
  // Phone numbers
  { kind: 'other', regex: /\+?[\d\s\-()]{10,}/g, replacement: '[REDACTED:phone]' },
];

function sanitizeText(text: string, counts: Map<RedactionEntry['kind'], number>): string {
  let result = text;
  for (const pattern of PATTERNS) {
    const matches = result.match(pattern.regex);
    if (matches) {
      counts.set(pattern.kind, (counts.get(pattern.kind) ?? 0) + matches.length);
      result = result.replace(pattern.regex, pattern.replacement);
    }
  }
  return result;
}

function sanitizeNode(node: NodeProjection, counts: Map<RedactionEntry['kind'], number>): NodeProjection {
  if (!node.content.text) return node;
  return {
    ...node,
    content: {
      text: sanitizeText(node.content.text, counts),
    },
  };
}

export function sanitizeSnapshot(snapshot: AgentContextSnapshot): AgentContextSnapshot {
  const counts = new Map<RedactionEntry['kind'], number>();

  const sanitized: AgentContextSnapshot = {
    ...snapshot,
    nodes: {
      selected: snapshot.nodes.selected.map((n) => sanitizeNode(n, counts)),
      nearby: snapshot.nodes.nearby.map((n) => sanitizeNode(n, counts)),
      visible: snapshot.nodes.visible.map((n) => sanitizeNode(n, counts)),
    },
    sanitization: {
      piiRemoved: false,
      secretsRedacted: false,
      redactionSummary: [],
    },
  };

  const redactionSummary: RedactionEntry[] = [];
  for (const [kind, count] of counts) {
    redactionSummary.push({ kind, count });
  }

  const hasSecrets = counts.has('token');
  const hasPii = counts.has('email') || counts.has('other');

  sanitized.sanitization = {
    piiRemoved: hasPii,
    secretsRedacted: hasSecrets,
    redactionSummary,
  };

  return sanitized;
}
