import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, MAX_API_RESPONSE_BYTES } from './client';

vi.mock('../env', () => ({ getEnv: () => ({ VITE_API_BASE_URL: 'https://api.example.test' }) }));
afterEach(() => vi.unstubAllGlobals());

describe('response size limit', () => {
  it.each([undefined, '1'])(
    'cancels an oversized stream even with Content-Length=%s',
    async (length) => {
      const cancel = vi.fn();
      let pulls = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          controller.enqueue(new Uint8Array(64 * 1024));
        },
        cancel,
      });
      const response = new Response(body, {
        headers: length === undefined ? {} : { 'content-length': length },
      });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(apiRequest('groups')).rejects.toMatchObject({
        name: 'ApiError',
        code: 'response_too_large',
      });
      expect(cancel).toHaveBeenCalledOnce();
      expect(pulls).toBeLessThanOrEqual(18);
      expect(response.body?.locked).toBe(false);
    },
  );

  it('accepts a valid JSON body exactly at the byte limit', async () => {
    const data = 'a'.repeat(MAX_API_RESPONSE_BYTES - JSON.stringify({ data: '' }).length);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }))));
    await expect(apiRequest('groups')).resolves.toBe(data);
  });

  it('measures bytes rather than UTF-16 character count', async () => {
    const data = 'é'.repeat(MAX_API_RESPONSE_BYTES / 2);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }))));
    await expect(apiRequest('groups')).rejects.toMatchObject({ code: 'response_too_large' });
  });

  it('decodes multibyte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ data: 'é🐈' }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(apiRequest('groups')).resolves.toBe('é🐈');
  });
});
