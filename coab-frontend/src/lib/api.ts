import axios from 'axios';

/**
 * API client for COAB Backend
 * Configured with base URL and interceptors for authentication
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // TODO: Implement token refresh logic in Iteration 2
    // For now, just reject the error
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      // Optionally redirect to login
      // window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * Health check function
 */
export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await api.get('/health');
  return response.data;
}







