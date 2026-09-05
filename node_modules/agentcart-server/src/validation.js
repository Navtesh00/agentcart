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

export const ApproveCheckoutSchema = z.object({
  reserve_id: z.string().min(1, 'reserve_id required'),
  approval_token: z.string().min(1, 'approval_token required'),
  idempotency_key: z.string().min(1, 'idempotency_key required'),
});

export const MerchantSchema = z.object({
  name: z.string().min(1, 'merchant name required').max(200),
  catalog_config: z.object({
    mode: z.enum(['external', 'hosted']),
    external_api_url: z.string().url().optional(),
  }).refine(
    (c) => (c.mode === 'external' ? !!c.external_api_url : true),
    { message: 'external_api_url required when mode is external', path: ['external_api_url'] }
  ),
});

export const HostedProductSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  price: z.number().int().min(0, 'price in paise must be >= 0'),
  currency: z.string().default('INR'),
  stock: z.number().int().min(0),
  category: z.string().optional(),
  veg: z.boolean().default(true),
  desc: z.string().optional(),
  description: z.string().optional(),
  img: z.string().optional(),
  image: z.string().optional(),
});

// Merchant-aware checkout: optional merchant_id routes calcTotal via the
// merchant's catalog (hosted DB or external API) instead of the legacy global catalog.
export const MerchantCheckoutSchema = CheckoutSchema.extend({
  merchant_id: z.string().min(1).optional(),
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
