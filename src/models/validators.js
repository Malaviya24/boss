import { z } from 'zod';

export const marketQuerySchema = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const marketPageParamsSchema = z.object({
  type: z.enum(['jodi', 'panel']),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid market slug'),
});

export const marketLiveParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid market slug'),
});

export const marketTemplateQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).max(20000).optional(),
  limit: z.coerce.number().int().min(20).max(400).optional(),
});

export const marketTemplateRequestQuerySchema = z.object({
  type: z.enum(['jodi', 'panel']),
  slug: z.string().trim().min(1).max(200),
  offset: z.coerce.number().int().min(0).max(20000).optional(),
  limit: z.coerce.number().int().min(20).max(400).optional(),
});
