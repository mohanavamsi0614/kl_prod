/**
 * In-memory cache for frequently accessed data
 * Stores data for short periods to reduce DB/API calls
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

export const createCacheKey = (prefix: string, ...parts: (string | number | undefined)[]): string => {
  const validParts = parts.filter(p => p !== undefined);
  return `${prefix}:${validParts.join(':')}`;
};

export const getCached = <T>(key: string): T | null => {
  const entry = cache.get(key);
  
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.data as T;
};

export const setCached = <T>(key: string, data: T, ttlSeconds: number = 60): void => {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
};

export const clearCache = (pattern?: string): void => {
  if (!pattern) {
    cache.clear();
    return;
  }

  const keysToDelete: string[] = [];
  cache.forEach((_, key) => {
    if (key.startsWith(pattern)) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => cache.delete(key));
};

export const getCacheStats = () => {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
};
