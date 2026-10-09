import { PageInfo } from './types';

export async function apiRequestPageBody<
  TData = unknown
>(
  endpoint: string,
  init?: RequestInit
): Promise<{
  data: TData;
  page: PageInfo;
  body: Record<string, unknown>;
}> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, init);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  const json = await response.json();

  // Validate data and page
  if (!Array.isArray(json.data)) {
    throw new Error('Expected `data` to be an array');
  }
  if (!json.page || typeof json.page !== 'object') {
    throw new Error('Expected `page` to be an object');
  }

  const { data, page, ...rest } = json;

  // Validate required extra field `unreadCount`
  if (typeof rest.unreadCount !== 'number') {
    throw new Error('Missing or invalid `unreadCount` in response body');
  }

  return {
    data: data as TData,
    page: page as PageInfo,
    body: rest,
  };
}
