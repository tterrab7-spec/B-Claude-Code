import { z } from 'zod';

export const leadKinds = ['feasibility_snapshot', 'feasibility_enhanced', 'homeowner_rebuild', 'builder_qualification', 'builder_audit', 'calculator_unlock', 'strategy_call', 'codev_partner'] as const;
export const leadStatuses = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'nurture'] as const;

export const propertySchema = z.object({
  address: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(40).optional(),
  zip: z.string().max(12).optional(),
  apn: z.string().max(60).optional(),
  propertyType: z.enum(['vacant_land', 'residential_house', 'commercial']).optional(),
  lotSize: z.coerce.number().nonnegative().optional(),
  lotSizeUnit: z.enum(['sf', 'acres']).optional(),
  homeSizeSf: z.coerce.number().nonnegative().optional(),
  ownsLand: z.boolean().optional(),
  zoningCode: z.string().max(30).optional(),
}).strict();

export const createLeadSchema = z.object({
  kind: z.enum(leadKinds),
  contact: z.object({ fullName: z.string().min(2).max(120), email: z.email(), phone: z.string().max(40).optional() }),
  property: propertySchema.optional().default({}),
  answers: z.record(z.string(), z.unknown()).optional().default({}),
  consent: z.boolean(),
  utm: z.object({ source: z.string().optional(), medium: z.string().optional(), campaign: z.string().optional(), content: z.string().optional(), term: z.string().optional() }).partial().optional(),
  website: z.string().max(0, 'Spam check failed').optional().default(''),
});
export type CreateLead = z.infer<typeof createLeadSchema>;

export const patchLeadSchema = z.object({
  status: z.enum(leadStatuses).optional(),
  assigneeUserId: z.uuid().nullable().optional(),
  notes: z.string().max(5000).optional(),
  lostReason: z.string().max(500).optional(),
});

export const convertLeadSchema = z.object({ projectName: z.string().max(200).optional(), programType: z.enum(['boyl', 'codev', 'rebuild', 'builder_ops']) });
