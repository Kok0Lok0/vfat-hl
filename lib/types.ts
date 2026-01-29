// Types for the VFAT ↔ HL Hedgeability Scanner

export type FarmType = 'lp_pair' | 'single' | 'multi' | 'receipt_or_wrapper' | 'unknown';

export type MatchConfidence = 'high' | 'medium' | 'low';

export interface Token {
  symbol: string;
  address?: string;
  decimals?: number;
  name?: string;
}

export interface VfatFarm {
  // Core identifiers
  farm_id: string;
  chain: string;
  chain_id?: number;
  protocol: string;
  pool_name: string;
  
  // Underlying tokens
  tokens: Token[];
  
  // Metrics
  tvl?: number;
  apy?: number;
  apr?: number;
  
  // Links
  url?: string;
  
  // Raw data for debugging
  raw?: Record<string, unknown>;
}

export interface FarmResult {
  // Core identifiers
  farm_id: string;
  chain: string;
  chain_id?: number;
  protocol: string;
  pool_name: string;
  
  // Farm classification
  farm_type: FarmType;
  
  // Links
  url?: string;
  
  // Metrics
  tvl?: number;
  apy?: number;
  
  // Token analysis
  pair_symbols: string[];
  pair_addresses?: string[];
  normalized_assets: string[];
  excluded_assets: string[];
  non_major_assets: string[];
  hedgeable_assets_on_hl: string[];
  
  // Results
  hedgeable: boolean;
  match_confidence: MatchConfidence;
  needs_unwrap?: boolean;
  notes?: string[];
}

export interface ScanMeta {
  vfatFetchedAt: string | null;
  hlFetchedAt: string | null;
  farmsTotal: number;
  farmsEvaluated: number;
  farmsHedgeable: number;
  cacheHit: boolean;
  error?: string;
}

export interface ScanResponse {
  meta: ScanMeta;
  data: FarmResult[];
}

export interface ScanQueryParams {
  onlyHedgeable?: boolean;
  minTvl?: number;
  minApy?: number;
  search?: string;
  refresh?: boolean;
  chain?: string;
  protocol?: string;
}

// Hyperliquid API types
export interface HlPerpAsset {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
  isDelisted?: boolean;
}

export interface HlMetaResponse {
  universe: HlPerpAsset[];
  marginTables?: unknown[];
}

// VFAT API types - these will need to be adjusted based on actual API response
export interface VfatApiPool {
  id?: string;
  chain?: string;
  chainId?: number;
  protocol?: string;
  name?: string;
  symbol?: string;
  tokens?: Array<{
    symbol?: string;
    address?: string;
    decimals?: number;
    name?: string;
  }>;
  token0?: { symbol?: string; address?: string };
  token1?: { symbol?: string; address?: string };
  tvl?: number;
  tvlUsd?: number;
  apy?: number;
  apr?: number;
  apyBase?: number;
  apyReward?: number;
  url?: string;
  underlyingTokens?: string[];
  rewardTokens?: string[];
  pool?: string;
  project?: string;
}

// Cache types
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
