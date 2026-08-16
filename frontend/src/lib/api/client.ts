export const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
export const WS_BASE_URL = BASE_URL.replace('http', 'ws').replace('://localhost', '://127.0.0.1');

export class ApiError extends Error {
  status: number;
  info?: unknown;

  constructor(message: string, status: number, info?: unknown) {
    super(message);
    this.status = status;
    this.info = info;
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

let refreshPromise: Promise<unknown> | null = null;

/**
 * Basic fetch wrapper for API calls.
 * Automatically attaches the base URL and includes credentials for JWT cookies.
 */
export async function apiClient(endpoint: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401 && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/google')) {
        try {
          if (!refreshPromise) {
            refreshPromise = (async () => {
              try {
                const refreshUrl = `${BASE_URL}/auth/refresh`;
                const res = await fetch(refreshUrl, {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                });
                if (!res.ok) {
                  throw new Error('Refresh failed');
                }
                return await res.json();
              } finally {
                refreshPromise = null;
              }
            })();
          }

          await refreshPromise;

          // Retry the original request
          const retryResponse = await fetch(url, {
            ...options,
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...options.headers,
            },
          });

          if (retryResponse.ok) {
            return retryResponse;
          }

          const errorData = await retryResponse.json().catch(() => ({}));
          const message = errorData.message || errorData.detail || `API error: ${retryResponse.status}`;
          throw new ApiError(message, retryResponse.status, errorData);
        } catch (refreshErr) {
          if (refreshErr instanceof ApiError || (refreshErr instanceof Error && refreshErr.name === 'ApiError')) {
            throw refreshErr;
          }
          // If refresh failed, fall back to throwing the original 401 error below
        }
      }

      const errorData = await response.json().catch(() => ({}));
      let message = errorData.message;
      
      if (!message) {
        if (typeof errorData.detail === 'string') {
          message = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          message = errorData.detail.map((d: { loc?: (string | number)[]; msg: string }) => {
            const loc = Array.isArray(d.loc) ? d.loc.join('.') : (d.loc || '');
            return loc ? `${loc}: ${d.msg}` : d.msg;
          }).join(', ');
        } else {
          message = `API error: ${response.status}`;
        }
      }
      
      throw new ApiError(message, response.status, errorData);
    }

    return response;
  } catch (err) {
    if (err instanceof ApiError || (err instanceof Error && err.name === 'ApiError')) {
      throw err;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    throw new ApiError(
      'Koneksi ke server gagal. Pastikan server backend Anda berjalan dan terhubung.',
      0,
      { originalError: errMsg }
    );
  }
}
