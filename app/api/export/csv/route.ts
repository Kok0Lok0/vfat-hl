// GET /api/export/csv - Export scan results as CSV

import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { fetchFarms } from '@/lib/vfat';
import { fetchHlPerps } from '@/lib/hl';
import { analyzeAllFarms, filterResults, sortResults } from '@/lib/match';
import { scanCache, CACHE_KEYS } from '@/lib/cache';
import { FarmResult, ScanQueryParams } from '@/lib/types';

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

interface CsvRow {
  chain: string;
  protocol: string;
  pool_name: string;
  pair_symbols: string;
  non_major_assets: string;
  hedgeable_assets_on_hl: string;
  hedgeable: string;
  tvl: string;
  apy: string;
  url: string;
  confidence: string;
  farm_type: string;
}

function formatForCsv(results: FarmResult[]): CsvRow[] {
  return results.map(r => ({
    chain: r.chain,
    protocol: r.protocol,
    pool_name: r.pool_name,
    pair_symbols: r.pair_symbols.join(' / '),
    non_major_assets: r.non_major_assets.join(', '),
    hedgeable_assets_on_hl: r.hedgeable_assets_on_hl.join(', '),
    hedgeable: r.hedgeable ? 'Yes' : 'No',
    tvl: r.tvl !== undefined ? r.tvl.toLocaleString() : '',
    apy: r.apy !== undefined ? `${r.apy.toFixed(2)}%` : '',
    url: r.url || '',
    confidence: r.match_confidence,
    farm_type: r.farm_type,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const params = parseQueryParams(request);
    const forceRefresh = params.refresh;
    
    // Check for cached scan results
    let results = !forceRefresh 
      ? scanCache.get<FarmResult[]>(CACHE_KEYS.SCAN_RESULTS) 
      : null;
    
    if (!results) {
      // Fetch fresh data
      const [vfatResult, hlResult] = await Promise.all([
        fetchFarms(forceRefresh),
        fetchHlPerps(forceRefresh),
      ]);
      
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
          notes: [...(r.notes || []), 'HL unavailable'],
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
    
    // Convert to CSV format
    const csvData = formatForCsv(sortedResults);
    const csv = Papa.unparse(csvData, {
      header: true,
      columns: [
        'chain',
        'protocol',
        'pool_name',
        'pair_symbols',
        'non_major_assets',
        'hedgeable_assets_on_hl',
        'hedgeable',
        'tvl',
        'apy',
        'url',
        'confidence',
        'farm_type',
      ],
    });
    
    // Return CSV response
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `vfat-hl-scan-${timestamp}.csv`;
    
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
    
  } catch (err) {
    console.error('CSV export error:', err);
    
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 502 }
    );
  }
}
