import { z } from 'zod';
import { GroupSummarySchema, TransactionReceiptSchema } from './schemas';

export class ApiError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiPage<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export async function apiRequest<T>(
  schema: z.ZodSchema<T>,
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError('Invalid JSON response');
  }
  if (!res.ok) {
    throw new ApiError(`API request failed with ${res.status}`);
  }
  try {
    return schema.parse((body as any)?.data);
  } catch (e) {
    throw new ApiError('API response validation failed', e);
  }
}

export function pageOf<T>(schema: z.ZodSchema<T>, raw: unknown): ApiPage<T> {
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('Invalid page payload');
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.data)) {
    throw new ApiError('Page data is not an array');
  }
  try {
    const data = z.array(schema).parse(obj.data);
    return {
      data,
      page: typeof obj.page === 'number' ? obj.page : 1,
      pageSize: typeof obj.pageSize === 'number' ? obj.pageSize : 20,
      total: typeof obj.total === 'number' ? obj.total : 0,
    };
  } catch (e) {
    throw new ApiError('Page items validation failed', e);
  }
}

export const fetchGroupsPage = async (url: string, init?: RequestInit): Promise<ApiPage<import('./schemas').GroupSummary>> => {
  const res = await fetch(url, init);
  const json = await res.json();
  return pageOf(GroupSummarySchema, json);
};

export const fetchTransactionReceipt = async (url: string, init?: RequestInit): Promise<import('./schemas').TransactionReceipt> => {
  return apiRequest(TransactionReceiptSchema, url, init);
};
