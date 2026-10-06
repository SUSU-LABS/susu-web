import { z } from 'zod';

export const GroupStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'CLOSED', 'PENDING']);

export const GroupSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  status: GroupStatusSchema,
  contributionAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  membersCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const TransactionReceiptSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  status: z.enum(['SUCCESS', 'FAILED', 'PENDING']),
  createdAt: z.string().datetime(),
});

export type GroupSummary = z.infer<typeof GroupSummarySchema>;
export type TransactionReceipt = z.infer<typeof TransactionReceiptSchema>;
export type GroupStatus = z.infer<typeof GroupStatusSchema>;
