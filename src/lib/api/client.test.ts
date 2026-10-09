import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from './client';
import { ApiError } from './types';

const originalFetch = globalThis.fetch;

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:3000');
    vi.restoreAllMocks();
  });

  it('should make a successful GET request', async () => {
    const mockData = { id: 1, name: 'test' };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: null,
      text: async () => JSON.stringify(mockData),
    });

    const result = await client.get('/users/1');
    expect(result.data).toEqual(mockData);
    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/users/1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('should throw ApiError on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: null,
      text: async () => JSON.stringify({ message: 'Not found' }),
    });

    await expect(client.get('/users/999')).rejects.toThrow(ApiError);
    await expect(client.get('/users/999')).rejects.toThrow('Not found');
  });

  it('should handle empty response body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: null,
      text: async () => '',
    });

    const result = await client.get('/empty');
    expect(result.data).toBeUndefined();
    expect(result.status).toBe(204);
  });

  it('should send JSON body on POST request', async () => {
    const mockData = { id: 1 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: null,
      text: async () => JSON.stringify(mockData),
    });

    await client.post('/users', { name: 'test' });
    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(call[0]).toBe('http://localhost:3000/users');
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body as string)).toEqual({ name: 'test' });
  });

  describe('response body size limit', () => {
    it('should reject responses exceeding MAX_RESPONSE_BODY_SIZE', async () => {
      const oversizedBody = 'x'.repeat(11 * 1024 * 1024); // 11 MB

      const mockReadableStream = new ReadableStream({
        start(controller) {
          const chunk = new TextEncoder().encode(oversizedBody);
          controller.enqueue(chunk);
          controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: mockReadableStream,
        text: async () => oversizedBody,
      });

      await expect(client.get('/large')).rejects.toThrow(ApiError);
      await expect(client.get('/large')).rejects.toThrow(
        'Response body exceeds maximum allowed size',
      );
    });

    it('should allow normal-sized responses', async () => {
      const normalBody = JSON.stringify({ id: 1, name: 'test' });

      const mockReadableStream = new ReadableStream({
        start(controller) {
          const chunk = new TextEncoder().encode(normalBody);
          controller.enqueue(chunk);
          controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: mockReadableStream,
        text: async () => normalBody,
      });

      const result = await client.get('/normal');
      expect(result.data).toEqual({ id: 1, name: 'test' });
      expect(result.status).toBe(200);
    });

    it('should handle chunked oversized responses', async () => {
      const oversizedBody = 'x'.repeat(11 * 1024 * 1024); // 11 MB

      const mockReadableStream = new ReadableStream({
        start(controller) {
          // Send in two chunks
          const mid = Math.floor(oversizedBody.length / 2);
          const chunk1 = new TextEncoder().encode(oversizedBody.slice(0, mid));
          const chunk2 = new TextEncoder().encode(oversizedBody.slice(mid));
          controller.enqueue(chunk1);
          controller.enqueue(chunk2);
          controller.close();
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: mockReadableStream,
        text: async () => oversizedBody,
      });

      await expect(client.get('/large-chunked')).rejects.toThrow(ApiError);
      await expect(client.get('/large-chunked')).rejects.toThrow(
        'Response body exceeds maximum allowed size',
      );
    });

    it('should cancel the reader when size limit is exceeded', async () => {
      const oversizedBody = 'x'.repeat(11 * 1024 * 1024); // 11 MB
      const cancelSpy = vi.fn();

      const mockReadableStream = new ReadableStream({
        start(controller) {
          const chunk = new TextEncoder().encode(oversizedBody);
          controller.enqueue(chunk);
          controller.close();
        },
        cancel: cancelSpy,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: mockReadableStream,
        text: async () => oversizedBody,
        getReader: () => ({
          read: async () => ({
            done: false,
            value: new TextEncoder().encode(oversizedBody),
          }),
          cancel: cancelSpy,
        }),
      });

      await expect(client.get('/large-cancel')).rejects.toThrow(ApiError);
      expect(cancelSpy).toHaveBeenCalled();
    });
  });
});
