import { MetadataValidationError } from '../types.js';

export type MetadataValue = string | number | boolean | null | Array<string | number | boolean>;
export type StoreMetadata = Record<string, MetadataValue>;

/**
 * Lightweight schema validator for Vectorize-compatible metadata. Vectorize
 * filters on string/number/boolean values; nested objects and undefined
 * values are rejected at validation time to avoid silent query misses.
 */
export function validateMetadata(metadata: Record<string, unknown> | undefined): StoreMetadata | undefined {
  if (!metadata) return undefined;
  const out: StoreMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      if (value.every((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
        out[key] = value as Array<string | number | boolean>;
        continue;
      }
      throw new MetadataValidationError(`array field '${key}' must contain only primitives`);
    }
    throw new MetadataValidationError(`field '${key}' has unsupported type ${typeof value}`);
  }
  return out;
}
