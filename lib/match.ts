// Token normalization, aliasing, and hedgeability matching logic

import { VfatFarm, FarmResult, FarmType, MatchConfidence, Token } from './types';
import aliasesConfig from '@/config/aliases.json';
import excludedMajorsConfig from '@/config/excludedMajors.json';
import wrapperPatternsConfig from '@/config/wrapperPatterns.json';

// Type the imported configs
const aliases: Record<string, string> = aliasesConfig;
const excludedMajors: string[] = excludedMajorsConfig;
const wrapperPatterns = wrapperPatternsConfig as {
  prefixes: string[];
  suffixes: string[];
  contains: string[];
};

/**
 * Normalize a token symbol for comparison
 * - Trim whitespace
 * - Uppercase
 * - Remove common punctuation noise
 * - Strip known suffixes (configurable)
 */
export function normalizeSymbol(raw: string): string {
  if (!raw) return '';
  
  let sym = raw.trim().toUpperCase();
  
  // Remove common punctuation/noise
  sym = sym.replace(/[\s_]+/g, '');
  
  // Strip known suffix patterns (be conservative)
  const suffixPatterns = [
    /\.E$/i,          // USDC.e, ETH.e
    /-ERC20$/i,       // Token-ERC20
    /-ARB$/i,         // Token-ARB
    /-BASE$/i,        // Token-BASE
    /-OP$/i,          // Token-OP
    /-AVAX$/i,        // Token-AVAX
    /-POLY$/i,        // Token-POLY
    /\.ARB$/i,        // Token.ARB
    /\.BASE$/i,       // Token.BASE
    /\.OP$/i,         // Token.OP
  ];
  
  for (const pattern of suffixPatterns) {
    sym = sym.replace(pattern, '');
  }
  
  return sym;
}

/**
 * Apply alias mapping to a normalized symbol
 */
export function applyAlias(normalizedSymbol: string): string {
  return aliases[normalizedSymbol] || normalizedSymbol;
}

/**
 * Full symbol resolution: normalize then alias
 */
export function resolveSymbol(raw: string): string {
  const normalized = normalizeSymbol(raw);
  return applyAlias(normalized);
}

/**
 * Check if a symbol is in the excluded majors list (after resolution)
 */
export function isExcludedMajor(symbol: string): boolean {
  const resolved = resolveSymbol(symbol);
  return excludedMajors.includes(resolved);
}

/**
 * Detect if a symbol looks like a wrapper/receipt token
 */
export function isWrapperToken(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  
  // Check contains patterns
  for (const pattern of wrapperPatterns.contains) {
    if (upper.includes(pattern.toUpperCase())) {
      return true;
    }
  }
  
  // Check suffix patterns
  for (const suffix of wrapperPatterns.suffixes) {
    if (upper.endsWith(suffix.toUpperCase())) {
      return true;
    }
  }
  
  // Note: We intentionally don't check prefixes here as they're too common
  // and would cause false positives (e.g., "SHIB" starts with "S")
  
  return false;
}

/**
 * Classify farm type based on token count and structure
 */
export function classifyFarmType(farm: VfatFarm): FarmType {
  const tokens = farm.tokens;
  
  if (!tokens || tokens.length === 0) {
    return 'unknown';
  }
  
  // Check for wrapper/receipt token indicators
  const poolName = farm.pool_name.toUpperCase();
  const hasWrapperInName = isWrapperToken(poolName);
  
  if (tokens.length === 1) {
    const singleSymbol = tokens[0].symbol;
    
    // If the single token looks like a wrapper
    if (isWrapperToken(singleSymbol)) {
      return 'receipt_or_wrapper';
    }
    
    // Or if the pool name indicates it's a wrapper
    if (hasWrapperInName) {
      return 'receipt_or_wrapper';
    }
    
    return 'single';
  }
  
  if (tokens.length === 2) {
    // Check if either token looks like a wrapper
    if (tokens.some(t => isWrapperToken(t.symbol))) {
      return 'receipt_or_wrapper';
    }
    return 'lp_pair';
  }
  
  if (tokens.length > 2) {
    return 'multi';
  }
  
  return 'unknown';
}

/**
 * Determine match confidence based on data quality
 */
export function determineConfidence(
  farm: VfatFarm,
  farmType: FarmType,
  tokens: Token[]
): MatchConfidence {
  // Low confidence cases
  if (farmType === 'receipt_or_wrapper' || farmType === 'unknown') {
    return 'low';
  }
  
  // Check if we have addresses for all tokens
  const hasAllAddresses = tokens.every(t => t.address && t.address.length > 0);
  
  // Check for suspicious symbol formatting
  const hasSuspiciousSymbols = tokens.some(t => {
    const sym = t.symbol;
    // Very short (might be truncated)
    if (sym.length < 2) return true;
    // Contains numbers in unusual ways
    if (/^\d+/.test(sym)) return true;
    // All lowercase (might be address)
    if (sym === sym.toLowerCase() && sym.length > 4) return true;
    return false;
  });
  
  if (hasSuspiciousSymbols) {
    return 'low';
  }
  
  // High confidence: have addresses and clean symbols
  if (hasAllAddresses && tokens.length >= 2) {
    return 'high';
  }
  
  // Medium confidence: symbols only but look clean
  return 'medium';
}

/**
 * Process a single farm and determine hedgeability
 */
