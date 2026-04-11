import { z } from 'zod';

export const marketQuerySchema = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const marketPageParamsSchema = z.object({
  type: z.enum(['jodi', 'panel']),
  slug: z.string().trim().min(1).max(200),
});
