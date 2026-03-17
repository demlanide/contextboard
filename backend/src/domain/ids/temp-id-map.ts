export class TempIdMap {
  private readonly map = new Map<string, string>();

  register(tempId: string, realId: string): void {
    if (this.map.has(tempId)) {
      throw new Error(`TempId already registered: ${tempId}`);
    }
    this.map.set(tempId, realId);
  }

  resolve(idOrTempId: string): string {
    return this.map.get(idOrTempId) ?? idOrTempId;
  }

  has(tempId: string): boolean {
    return this.map.has(tempId);
  }
}
