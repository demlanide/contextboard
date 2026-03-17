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
} as const;
