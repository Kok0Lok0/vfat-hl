// VFAT API client for fetching farms/pools
// Based on VFAT OpenAPI spec: https://api.vfat.io

import { VfatFarm, Token } from './types';
import { vfatCache, CACHE_KEYS } from './cache';

// VFAT API Configuration - from OpenAPI spec
const VFAT_API_BASE = 'https://api.vfat.io';
const VFAT_FARMS_ENDPOINT = '/v4/farms';

// ============================================
// VFAT API Types (from OpenAPI spec def-43, def-40, def-7, def-3)
// ============================================

interface VfatTokenMetaData {
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
  totalSupply?: string;
  price?: number;
  oracleAddress?: string;
  liquidity?: number;
  reserves?: string;
}

interface VfatPoolUnderlyingToken {
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
  price?: number;
  reserve?: string;
}

interface VfatPool {
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
  totalSupply?: string;
  price?: number;
  isStable?: boolean;
  factoryAddress?: string;
  poolId?: string;
  fee?: number;
  currentFee?: number;
  sqrtPrice?: string;
  tick?: number;
  tickSpacing?: number;
  swapFeeShare?: number;
  underlying?: VfatPoolUnderlyingToken[];
  points?: unknown[];
}

interface VfatProtocolInfo {
  id: string;
  name: string;
  url: string;
  insurance: boolean;
  version?: number;
}

interface VfatRewardInfo {
  rewardToken: VfatTokenMetaData;
  rewardsPerSecond: string;
}

interface VfatOffChainReward {
  rewardToken: VfatTokenMetaData;
  rewardsPerSecond: string;
  protocol: 'merkl' | 'metrom';
  campaignId?: string;
}

// Main Farm type (def-43 FarmDisplayInfo)
interface VfatApiFarm {
  chainId: number;
  address: string;
  protocol: VfatProtocolInfo;
  stateViewAddress?: string;
  routerAddress?: string;
  nftManagerAddress?: string;
  type: string;
  pool: VfatPool;
  poolIndex: number;
  balance: string;
  rewards: VfatRewardInfo[];
  offChainRewards: VfatOffChainReward[];
  rewardTokenAddresses: string[];
  isKilled?: boolean;
  inPlaceUpdate?: boolean;
}

export interface VfatFetchResult {
  farms: VfatFarm[];
  fetchedAt: string;
  fromCache: boolean;
  error?: string;
}

/**
 * Map chain ID to chain name
 */
function getChainName(chainId: number): string {
  const chains: Record<number, string> = {
    1: 'Ethereum',
    10: 'Optimism',
    56: 'BSC',
    137: 'Polygon',
    250: 'Fantom',
    42161: 'Arbitrum',
    43114: 'Avalanche',
    8453: 'Base',
    324: 'zkSync Era',
    59144: 'Linea',
    534352: 'Scroll',
    1101: 'Polygon zkEVM',
    5000: 'Mantle',
    81457: 'Blast',
    34443: 'Mode',
    100: 'Gnosis',
    1284: 'Moonbeam',
    1285: 'Moonriver',
    42220: 'Celo',
    1088: 'Metis',
    288: 'Boba',
    122: 'Fuse',
    1313161554: 'Aurora',
    25: 'Cronos',
    146: 'Sonic',
    252: 'Fraxtal',
    7777777: 'Zora',
    666666666: 'Degen',
    2741: 'Abstract',
    480: 'World Chain',
    1135: 'Lisk',
    167000: 'Taiko',
  };
  return chains[chainId] || `Chain ${chainId}`;
}

/**
 * Calculate estimated APY from rewards
 * This is a rough estimate based on reward rates and TVL
 */
function estimateApy(farm: VfatApiFarm): number | undefined {
  // If pool has no price/TVL data, can't estimate APY
  if (!farm.pool.price) return undefined;
  
  const poolTvl = farm.pool.price;
  if (poolTvl <= 0) return undefined;
  
  let totalRewardValuePerYear = 0;
  
  // On-chain rewards
  for (const reward of farm.rewards) {
    if (reward.rewardToken.price && reward.rewardsPerSecond) {
      const rewardsPerSecond = parseFloat(reward.rewardsPerSecond) / Math.pow(10, reward.rewardToken.decimals);
      const rewardsPerYear = rewardsPerSecond * 60 * 60 * 24 * 365;
      totalRewardValuePerYear += rewardsPerYear * reward.rewardToken.price;
    }
  }
  
  // Off-chain rewards (Merkl, Metrom)
  for (const reward of farm.offChainRewards) {
    if (reward.rewardToken.price && reward.rewardsPerSecond) {
      const rewardsPerSecond = parseFloat(reward.rewardsPerSecond) / Math.pow(10, reward.rewardToken.decimals);
      const rewardsPerYear = rewardsPerSecond * 60 * 60 * 24 * 365;
      totalRewardValuePerYear += rewardsPerYear * reward.rewardToken.price;
    }
  }
  
  if (totalRewardValuePerYear <= 0) return undefined;
  
  // APY = (rewards per year / TVL) * 100
  const apy = (totalRewardValuePerYear / poolTvl) * 100;
  
  // Sanity check - APY above 10000% is probably wrong
  return apy > 10000 ? undefined : apy;
}

