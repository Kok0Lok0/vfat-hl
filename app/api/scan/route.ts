// GET /api/scan - Main scanning endpoint

import { NextRequest, NextResponse } from 'next/server';
import { fetchFarms } from '@/lib/vfat';
import { fetchHlPerps } from '@/lib/hl';
import { analyzeAllFarms, filterResults, sortResults } from '@/lib/match';
import { scanCache, CACHE_KEYS, clearAllCaches } from '@/lib/cache';
import { ScanResponse, FarmResult, ScanQueryParams } from '@/lib/types';

export const dynamic = 'force-dynamic';

function parseQueryParams(request: NextRequest): ScanQueryParams {
  const searchParams = request.nextUrl.searchParams;
  
  return {
    onlyHedgeable: searchParams.get('onlyHedgeable') === '1',
    minTvl: searchParams.get('minTvl') ? Number(searchParams.get('minTvl')) : undefined,
    minApy: searchParams.get('minApy') ? Number(searchParams.get('minApy')) : undefined,
    search: searchParams.get('search') || undefined,
    refresh: searchParams.get('refresh') === '1',
    chain: searchParams.get('chain') || undefined,
    protocol: searchParams.get('protocol') || undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = parseQueryParams(request);
    const forceRefresh = params.refresh;
    
    // Clear caches if refresh requested
    if (forceRefresh) {
      clearAllCaches();
    }
    
    // Check for cached scan results (before filtering)
    const cachedResults = !forceRefresh 
      ? scanCache.get<FarmResult[]>(CACHE_KEYS.SCAN_RESULTS) 
      : null;
    
    let results: FarmResult[];
    let vfatFetchedAt: string | null = null;
    let hlFetchedAt: string | null = null;
    let cacheHit = false;
    let error: string | undefined;
    
    if (cachedResults) {
      // Use cached results
      results = cachedResults;
      const timestamp = scanCache.getTimestamp(CACHE_KEYS.SCAN_RESULTS);
      vfatFetchedAt = timestamp ? new Date(timestamp).toISOString() : null;
      hlFetchedAt = vfatFetchedAt;
      cacheHit = true;
    } else {
      // Fetch fresh data
      const [vfatResult, hlResult] = await Promise.all([
        fetchFarms(forceRefresh),
        fetchHlPerps(forceRefresh),
      ]);
      
      vfatFetchedAt = vfatResult.fetchedAt || null;
      hlFetchedAt = hlResult.fetchedAt || null;
      
      // Handle errors
      if (vfatResult.error) {
        error = `VFAT: ${vfatResult.error}`;
      }
      
      if (hlResult.error) {
        const hlError = `HL: ${hlResult.error}`;
        error = error ? `${error}; ${hlError}` : hlError;
      }
      
      // Analyze farms
      if (vfatResult.farms.length > 0) {
        results = analyzeAllFarms(vfatResult.farms, hlResult.perpSet);
        
        // If HL failed, add notes to all results
        if (hlResult.error) {
          results = results.map(r => ({
            ...r,
            hedgeable: false,
            hedgeable_assets_on_hl: [],
            notes: [...(r.notes || []), 'HL unavailable; hedgeability unknown'],
          }));
        }
        
        // Cache the unfiltered results
        scanCache.set(CACHE_KEYS.SCAN_RESULTS, results);
      } else {
        results = [];
      }
    }
    
    // Apply filters
    const filteredResults = filterResults(results, {
      onlyHedgeable: params.onlyHedgeable,
      minTvl: params.minTvl,
      minApy: params.minApy,
      search: params.search,
      chain: params.chain,
      protocol: params.protocol,
    });
    
    // Sort results
    const sortedResults = sortResults(filteredResults);
    
    // Build response
    const response: ScanResponse = {
      meta: {
        vfatFetchedAt,
        hlFetchedAt,
        farmsTotal: results.length,
        farmsEvaluated: results.filter(r => r.farm_type !== 'unknown').length,
        farmsHedgeable: results.filter(r => r.hedgeable).length,
        cacheHit,
        error,
      },
      data: sortedResults,
    };
    
    return NextResponse.json(response);
    
  } catch (err) {
    console.error('Scan API error:', err);
    
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    
    return NextResponse.json(
      {
        meta: {
          vfatFetchedAt: null,
          hlFetchedAt: null,
          farmsTotal: 0,
          farmsEvaluated: 0,
          farmsHedgeable: 0,
          cacheHit: false,
          error: errorMessage,
        },
        data: [],
      } satisfies ScanResponse,
      { status: 502 }
    );
  }
}
