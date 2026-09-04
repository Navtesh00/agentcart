import { z } from 'zod';

export const CheckoutSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    qty: z.number().int().min(1).max(100),
  })).min(1, 'At least one item required').max(50, 'Too many items'),
  reserve_id: z.string().optional(),
  customer: z.object({
    name: z.string().optional(),
    contact: z.string().optional(),
    email: z.string().email().optional(),
  }).optional(),
});

export const ReserveSchema = z.object({
  user_phone: z.string().default('9999999999'),
  max_block_inr: z.number().min(1).max(100000).optional(),
  consent: z.boolean().refine(v => v === true, 'Consent required'),
});

export const ActivityLogSchema = z.object({
  type: z.string().min(1),
  data: z.any().optional(),
  status: z.enum(['success', 'error', 'pending']).default('success'),
});

export const AgentLoginSchema = z.object({
  agent_key: z.string().min(1),
});

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'validation_failed', details: result.error.issues });
    }
    req.validated = result.data;
    next();
  };
}
