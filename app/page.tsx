'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ScanResponse, FarmResult } from '@/lib/types';

// Format number with K/M/B suffixes
function formatNumber(num: number | undefined | null): string {
  if (num == null) return '—';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

// Format percentage
function formatPercent(num: number | undefined | null): string {
  if (num == null) return '—';
  return `${num.toFixed(2)}%`;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

// Confidence badge component
function ConfidenceBadge({ confidence }: { confidence: string }) {
  const colors = {
    high: 'badge-green',
    medium: 'badge-yellow',
    low: 'badge-red',
  };
  
  return (
    <span className={`badge ${colors[confidence as keyof typeof colors] || 'badge-gray'}`}>
      {confidence}
    </span>
  );
}

// Farm type badge
function FarmTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    lp_pair: 'LP',
    single: 'Single',
    multi: 'Multi',
    receipt_or_wrapper: 'Wrapper',
    unknown: '?',
  };
  
  return (
    <span className="badge badge-gray">
      {labels[type] || type}
    </span>
  );
}

// Hedgeable assets badges
function HedgeableBadges({ assets }: { assets: string[] }) {
  if (assets.length === 0) {
    return <span className="text-text-muted">—</span>;
  }
  
  return (
    <div className="flex flex-wrap gap-1">
      {assets.map((asset) => (
        <span key={asset} className="badge badge-green mono text-xs">
          {asset}
        </span>
      ))}
    </div>
  );
}

