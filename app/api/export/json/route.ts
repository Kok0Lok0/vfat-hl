// GET /api/export/json - Export scan results as JSON file

import { NextRequest, NextResponse } from 'next/server';
import { fetchFarms } from '@/lib/vfat';
import { fetchHlPerps } from '@/lib/hl';
import { analyzeAllFarms, filterResults, sortResults } from '@/lib/match';
import { scanCache, CACHE_KEYS } from '@/lib/cache';
import { FarmResult, ScanQueryParams, ScanResponse } from '@/lib/types';

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
    
    // Check for cached scan results
    let results = !forceRefresh 
      ? scanCache.get<FarmResult[]>(CACHE_KEYS.SCAN_RESULTS) 
      : null;
    
    let vfatFetchedAt: string | null = null;
    let hlFetchedAt: string | null = null;
    let cacheHit = false;
    
    if (results) {
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
      
      if (vfatResult.error) {
        throw new Error(`VFAT API error: ${vfatResult.error}`);
      }
      
      results = analyzeAllFarms(vfatResult.farms, hlResult.perpSet);
      
      // If HL failed, add notes
      if (hlResult.error) {
        results = results.map(r => ({
          ...r,
          hedgeable: false,
          hedgeable_assets_on_hl: [],
          notes: [...(r.notes || []), 'HL unavailable; hedgeability unknown'],
        }));
      }
      
      // Cache results
      scanCache.set(CACHE_KEYS.SCAN_RESULTS, results);
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
      },
      data: sortedResults,
    };
    
    // Return as downloadable JSON
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `vfat-hl-scan-${timestamp}.json`;
    
    return new NextResponse(JSON.stringify(response, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
    
  } catch (err) {
    console.error('JSON export error:', err);
    
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 502 }
    );
  }
}
