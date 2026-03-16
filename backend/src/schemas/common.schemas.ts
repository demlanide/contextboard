import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const envelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema.nullable(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.unknown()).default({}),
      })
      .nullable(),
  });

export type ApiError = {
  code: string;
  message: string;
  details: Record<string, unknown>;
};

export type ApiEnvelope<T> = {
  data: T | null;
  error: ApiError | null;
};

export function successResponse<T>(data: T): ApiEnvelope<T> {
  return { data, error: null };
}

export function errorResponse(
  code: string,
  message: string,
  details: Record<string, unknown> = {}
): ApiEnvelope<null> {
  return { data: null, error: { code, message, details } };
}
