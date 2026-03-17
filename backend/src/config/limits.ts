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
} as const;
