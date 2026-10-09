import { ApiError, ApiResponse } from './types';

const DEFAULT_API_BASE_URL = 'https://api.susu-labs.io';
const MAX_RESPONSE_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

export class ApiClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(baseUrl?: string, headers?: Record<string, string>) {
    this.baseUrl = baseUrl ?? DEFAULT_API_BASE_URL;
    this.headers = {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    };
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    const options: RequestInit = {
      method,
      headers: this.headers,
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // Read the body through a streaming reader with a size cap
    const text = await this.readResponseBody(response);

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const json = JSON.parse(text);
        errorMessage = json.message ?? json.error ?? errorMessage;
      } catch {
        // Use raw text as error message if parsing fails
        errorMessage = text || errorMessage;
      }
      throw new ApiError(errorMessage, response.status);
    }

    let data: T;
    if (text.trim() === '') {
      data = undefined as T;
    } else {
      data = JSON.parse(text) as T;
    }

    return { data, status: response.status };
  }

  /**
   * Reads the response body through a streaming reader, rejecting with an
   * ApiError if the body exceeds MAX_RESPONSE_BODY_SIZE bytes.
   */
  private async readResponseBody(response: Response): Promise<string> {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/octet-stream')) {
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_RESPONSE_BODY_SIZE) {
        throw new ApiError(
          `Response body exceeds maximum allowed size of ${MAX_RESPONSE_BODY_SIZE} bytes`,
          response.status,
        );
      }
      return new TextDecoder().decode(arrayBuffer);
    }

    if (!response.body) {
      return '';
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        totalLength += value.length;
        if (totalLength > MAX_RESPONSE_BODY_SIZE) {
          reader.cancel();
          throw new ApiError(
            `Response body exceeds maximum allowed size of ${MAX_RESPONSE_BODY_SIZE} bytes`,
            response.status,
          );
        }
        chunks.push(value);
      }
    }

    const decoder = new TextDecoder();
    return chunks.map((chunk) => decoder.decode(chunk)).join('');
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path);
  }
}

export const apiClient = new ApiClient();
