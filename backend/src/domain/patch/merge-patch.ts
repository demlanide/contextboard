/**
 * Applies a JSON Merge Patch (RFC 7396) to a target object.
 * Returns a new object — does not mutate inputs.
 */
export function applyMergePatch(
  target: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(patch)) {
    const patchValue = patch[key];

    if (patchValue === null) {
      delete result[key];
    } else if (
      typeof patchValue === 'object' &&
      !Array.isArray(patchValue) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = applyMergePatch(
        result[key] as Record<string, unknown>,
        patchValue as Record<string, unknown>
      );
    } else {
      result[key] = patchValue;
    }
  }

  return result;
}
