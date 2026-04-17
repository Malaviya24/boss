import { z } from 'zod';

export const matkaMarketIdParamsSchema = z.object({
  marketId: z
    .string()
    .trim()
    .regex(/^(?:[a-f\d]{24}|mem-market-\d+)$/i, 'Invalid market id'),
});

export const matkaMarketSlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9-]+$/i),
});

export const matkaMarketCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  openTime: z.string().trim().min(4).max(20),
  closeTime: z.string().trim().min(4).max(20),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export const matkaMarketPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  openTime: z.string().trim().min(4).max(20).optional(),
  closeTime: z.string().trim().min(4).max(20).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export const matkaPanelUpdateSchema = z.object({
  panel: z.string().trim().regex(/^\d{3}$/),
});

export const matkaLoginBodySchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
});

export const matkaAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(10).max(200).optional(),
});