// Detail drawer/modal component
function FarmDetail({ farm, onClose }: { farm: FarmResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div 
        className="relative w-full max-w-md bg-bg-secondary border-l border-border-subtle h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Farm Details</h2>
            <button 
              onClick={onClose}
              className="p-1 hover:bg-bg-tertiary rounded"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="space-y-6">
            {/* Basic Info */}
            <section>
              <h3 className="text-sm font-medium text-text-secondary mb-3">Overview</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Chain</span>
                  <span className="mono">{farm.chain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Protocol</span>
                  <span>{farm.protocol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Pool</span>
                  <span className="mono">{farm.pool_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Type</span>
                  <FarmTypeBadge type={farm.farm_type} />
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">TVL</span>
                  <span className="mono">{formatNumber(farm.tvl)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">APY</span>
                  <span className="mono">{formatPercent(farm.apy)}</span>
                </div>
              </div>
            </section>
            
            {/* Token Analysis */}
            <section>
              <h3 className="text-sm font-medium text-text-secondary mb-3">Token Analysis</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-text-secondary block mb-1">Raw Symbols</span>
                  <div className="flex flex-wrap gap-1">
                    {farm.pair_symbols.map((s, i) => (
                      <span key={i} className="badge badge-gray mono">{s}</span>
                    ))}
                  </div>
                </div>
                
                <div>
                  <span className="text-text-secondary block mb-1">Normalized</span>
                  <div className="flex flex-wrap gap-1">
                    {farm.normalized_assets.map((s, i) => (
                      <span key={i} className="badge badge-gray mono">{s}</span>
                    ))}
                  </div>
                </div>
                
                {farm.excluded_assets.length > 0 && (
                  <div>
                    <span className="text-text-secondary block mb-1">Excluded (Majors)</span>
                    <div className="flex flex-wrap gap-1">
                      {farm.excluded_assets.map((s, i) => (
                        <span key={i} className="badge badge-gray mono text-text-muted">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                
                <div>
                  <span className="text-text-secondary block mb-1">Non-Major Assets</span>
                  {farm.non_major_assets.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {farm.non_major_assets.map((s, i) => (
                        <span key={i} className="badge badge-blue mono">{s}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-text-muted">None</span>
                  )}
                </div>
                
                <div>
                  <span className="text-text-secondary block mb-1">HL Hedgeable</span>
                  <HedgeableBadges assets={farm.hedgeable_assets_on_hl} />
                </div>
              </div>
            </section>
            
            {/* Confidence & Status */}
            <section>
              <h3 className="text-sm font-medium text-text-secondary mb-3">Status</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Hedgeable</span>
                  <span className={farm.hedgeable ? 'text-accent-green' : 'text-text-muted'}>
                    {farm.hedgeable ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Confidence</span>
                  <ConfidenceBadge confidence={farm.match_confidence} />
                </div>
                {farm.needs_unwrap && (
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">Needs Unwrap</span>
                    <span className="text-accent-yellow">Yes</span>
                  </div>
                )}
              </div>
            </section>
            
            {/* Notes */}
            {farm.notes && farm.notes.length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-text-secondary mb-3">Notes</h3>
                <ul className="text-sm text-text-secondary space-y-1">
                  {farm.notes.map((note, i) => (
                    <li key={i} className="pl-3 border-l-2 border-border-default">
                      {note}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            
            {/* Links */}
            <section className="flex flex-wrap gap-3">
              {farm.url && (
                <a
                  href={farm.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  <span>View on VFAT</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                </a>
              )}
              <a
                href={farm.hedgeable_assets_on_hl.length > 0
                  ? `https://app.hyperliquid.xyz/trade/${farm.hedgeable_assets_on_hl[0]}`
                  : 'https://app.hyperliquid.xyz'}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex items-center gap-2"
              >
                <span>View on HL</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                </svg>
              </a>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

type SortColumn = 'chain' | 'protocol' | 'pair' | 'hedgeable' | 'tvl' | 'apy' | 'confidence';
type SortDirection = 'asc' | 'desc';

function sortData(data: FarmResult[], column: SortColumn, direction: SortDirection): FarmResult[] {
  return [...data].sort((a, b) => {
    let cmp = 0;
    switch (column) {
      case 'chain':
        cmp = a.chain.localeCompare(b.chain);
        break;
      case 'protocol':
        cmp = a.protocol.localeCompare(b.protocol);
        break;
      case 'pair':
        cmp = a.pair_symbols.join('/').localeCompare(b.pair_symbols.join('/'));
        break;
      case 'hedgeable':
        cmp = a.hedgeable_assets_on_hl.length - b.hedgeable_assets_on_hl.length;
        break;
      case 'tvl':
        cmp = (a.tvl ?? 0) - (b.tvl ?? 0);
        break;
      case 'apy':
        cmp = (a.apy ?? 0) - (b.apy ?? 0);
        break;
      case 'confidence': {
        const order = { high: 3, medium: 2, low: 1 };
        cmp = (order[a.match_confidence] ?? 0) - (order[b.match_confidence] ?? 0);
        break;
      }
    }
    return direction === 'desc' ? -cmp : cmp;
  });
}

function SortHeader({ label, column, activeColumn, direction, onSort, className }: {
  label: string;
  column: SortColumn;
  activeColumn: SortColumn;
  direction: SortDirection;
  onSort: (col: SortColumn) => void;
  className?: string;
}) {
  const isActive = column === activeColumn;
  return (
    <th
      className={`cursor-pointer select-none hover:text-text-primary ${className || ''}`}
      onClick={() => onSort(column)}
    >
      {label} {isActive ? (direction === 'asc' ? '▲' : '▼') : ''}
    </th>
  );
}

export default function Home() {
  // State
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [onlyHedgeable, setOnlyHedgeable] = useState(true);
  const [minTvl, setMinTvl] = useState('10000');
  const [minApy, setMinApy] = useState('');

  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>('tvl');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Selected farm for detail view
  const [selectedFarm, setSelectedFarm] = useState<FarmResult | null>(null);

  // Debounced search
  const debouncedSearch = useDebounce(search, 300);

  const handleSort = useCallback((col: SortColumn) => {
    setSortColumn(prev => {
      if (prev === col) {
        setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        return col;
      }
      setSortDirection(col === 'tvl' || col === 'apy' || col === 'hedgeable' ? 'desc' : 'asc');
      return col;
    });
  }, []);

  const sortedData = useMemo(() => {
    if (!data) return [];
    return sortData(data.data, sortColumn, sortDirection);
  }, [data, sortColumn, sortDirection]);
  
  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (onlyHedgeable) params.set('onlyHedgeable', '1');
    if (minTvl) params.set('minTvl', minTvl);
    if (minApy) params.set('minApy', minApy);
    if (debouncedSearch) params.set('search', debouncedSearch);
    return params.toString();
  }, [onlyHedgeable, minTvl, minApy, debouncedSearch]);
  
  // Fetch data
  const fetchData = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams(queryParams);
      if (refresh) params.set('refresh', '1');
      
      const response = await fetch(`/api/scan?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result: ScanResponse = await response.json();
      setData(result);
      
      if (result.meta.error) {
        setError(result.meta.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);
  
  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Export handlers
  const handleExportCsv = () => {
    const params = new URLSearchParams(queryParams);
    window.open(`/api/export/csv?${params.toString()}`, '_blank');
  };
  
  const handleExportJson = () => {
    const params = new URLSearchParams(queryParams);
    window.open(`/api/export/json?${params.toString()}`, '_blank');
  };
  
  const handleRefresh = () => {
    fetchData(true);
  };
  
  return (
    <main className="min-h-screen p-6">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl font-bold mb-2">VFAT ↔ HL Hedgeability Scanner</h1>
        <p className="text-text-secondary text-sm">
          Scan DeFi farms and identify assets hedgeable on Hyperliquid perpetuals
        </p>
      </header>
      
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-6 pb-6 border-b border-border-subtle">
        {/* Search */}
        <div className="flex-1 min-w-[200px] max-w-[400px]">
          <input
            type="search"
            placeholder="Search token / protocol / chain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
        </div>
        
        {/* Only Hedgeable Toggle */}
        <label className="toggle flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyHedgeable}
            onChange={(e) => setOnlyHedgeable(e.target.checked)}
          />
          <span className="toggle-slider" />
          <span className="text-sm text-text-secondary">Only hedgeable</span>
        </label>
        
        {/* Min TVL */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">Min TVL</label>
          <input
            type="number"
            placeholder="0"
            value={minTvl}
            onChange={(e) => setMinTvl(e.target.value)}
            className="w-24"
          />
        </div>
        
        {/* Min APY */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">Min APY</label>
          <input
            type="number"
            placeholder="0"
            value={minApy}
            onChange={(e) => setMinApy(e.target.value)}
            className="w-24"
          />
        </div>
        
        {/* Spacer */}
        <div className="flex-1" />
        
        {/* Action buttons */}
        <button onClick={handleRefresh} className="btn-secondary flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </button>
        
        <button onClick={handleExportCsv} className="btn-secondary">
          CSV
        </button>
        
        <button onClick={handleExportJson} className="btn-secondary">
          JSON
        </button>
      </div>
      
      {/* Stats bar */}
      {data && (
        <div className="flex items-center gap-6 mb-4 text-sm text-text-secondary">
          <span>
            <span className="text-text-primary font-medium">{data.data.length}</span> farms shown
          </span>
          <span>
            <span className="text-text-primary font-medium">{data.meta.farmsHedgeable}</span> hedgeable
          </span>
          <span>
            <span className="text-text-primary font-medium">{data.meta.farmsTotal}</span> total
          </span>
          {data.meta.cacheHit && (
            <span className="badge badge-gray">cached</span>
          )}
          {data.meta.vfatFetchedAt && (
            <span className="text-text-muted text-xs">
              Last updated: {new Date(data.meta.vfatFetchedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
      
      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-accent-red/10 border border-accent-red/30 rounded text-sm text-accent-red">
          {error}
        </div>
      )}
      
      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="spinner" />
          <span className="ml-3 text-text-secondary">Loading farms...</span>
        </div>
      )}
      
      {/* Table */}
      {!loading && data && sortedData.length > 0 && (
        <div className="border border-border-subtle rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <SortHeader label="Chain" column="chain" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Protocol" column="protocol" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="Pair" column="pair" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="HL Hedgeable" column="hedgeable" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <SortHeader label="TVL" column="tvl" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="text-right" />
                  <SortHeader label="APY" column="apy" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="text-right" />
                  <SortHeader label="Confidence" column="confidence" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                  <th>Links</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((farm) => (
                  <tr
                    key={farm.farm_id}
                    className="cursor-pointer"
                    onClick={() => setSelectedFarm(farm)}
                  >
                    <td className="mono text-sm">{farm.chain}</td>
                    <td className="text-sm">{farm.protocol}</td>
                    <td className="mono text-sm">
                      {farm.pair_symbols.join(' / ')}
                    </td>
                    <td>
                      <HedgeableBadges assets={farm.hedgeable_assets_on_hl} />
                    </td>
                    <td className="text-right mono text-sm">
                      {formatNumber(farm.tvl)}
                    </td>
                    <td className="text-right mono text-sm">
                      {formatPercent(farm.apy)}
                    </td>
                    <td>
                      <ConfidenceBadge confidence={farm.match_confidence} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2 text-sm">
                        {farm.url && (
                          <a
                            href={farm.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-blue hover:underline"
                          >
                            VFAT
                          </a>
                        )}
                        <a
                          href={farm.hedgeable_assets_on_hl.length > 0
                            ? `https://app.hyperliquid.xyz/trade/${farm.hedgeable_assets_on_hl[0]}`
                            : 'https://app.hyperliquid.xyz'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-green hover:underline"
                        >
                          HL
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {!loading && data && sortedData.length === 0 && (
        <div className="text-center py-20 text-text-secondary">
          <p>No farms found matching your criteria.</p>
          <p className="text-sm mt-2">Try adjusting your filters or refresh the data.</p>
        </div>
      )}
      
      {/* Detail drawer */}
      {selectedFarm && (
        <FarmDetail 
          farm={selectedFarm} 
          onClose={() => setSelectedFarm(null)} 
        />
      )}
    </main>
  );
}
