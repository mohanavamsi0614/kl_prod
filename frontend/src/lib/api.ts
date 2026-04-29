const API_BASE_URL = import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL;

// Validate required environment variables in production
if (!import.meta.env.DEV && !import.meta.env.VITE_API_URL) {
  throw new Error('VITE_API_URL environment variable is required in production');
}

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

// API request counter with subscriber pattern
type CounterSubscriber = (count: number) => void;
let requestCount = 0;
const subscribers: Set<CounterSubscriber> = new Set();

export const apiCounter = {
  getCount: () => requestCount,
  subscribe: (callback: CounterSubscriber) => {
    subscribers.add(callback);
    // Immediately call with current count
    callback(requestCount);
    return () => subscribers.delete(callback);
  }
};

const incrementCounter = () => {
  requestCount++;
  subscribers.forEach(cb => cb(requestCount));
};

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { params, ...init } = options;

    // Increment counter for each API request
    incrementCounter();

    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...init.headers as Record<string, string>,
    };

    const config: RequestInit = {
      ...init,
      headers,
      credentials: "include", // Important for cookies
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Check for 'error' (used by our backend) or 'message' (standard)
      const error = new Error(errorData.error || errorData.message || `API Error: ${response.statusText}`);
      // Attach response data to error for easier access
      (error as any).response = {
        status: response.status,
        data: errorData,
      };
      throw error;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }


  get<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  post<T>(endpoint: string, body: unknown, options?: FetchOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  put<T>(endpoint: string, body: unknown, options?: FetchOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  delete<T>(endpoint: string, options?: FetchOptions) {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }

  patch<T>(endpoint: string, body: unknown, options?: FetchOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
