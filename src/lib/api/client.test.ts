import { apiRequestPageBody } from './client';

describe('apiRequestPageBody', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return data, page, and body with extra fields', async () => {
    const mockData = [{ id: 1 }];
    const mockPage = { limit: 10, offset: 0, total: 1 };
    const mockBody = { unreadCount: 5, someOther: 'value' };
    const json = { data: mockData, page: mockPage, ...mockBody };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => json,
    } as any);

    const result = await apiRequestPageBody('/test');
    expect(result.data).toEqual(mockData);
    expect(result.page).toEqual(mockPage);
    expect(result.body).toEqual(mockBody);
  });

  it('should throw on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as any);

    await expect(apiRequestPageBody('/test')).rejects.toThrow(
      /API request failed/
    );
  });

  it('should throw if data is not an array', async () => {
    const json = { data: null, page: { limit: 10, offset: 0, total: 0 } };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => json,
    } as any);

    await expect(apiRequestPageBody('/test')).rejects.toThrow(
      /Expected `data` to be an array/
    );
  });

  it('should throw if page is not an object', async () => {
    const json = { data: [], page: 'invalid' };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => json,
    } as any);

    await expect(apiRequestPageBody('/test')).rejects.toThrow(
      /Expected `page` to be an object/
    );
  });

  it('should throw if unreadCount is missing', async () => {
    const mockData = [{ id: 1 }];
    const mockPage = { limit: 10, offset: 0, total: 1 };
    const mockBody = { someOther: 'value' }; // no unreadCount
    const json = { data: mockData, page: mockPage, ...mockBody };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => json,
    } as any);

    await expect(apiRequestPageBody('/test')).rejects.toThrow(
      /Missing or invalid `unreadCount`/
    );
  });

  it('should throw if unreadCount is wrong type', async () => {
    const mockData = [{ id: 1 }];
    const mockPage = { limit: 10, offset: 0, total: 1 };
    const mockBody = { unreadCount: 'five', someOther: 'value' };
    const json = { data: mockData, page: mockPage, ...mockBody };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => json,
    } as any);

    await expect(apiRequestPageBody('/test')).rejects.toThrow(
      /Missing or invalid `unreadCount`/
    );
  });
});
