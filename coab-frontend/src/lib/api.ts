import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

/**
 * Axios API client with automatic token refresh
 * Handles JWT token attachment and 401 responses
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Track refresh state to prevent race conditions
let isRefreshing = false;
let refreshPromise: Promise<any> | null = null;

// Queue of requests waiting for token refresh
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

/**
 * Process queued requests after refresh completes
 */
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token!);
    }
  });
  failedQueue = [];
};

/**
 * Request interceptor: Attach access token to all requests
 */
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor: Auto-refresh on 401 (with race condition fix)
 * 
 * When multiple requests fail with 401 simultaneously:
 * 1. First request triggers refresh
 * 2. Other requests queue up
 * 3. All retry with new token once refresh completes
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Don't intercept auth endpoints - let them handle their own errors
    const isAuthEndpoint = originalRequest.url?.includes('/auth/');
    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    // If not a 401 or already retried, reject
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // If another request is already refreshing, queue this one
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    // Mark as retrying and start refresh
    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem('refresh_token');

    if (!refreshToken) {
      // No refresh token, redirect to login
      isRefreshing = false;
      localStorage.clear();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    try {
      // Create shared promise for all waiting requests
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
      refreshPromise = axios.post(`${baseUrl}/auth/refresh`, {
        refreshToken,
      });

      const response = await refreshPromise;
      const { accessToken, refreshToken: newRefreshToken } = response.data;

      // Update tokens
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', newRefreshToken);

      // Process queued requests with new token
      processQueue(null, accessToken);

      // Retry original request with new token
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      // Refresh failed, logout and redirect
      processQueue(refreshError, null);
      localStorage.clear();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  }
);

export default apiClient;
