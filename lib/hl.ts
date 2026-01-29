// Hyperliquid API client for fetching perpetual markets

import { HlMetaResponse, HlPerpAsset } from './types';
import { hlCache, CACHE_KEYS } from './cache';

const HL_API_URL = 'https://api.hyperliquid.xyz/info';

export interface HlFetchResult {
  perpAssets: HlPerpAsset[];
  perpSet: Set<string>;
  fetchedAt: string;
  fromCache: boolean;
  error?: string;
}

/**
 * Fetch all perpetual markets from Hyperliquid
 * Returns both the raw asset list and a normalized Set of tradeable symbols
 */
export async function fetchHlPerps(forceRefresh = false): Promise<HlFetchResult> {
  // Check cache first
  if (!forceRefresh) {
    const cached = hlCache.get<{ assets: HlPerpAsset[]; set: Set<string> }>(CACHE_KEYS.HL_PERPS);
    if (cached) {
      const timestamp = hlCache.getTimestamp(CACHE_KEYS.HL_PERPS);
      return {
        perpAssets: cached.assets,
        perpSet: cached.set,
        fetchedAt: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
        fromCache: true,
      };
    }
  }

  try {
    const response = await fetch(HL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'meta' }),
    });

    if (!response.ok) {
      throw new Error(`HL API error: ${response.status} ${response.statusText}`);
    }

    const data: HlMetaResponse = await response.json();

    if (!data.universe || !Array.isArray(data.universe)) {
      throw new Error('Invalid HL API response: missing universe array');
    }

    // Filter out delisted assets and build the set
    const activeAssets = data.universe.filter(
      (asset) => !asset.isDelisted
    );

    // Build normalized set of perp symbols (uppercase)
    const perpSet = new Set<string>(
      activeAssets.map((asset) => asset.name.toUpperCase())
    );

    // Cache the result
    hlCache.set(CACHE_KEYS.HL_PERPS, { assets: activeAssets, set: perpSet });

    return {
      perpAssets: activeAssets,
      perpSet,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching HL perps';
    console.error('Error fetching Hyperliquid perps:', errorMessage);
    
    // Return empty result on error
    return {
      perpAssets: [],
      perpSet: new Set(),
      fetchedAt: '',
      fromCache: false,
      error: errorMessage,
    };
  }
}

/**
 * Get just the Set of perp symbols (for quick lookups)
 */
export async function getHlPerpSet(forceRefresh = false): Promise<Set<string>> {
  const result = await fetchHlPerps(forceRefresh);
  return result.perpSet;
}

/**
 * Check if a symbol has a perp market on Hyperliquid
 */
export function isHedgeableOnHl(symbol: string, perpSet: Set<string>): boolean {
  return perpSet.has(symbol.toUpperCase());
}
