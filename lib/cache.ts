// Simple in-memory cache with TTL support

import { CacheEntry } from './types';

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private ttl: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttl = ttlMs;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    const data = this.get(key);
    return data !== null;
  }

  getTimestamp(key: string): number | null {
    const entry = this.cache.get(key);
    return entry ? entry.timestamp : null;
  }
}

// Singleton instances for different cache types
export const vfatCache = new MemoryCache();
export const hlCache = new MemoryCache();
export const scanCache = new MemoryCache();

// Cache keys
export const CACHE_KEYS = {
  VFAT_FARMS: 'vfat_farms',
  HL_PERPS: 'hl_perps',
  SCAN_RESULTS: 'scan_results',
} as const;

// Helper to clear all caches
export function clearAllCaches(): void {
  vfatCache.clear();
  hlCache.clear();
  scanCache.clear();
}

export { MemoryCache };
