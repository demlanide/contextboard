export const limits = {
  board: {
    title: { min: 1, max: 200 },
    description: { max: 10_000 },
  },
  node: {
    text: { max: 20_000 },
    title: { max: 500 },
    shapeText: { max: 5_000 },
    width: { min: 0, max: 10_000 },
    height: { min: 0, max: 10_000 },
  },
  edge: {
    label: { max: 1_000 },
  },
  batch: {
    maxOperations: 200,
    minOperations: 1,
  },
  chat: {
    messageText: { min: 1, max: 20_000 },
    messagesPerLoad: 200,
    selectionMaxNodeIds: 100,
    selectionMaxEdgeIds: 100,
  },
  asset: {
    imageMaxSizeBytes: 20 * 1024 * 1024,     // 20 MB
    fileMaxSizeBytes: 50 * 1024 * 1024,       // 50 MB
    allowedMimeTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
    ] as readonly string[],
    thumbnailMaxDim: 400,
    captionMaxLength: 2_000,
  },
  agent: {
    promptText: { min: 1, max: 20_000 },
    maxActionItems: 200,
    maxSelectedNodes: 50,
    maxNearbyNodes: 100,
    maxVisibleNodes: 200,
    maxEdges: 200,
    maxTokensTotal: 8_000,
    maxTokensContent: 6_000,
    nearbyRadiusPx: 800,
    selectionMaxNodeIds: 100,
    selectionMaxEdgeIds: 100,
  },
  chat: {
    messageText: { min: 1, max: 20_000 },
    messagesPerLoad: 200,
    selectionMaxNodeIds: 100,
    selectionMaxEdgeIds: 100,
  },
} as const;