export function analyzeFarm(farm: VfatFarm, hlPerpSet: Set<string>): FarmResult {
  const notes: string[] = [];
  
  // Classify farm type
  const farmType = classifyFarmType(farm);
  
  // Extract raw symbols
  const pairSymbols = farm.tokens.map(t => t.symbol);
  const pairAddresses = farm.tokens
    .filter(t => t.address)
    .map(t => t.address as string);
  
  // Normalize all symbols
  const normalizedAssets = farm.tokens.map(t => resolveSymbol(t.symbol));
  
  // Separate excluded vs non-major
  const excludedAssets: string[] = [];
  const nonMajorAssets: string[] = [];
  
  normalizedAssets.forEach((resolved, idx) => {
    const original = pairSymbols[idx];
    if (excludedMajors.includes(resolved)) {
      excludedAssets.push(original);
    } else {
      nonMajorAssets.push(resolved);
    }
  });
  
  // Handle special cases
  let hedgeableAssetsOnHl: string[] = [];
  let hedgeable = false;
  let needsUnwrap = false;
  
  if (farmType === 'receipt_or_wrapper') {
    notes.push('Wrapper/receipt token detected; underlying assets unknown');
    needsUnwrap = true;
  } else if (farmType === 'unknown') {
    notes.push('Could not determine farm structure');
  } else if (nonMajorAssets.length === 0) {
    notes.push('No non-major assets to evaluate');
  } else {
    // Check each non-major asset against HL perps
    hedgeableAssetsOnHl = nonMajorAssets.filter(asset => 
      hlPerpSet.has(asset.toUpperCase())
    );
    
    hedgeable = hedgeableAssetsOnHl.length > 0;
    
    if (!hedgeable && nonMajorAssets.length > 0) {
      notes.push(`Non-hedgeable assets: ${nonMajorAssets.join(', ')}`);
    }
  }
  
  // Determine confidence
  const confidence = determineConfidence(farm, farmType, farm.tokens);
  
  // Build result
  return {
    farm_id: farm.farm_id,
    chain: farm.chain,
    chain_id: farm.chain_id,
    protocol: farm.protocol,
    pool_name: farm.pool_name,
    farm_type: farmType,
    url: farm.url,
    tvl: farm.tvl,
    apy: farm.apy,
    pair_symbols: pairSymbols,
    pair_addresses: pairAddresses.length > 0 ? pairAddresses : undefined,
    normalized_assets: normalizedAssets,
    excluded_assets: excludedAssets,
    non_major_assets: nonMajorAssets,
    hedgeable_assets_on_hl: hedgeableAssetsOnHl,
    hedgeable,
    match_confidence: confidence,
    needs_unwrap: needsUnwrap || undefined,
    notes: notes.length > 0 ? notes : undefined,
  };
}

/**
 * Analyze all farms and return results
 */
export function analyzeAllFarms(
  farms: VfatFarm[],
  hlPerpSet: Set<string>
): FarmResult[] {
  return farms.map(farm => analyzeFarm(farm, hlPerpSet));
}

/**
 * Filter results based on query parameters
 */
export function filterResults(
  results: FarmResult[],
  options: {
    onlyHedgeable?: boolean;
    minTvl?: number;
    minApy?: number;
    search?: string;
    chain?: string;
    protocol?: string;
  }
): FarmResult[] {
  let filtered = [...results];
  
  // Filter by hedgeability
  if (options.onlyHedgeable) {
    filtered = filtered.filter(r => r.hedgeable);
  }
  
  // Filter by minimum TVL
  if (options.minTvl !== undefined && options.minTvl > 0) {
    filtered = filtered.filter(r => 
      r.tvl !== undefined && r.tvl >= options.minTvl!
    );
  }
  
  // Filter by minimum APY
  if (options.minApy !== undefined && options.minApy > 0) {
    filtered = filtered.filter(r => 
      r.apy !== undefined && r.apy >= options.minApy!
    );
  }
  
  // Filter by chain
  if (options.chain) {
    const chainLower = options.chain.toLowerCase();
    filtered = filtered.filter(r => 
      r.chain.toLowerCase().includes(chainLower)
    );
  }
  
  // Filter by protocol
  if (options.protocol) {
    const protocolLower = options.protocol.toLowerCase();
    filtered = filtered.filter(r => 
      r.protocol.toLowerCase().includes(protocolLower)
    );
  }
  
  // Search filter (search across multiple fields)
  if (options.search) {
    const searchLower = options.search.toLowerCase();
    filtered = filtered.filter(r => {
      // Search in pool name
      if (r.pool_name.toLowerCase().includes(searchLower)) return true;
      // Search in protocol
      if (r.protocol.toLowerCase().includes(searchLower)) return true;
      // Search in chain
      if (r.chain.toLowerCase().includes(searchLower)) return true;
      // Search in pair symbols
      if (r.pair_symbols.some(s => s.toLowerCase().includes(searchLower))) return true;
      // Search in normalized assets
      if (r.normalized_assets.some(s => s.toLowerCase().includes(searchLower))) return true;
      return false;
    });
  }
  
  return filtered;
}

/**
 * Sort results (hedgeable first, then by TVL descending)
 */
export function sortResults(results: FarmResult[]): FarmResult[] {
  return [...results].sort((a, b) => {
    // Hedgeable first
    if (a.hedgeable && !b.hedgeable) return -1;
    if (!a.hedgeable && b.hedgeable) return 1;
    
    // Then by TVL descending
    const tvlA = a.tvl ?? 0;
    const tvlB = b.tvl ?? 0;
    return tvlB - tvlA;
  });
}
