export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createHttpClient({ baseUrl = '/api/v1', fetchImpl = globalThis.fetch } = {}) {
  async function request(path, { method = 'GET', body, headers, signal } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      throw new TypeError('API path must start with a single /.');
    }
    const requestHeaders = new Headers(headers);
    requestHeaders.set('Accept', 'application/json');
    if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method, headers: requestHeaders, credentials: 'include', cache: 'no-store', signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 204) return null;
    let payload;
    try { payload = await response.json(); } catch {
      throw new ApiError('Phản hồi máy chủ không hợp lệ.', { status: response.status, code: 'INVALID_RESPONSE' });
    }
    if (!response.ok) {
      throw new ApiError(payload.error?.message ?? 'Yêu cầu không thành công.', {
        status: response.status, code: payload.error?.code ?? 'HTTP_ERROR', details: payload.error?.details,
      });
    }
    return payload; // preserve {data: ...}, matching the shared API contract
  }
  return {
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  };
}

export const http = createHttpClient({ baseUrl: import.meta.env?.VITE_API_BASE_URL || '/api/v1' });