/**
 * Transform VFAT API farm to our standardized format
 */
function transformVfatFarm(raw: VfatApiFarm): VfatFarm {
  // Extract underlying tokens
  const tokens: Token[] = [];
  
  if (raw.pool.underlying && Array.isArray(raw.pool.underlying)) {
    for (const t of raw.pool.underlying) {
      if (!t.symbol) continue; // skip tokens with null/undefined symbol
      tokens.push({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        name: t.name,
      });
    }
  }
  
  // If no underlying tokens, try to parse from pool symbol (e.g., "WETH/USDC")
  if (tokens.length === 0 && raw.pool?.symbol) {
    const parts = raw.pool.symbol.split(/[-\/]/);
    for (const part of parts) {
      const symbol = part.trim();
      if (symbol && symbol.length <= 15) {
        tokens.push({ symbol });
      }
    }
  }
  
  // Calculate TVL from pool price (which represents total value)
  const tvl = raw.pool.price;
  
  // Estimate APY from rewards
  const apy = estimateApy(raw);
  
  // Build pool name
  const poolName = raw.pool.name || raw.pool.symbol || `Pool ${raw.poolIndex}`;
  
  // Build URL to VFAT
  const vfatUrl = `https://vfat.io/yield?chains=${raw.chainId}&protocols=${raw.protocol.id}`;
  
  return {
    farm_id: `${raw.chainId}-${raw.address}-${raw.poolIndex}`,
    chain: getChainName(raw.chainId),
    chain_id: raw.chainId,
    protocol: raw.protocol.name,
    pool_name: poolName,
    tokens,
    tvl,
    apy,
    url: raw.protocol.url || vfatUrl,
    raw: raw as unknown as Record<string, unknown>,
  };
}

/**
 * Fetch farms from VFAT API
 * GET https://api.vfat.io/v4/farms
 * Optional query: chainId
 */
export async function fetchVfatFarms(forceRefresh = false): Promise<VfatFetchResult> {
  // Check cache first
  if (!forceRefresh) {
    const cached = vfatCache.get<VfatFarm[]>(CACHE_KEYS.VFAT_FARMS);
    if (cached) {
      const timestamp = vfatCache.getTimestamp(CACHE_KEYS.VFAT_FARMS);
      return {
        farms: cached,
        fetchedAt: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
        fromCache: true,
      };
    }
  }

  try {
    console.log('Fetching farms from VFAT API...');
    
    const response = await fetch(`${VFAT_API_BASE}${VFAT_FARMS_ENDPOINT}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Add timeout
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`VFAT API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }

    const data: VfatApiFarm[] = await response.json();
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid VFAT API response: expected array of farms');
    }

    console.log(`Fetched ${data.length} farms from VFAT API`);

    // Filter out killed farms
    const activeFarms = data.filter(farm => !farm.isKilled);
    
    // Transform to standardized format
    const farms = activeFarms.map(transformVfatFarm);

    // Cache the result
    vfatCache.set(CACHE_KEYS.VFAT_FARMS, farms);

    return {
      farms,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching VFAT farms';
    console.error('Error fetching VFAT farms:', errorMessage);

    return {
      farms: [],
      fetchedAt: '',
      fromCache: false,
      error: errorMessage,
    };
  }
}

/**
 * Fetch farms for a specific chain
 */
export async function fetchVfatFarmsByChain(chainId: number, forceRefresh = false): Promise<VfatFetchResult> {
  const cacheKey = `${CACHE_KEYS.VFAT_FARMS}_${chainId}`;
  
  // Check cache first
  if (!forceRefresh) {
    const cached = vfatCache.get<VfatFarm[]>(cacheKey);
    if (cached) {
      const timestamp = vfatCache.getTimestamp(cacheKey);
      return {
        farms: cached,
        fetchedAt: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
        fromCache: true,
      };
    }
  }

  try {
    const url = `${VFAT_API_BASE}${VFAT_FARMS_ENDPOINT}?chainId=${chainId}`;
    console.log(`Fetching farms for chain ${chainId} from VFAT API...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`VFAT API error: ${response.status} ${response.statusText}`);
    }

    const data: VfatApiFarm[] = await response.json();
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid VFAT API response: expected array of farms');
    }

    // Filter out killed farms and transform
    const activeFarms = data.filter(farm => !farm.isKilled);
    const farms = activeFarms.map(transformVfatFarm);

    // Cache the result
    vfatCache.set(cacheKey, farms);

    return {
      farms,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error fetching VFAT farms for chain ${chainId}:`, errorMessage);

    return {
      farms: [],
      fetchedAt: '',
      fromCache: false,
      error: errorMessage,
    };
  }
}

// Export the main fetch function
export const fetchFarms = fetchVfatFarms;
