/**
 * Revision bump policy:
 * - create:  revision = 0 (DDL default, no bump needed)
 * - update:  revision + 1
 * - archive: revision + 1
 * - delete:  no bump
 */

export type MutationType = 'create' | 'update' | 'archive' | 'delete';

export function getNextRevision(currentRevision: number, mutation: MutationType): number {
  switch (mutation) {
    case 'create':
      return 0;
    case 'update':
    case 'archive':
      return currentRevision + 1;
    case 'delete':
      return currentRevision; // no bump
  }
}

export function shouldBumpRevision(mutation: MutationType): boolean {
  return mutation === 'update' || mutation === 'archive';
}
